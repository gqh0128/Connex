import { KeyRound, Server } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConnectionProfile } from "@/types/connections";

type ConnectionListItemProps = {
  connection: ConnectionProfile;
  isCollapsed: boolean;
  onEdit: () => void;
};

export function ConnectionListItem({
  connection,
  isCollapsed,
  onEdit,
}: ConnectionListItemProps) {
  const content = (
    <Button
      type="button"
      variant="ghost"
      size={isCollapsed ? "icon" : "sm"}
      aria-label={isCollapsed ? `编辑连接 ${connection.name}` : undefined}
      onClick={onEdit}
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
      {!isCollapsed && connection.authenticationMethod === "privateKey" ? (
        <KeyRound data-icon="inline-end" aria-label="私钥认证" />
      ) : null}
    </Button>
  );

  if (!isCollapsed) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">
        {connection.name} · {connection.username}@{connection.host}
      </TooltipContent>
    </Tooltip>
  );
}
