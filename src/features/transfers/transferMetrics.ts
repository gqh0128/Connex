import type { FileTransferTask } from "@/types/transfers";

import { TRANSFER_CONCURRENCY_LIMIT } from "./transferPolicy";

const NON_TERMINAL_STATUSES = new Set(["queued", "running", "retrying"]);

export function getTransferEtaSeconds(task: FileTransferTask) {
  if (task.status !== "running" || task.totalBytes === null) {
    return null;
  }

  const remainingBytes = Math.max(0, task.totalBytes - task.transferredBytes);
  if (remainingBytes === 0) {
    return 0;
  }
  if (task.bytesPerSecond <= 0) {
    return null;
  }

  return Math.ceil(remainingBytes / task.bytesPerSecond);
}

export function getQueueEtaSeconds(tasks: FileTransferTask[], now = Date.now()) {
  const pendingTasks = tasks.filter((task) => NON_TERMINAL_STATUSES.has(task.status));
  if (pendingTasks.length === 0) {
    return null;
  }
  if (pendingTasks.some((task) => task.isCancelling || task.isReleaseBlocked)) {
    return null;
  }
  if (pendingTasks.some((task) => task.totalBytes === null)) {
    return null;
  }
  if (
    pendingTasks.every(
      (task) => Math.max(0, (task.totalBytes ?? 0) - task.transferredBytes) === 0,
    )
  ) {
    return 0;
  }

  const representativeSpeed = getRepresentativeTaskSpeed(tasks);
  if (representativeSpeed === null) {
    return null;
  }

  const runningTasks = pendingTasks.filter((task) => task.status === "running");
  const waitingTasks = pendingTasks
    .filter((task) => task.status !== "running")
    .map((task) => {
      if (task.totalBytes === null) {
        return null;
      }
      if (task.status === "retrying" && task.nextRetryAt === null) {
        return null;
      }

      return {
        durationSeconds: task.totalBytes / representativeSpeed,
        queueOrder: task.queueOrder,
        releaseSeconds:
          task.status === "retrying"
            ? Math.max(0, ((task.nextRetryAt ?? now) - now) / 1_000)
            : 0,
      };
    });
  if (waitingTasks.some((task) => task === null)) {
    return null;
  }
  const slotLoads = runningTasks.map((task) => {
    if (task.totalBytes === null) {
      return null;
    }

    const remainingBytes = Math.max(0, task.totalBytes - task.transferredBytes);
    if (remainingBytes === 0) {
      return 0;
    }
    if (task.bytesPerSecond <= 0) {
      return null;
    }

    return remainingBytes / task.bytesPerSecond;
  });

  if (slotLoads.some((load) => load === null)) {
    return null;
  }

  const numericSlotLoads = slotLoads as number[];
  while (numericSlotLoads.length < TRANSFER_CONCURRENCY_LIMIT) {
    numericSlotLoads.push(0);
  }

  const remainingTasks = waitingTasks as WaitingTaskEstimate[];
  while (remainingTasks.length > 0) {
    const nextSlotIndex = indexOfMinimum(numericSlotLoads);
    let slotAvailableAt = numericSlotLoads[nextSlotIndex];
    let nextTaskIndex = indexOfNextReleasedTask(remainingTasks, slotAvailableAt);
    if (nextTaskIndex === -1) {
      slotAvailableAt = Math.max(
        slotAvailableAt,
        Math.min(...remainingTasks.map((task) => task.releaseSeconds)),
      );
      nextTaskIndex = indexOfNextReleasedTask(remainingTasks, slotAvailableAt);
    }

    const [nextTask] = remainingTasks.splice(nextTaskIndex, 1);
    numericSlotLoads[nextSlotIndex] =
      Math.max(slotAvailableAt, nextTask.releaseSeconds) + nextTask.durationSeconds;
  }

  return Math.ceil(Math.max(...numericSlotLoads));
}

type WaitingTaskEstimate = {
  durationSeconds: number;
  queueOrder: number;
  releaseSeconds: number;
};

export function sortTransferTasks(tasks: FileTransferTask[]) {
  return [...tasks].sort((left, right) => {
    const statusDifference = statusRank(left) - statusRank(right);
    if (statusDifference !== 0) {
      return statusDifference;
    }

    if (left.status === "running") {
      return (left.startedAt ?? left.createdAt) - (right.startedAt ?? right.createdAt);
    }

    if (left.status === "queued" || left.status === "retrying") {
      return left.queueOrder - right.queueOrder;
    }

    return (right.finishedAt ?? right.createdAt) - (left.finishedAt ?? left.createdAt);
  });
}

function getRepresentativeTaskSpeed(tasks: FileTransferTask[]) {
  const runningSpeeds = tasks
    .filter((task) => task.status === "running" && task.bytesPerSecond > 0)
    .map((task) => task.bytesPerSecond);
  const observedSpeeds =
    runningSpeeds.length > 0
      ? runningSpeeds
      : tasks
          .filter((task) => task.status === "completed" && task.bytesPerSecond > 0)
          .sort(
            (left, right) =>
              (right.finishedAt ?? right.createdAt) -
              (left.finishedAt ?? left.createdAt),
          )
          .slice(0, TRANSFER_CONCURRENCY_LIMIT)
          .map((task) => task.bytesPerSecond);

  if (observedSpeeds.length === 0) {
    return null;
  }

  return (
    observedSpeeds.reduce((total, speed) => total + speed, 0) / observedSpeeds.length
  );
}

function indexOfMinimum(values: number[]) {
  let minimumIndex = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] < values[minimumIndex]) {
      minimumIndex = index;
    }
  }
  return minimumIndex;
}

function indexOfNextReleasedTask(
  tasks: WaitingTaskEstimate[],
  slotAvailableAt: number,
) {
  let selectedIndex = -1;
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (
      task.releaseSeconds <= slotAvailableAt &&
      (selectedIndex === -1 || task.queueOrder < tasks[selectedIndex].queueOrder)
    ) {
      selectedIndex = index;
    }
  }
  return selectedIndex;
}

function statusRank(task: FileTransferTask) {
  switch (task.status) {
    case "running":
      return 0;
    case "retrying":
      return 1;
    case "queued":
      return 2;
    case "failed":
      return 3;
    case "completed":
    case "cancelled":
      return 4;
  }
}
