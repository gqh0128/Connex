import { Pencil, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConnectionProfile } from "@/types/connections";

type ConnectionListItemProps = {
  connection: ConnectionProfile;
  isCollapsed: boolean;
  onConnect: () => void;
  onEdit: () => void;
};

export function ConnectionListItem({
  connection,
  isCollapsed,
  onConnect,
  onEdit,
}: ConnectionListItemProps) {
  const content = (
    <Button
      type="button"
      variant="ghost"
      size={isCollapsed ? "icon" : "sm"}
      aria-label={`连接 ${connection.name}`}
      onClick={onConnect}
      className={cn(
        "min-w-0",
        isCollapsed ? null : "h-9 flex-1 justify-start px-2 text-left",
      )}
    >
      {isCollapsed ? <Server data-icon="inline-start" /> : null}
      {isCollapsed ? null : <span className="truncate">{connection.name}</span>}
    </Button>
  );

  if (!isCollapsed) {
    return (
      <div className="group flex min-w-0 items-center rounded-md transition-colors hover:bg-accent focus-within:bg-accent">
        {content}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`编辑连接 ${connection.name}`}
              className="mr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
              onClick={onEdit}
            >
              <Pencil data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>编辑连接</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">连接 {connection.name}</TooltipContent>
    </Tooltip>
  );
}
