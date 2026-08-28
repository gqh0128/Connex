import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConnectionProfile } from "@/types/connections";

type ConnectionListItemProps = {
  connection: ConnectionProfile;
  onConnect: () => void;
  onEdit: () => void;
};

export function ConnectionListItem({
  connection,
  onConnect,
  onEdit,
}: ConnectionListItemProps) {
  return (
    <div className="group flex min-w-0 items-center rounded-md transition-colors hover:bg-accent focus-within:bg-accent">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`打开连接 ${connection.name}`}
        className="min-w-0 flex-1 justify-start text-left"
        title="双击连接"
        onClick={(event) => {
          if (event.detail === 0) {
            onConnect();
          }
        }}
        onDoubleClick={onConnect}
      >
        <span className="truncate">{connection.name}</span>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`编辑连接 ${connection.name}`}
            className="mr-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
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
