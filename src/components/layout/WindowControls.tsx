import { Maximize2, Minus, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  closeAppWindow,
  minimizeAppWindow,
  toggleAppWindowMaximize,
} from "@/lib/tauri/window";
import { cn } from "@/lib/utils";

type WindowControlsProps = {
  isMacOS: boolean;
};

type WindowAction = () => Promise<void>;

function runWindowAction(action: WindowAction) {
  void action().catch((error: unknown) => {
    console.warn("Unable to perform the requested window action.", error);
  });
}

export function WindowControls({ isMacOS }: WindowControlsProps) {
  if (isMacOS) {
    return (
      <div className="flex items-center gap-2 px-3" aria-label="窗口操作">
        <TrafficLightButton
          label="关闭窗口"
          className="bg-window-close"
          onClick={() => runWindowAction(closeAppWindow)}
        >
          <X />
        </TrafficLightButton>
        <TrafficLightButton
          label="最小化窗口"
          className="bg-window-minimize"
          onClick={() => runWindowAction(minimizeAppWindow)}
        >
          <Minus />
        </TrafficLightButton>
        <TrafficLightButton
          label="最大化或还原窗口"
          className="bg-window-maximize"
          onClick={() => runWindowAction(toggleAppWindowMaximize)}
        >
          <Maximize2 />
        </TrafficLightButton>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center border-l px-1" aria-label="窗口操作">
      <StandardWindowButton
        label="最小化窗口"
        onClick={() => runWindowAction(minimizeAppWindow)}
      >
        <Minus data-icon="inline-start" />
      </StandardWindowButton>
      <StandardWindowButton
        label="最大化或还原窗口"
        onClick={() => runWindowAction(toggleAppWindowMaximize)}
      >
        <Maximize2 data-icon="inline-start" />
      </StandardWindowButton>
      <StandardWindowButton
        label="关闭窗口"
        onClick={() => runWindowAction(closeAppWindow)}
      >
        <X data-icon="inline-start" />
      </StandardWindowButton>
    </div>
  );
}

type TrafficLightButtonProps = {
  label: string;
  className: string;
  children: ReactNode;
  onClick: () => void;
};

function TrafficLightButton({
  label,
  className,
  children,
  onClick,
}: TrafficLightButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "group grid size-3 place-items-center rounded-full border border-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&_svg]:size-2 [&_svg]:stroke-[2.5] [&_svg]:text-background [&_svg]:opacity-0 hover:[&_svg]:opacity-80 focus-visible:[&_svg]:opacity-80",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

type StandardWindowButtonProps = {
  label: string;
  children: ReactNode;
  onClick: () => void;
};

function StandardWindowButton({ label, children, onClick }: StandardWindowButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
