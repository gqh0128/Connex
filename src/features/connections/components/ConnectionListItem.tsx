import { KeyRound, Server } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ConnectionProfile } from "@/types/connections";

type ConnectionListItemProps = {
  connection: ConnectionProfile;
  isCollapsed: boolean;
};

export function ConnectionListItem({
  connection,
  isCollapsed,
}: ConnectionListItemProps) {
  const content = (
    <div
      className={cn(
        "flex min-w-0 items-center rounded-md text-sm text-foreground",
        isCollapsed ? "size-8 justify-center" : "gap-2 px-2 py-2",
      )}
    >
      <Server className="size-4 shrink-0 text-muted-foreground" />
      {isCollapsed ? null : (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{connection.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {connection.username}@{connection.host}:{connection.port}
          </span>
        </div>
      )}
      {!isCollapsed && connection.authenticationMethod === "privateKey" ? (
        <KeyRound
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label="私钥认证"
        />
      ) : null}
    </div>
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
