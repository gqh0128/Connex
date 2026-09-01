import { CaseSensitive, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasPrimaryShortcutModifier } from "@/lib/platform";
import { cn } from "@/lib/utils";

import type { TerminalSearchDirection } from "../terminalSearch";

type TerminalSearchBarProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  resultLabel: string;
  isCaseSensitive: boolean;
  canNavigate: boolean;
  onQueryChange: (query: string) => void;
  onCaseSensitiveChange: (isCaseSensitive: boolean) => void;
  onNavigate: (direction: TerminalSearchDirection) => void;
  onInputBlur: () => void;
  onClose: () => void;
};

export function TerminalSearchBar({
  inputRef,
  query,
  resultLabel,
  isCaseSensitive,
  canNavigate,
  onQueryChange,
  onCaseSensitiveChange,
  onNavigate,
  onInputBlur,
  onClose,
}: TerminalSearchBarProps) {
  return (
    <div
      role="search"
      aria-label="终端搜索"
      className="absolute top-3 right-4 z-20 w-[min(360px,calc(100%-32px))] rounded-md bg-popover shadow-lg"
    >
      <InputGroup size="sm" className="bg-popover">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          value={query}
          aria-label="搜索终端内容"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="搜索终端内容"
          onChange={(event) => onQueryChange(event.target.value)}
          onBlur={onInputBlur}
          onKeyDown={(event) => {
            if (
              hasPrimaryShortcutModifier(event) &&
              event.key.toLocaleLowerCase() === "f"
            ) {
              event.preventDefault();
              event.currentTarget.select();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onNavigate(event.shiftKey ? "previous" : "next");
            }
          }}
        />
        <InputGroupAddon align="inline-end" className="gap-0.5 pr-1">
          <span
            aria-live="polite"
            className="w-12 text-right text-[10px] tabular-nums text-muted-foreground"
          >
            {resultLabel}
          </span>
          <SearchAction
            label="区分大小写"
            isPressed={isCaseSensitive}
            onClick={() => onCaseSensitiveChange(!isCaseSensitive)}
          >
            <CaseSensitive data-icon="inline-start" />
          </SearchAction>
          <SearchAction
            label="上一个结果（Shift+Enter）"
            isDisabled={!canNavigate}
            onClick={() => onNavigate("previous")}
          >
            <ChevronUp data-icon="inline-start" />
          </SearchAction>
          <SearchAction
            label="下一个结果（Enter）"
            isDisabled={!canNavigate}
            onClick={() => onNavigate("next")}
          >
            <ChevronDown data-icon="inline-start" />
          </SearchAction>
          <SearchAction label="关闭搜索（Escape）" onClick={onClose}>
            <X data-icon="inline-start" />
          </SearchAction>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

type SearchActionProps = {
  label: string;
  isPressed?: boolean;
  isDisabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function SearchAction({
  label,
  isPressed,
  isDisabled,
  onClick,
  children,
}: SearchActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InputGroupButton
          size="icon-xs"
          aria-label={label}
          aria-pressed={isPressed}
          disabled={isDisabled}
          className={cn(isPressed && "bg-accent text-accent-foreground")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </InputGroupButton>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
