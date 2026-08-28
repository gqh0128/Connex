import { KeyRound, Pencil, Server } from "lucide-react";

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
      aria-label={isCollapsed ? `连接 ${connection.name}` : undefined}
      onClick={onConnect}
      className={cn(
        "min-w-0",
        isCollapsed ? null : "h-auto w-full justify-start px-2 py-2 text-left",
      )}
    >
      <Server data-icon="inline-start" />
      {isCollapsed ? null : (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{connection.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {connection.username}@{connection.host}:{connection.port}
          </span>
        </div>
      )}
      {!isCollapsed ? (
        connection.authenticationMethod === "privateKey" ? (
          <KeyRound data-icon="inline-end" aria-label="私钥认证" />
        ) : null
      ) : null}
    </Button>
  );

  if (!isCollapsed) {
    return (
      <div className="group relative min-w-0">
        {content}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`编辑连接 ${connection.name}`}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 bg-sidebar opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
      <TooltipContent side="right">
        连接 {connection.name} · {connection.username}@{connection.host}
      </TooltipContent>
    </Tooltip>
  );
}
