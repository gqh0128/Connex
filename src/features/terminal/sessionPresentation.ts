import type { SshSessionTab } from "./sessionTypes";

export type SessionTone = "muted" | "info" | "warning" | "success" | "error";

export type SessionPresentation = {
  label: string;
  detail: string | null;
  tone: SessionTone;
  isBusy: boolean;
};

export function getSessionPresentation(tab: SshSessionTab | null): SessionPresentation {
  if (!tab) {
    return {
      label: "未连接",
      detail: null,
      tone: "muted",
      isBusy: false,
    };
  }

  if (tab.startError) {
    return {
      label: "连接失败",
      detail: tab.startError.message,
      tone: "error",
      isBusy: false,
    };
  }

  if (tab.isStarting) {
    return {
      label: "正在启动 SSH",
      detail: null,
      tone: "info",
      isBusy: true,
    };
  }

  if (!tab.snapshot) {
    return {
      label: "正在准备终端",
      detail: null,
      tone: "info",
      isBusy: true,
    };
  }

  const { snapshot } = tab;
  switch (snapshot.state) {
    case "connecting":
      return {
        label: "正在连接",
        detail: `正在连接 ${snapshot.host}:${snapshot.port}`,
        tone: "info",
        isBusy: true,
      };
    case "verifyingHost":
      return {
        label: "等待主机确认",
        detail: "请核对服务器主机密钥指纹。",
        tone: "warning",
        isBusy: false,
      };
    case "authenticating":
      return {
        label: "正在认证",
        detail: `正在验证用户 ${snapshot.username}`,
        tone: "info",
        isBusy: true,
      };
    case "connected":
      return {
        label: "已连接",
        detail: `${snapshot.username}@${snapshot.host}:${snapshot.port}`,
        tone: "success",
        isBusy: false,
      };
    case "closing":
      return {
        label: "正在关闭",
        detail: null,
        tone: "muted",
        isBusy: true,
      };
    case "closed":
      return {
        label: "已关闭",
        detail: formatExitStatus(snapshot.exitStatus),
        tone: "muted",
        isBusy: false,
      };
    case "disconnected":
      return {
        label: "连接已断开",
        detail: formatExitStatus(snapshot.exitStatus),
        tone: "muted",
        isBusy: false,
      };
    case "error":
      if (snapshot.failure?.code === "connectionLost") {
        return {
          label: "连接已丢失",
          detail: snapshot.failure.message,
          tone: "error",
          isBusy: false,
        };
      }
      return {
        label: "连接失败",
        detail: snapshot.failure?.message ?? "SSH 会话发生未知错误。",
        tone: "error",
        isBusy: false,
      };
  }
}

function formatExitStatus(exitStatus: number | null) {
  return exitStatus === null ? null : `远程进程退出状态：${exitStatus}`;
}
