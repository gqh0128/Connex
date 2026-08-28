import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SidebarToggleButtonProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export function SidebarToggleButton({
  isCollapsed,
  onToggle,
}: SidebarToggleButtonProps) {
  const label = isCollapsed ? "展开连接侧栏" : "收起连接侧栏";
  const Icon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-controls="connection-sidebar"
          aria-expanded={!isCollapsed}
          className="w-6"
          onClick={onToggle}
        >
          <Icon data-icon="inline-start" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
