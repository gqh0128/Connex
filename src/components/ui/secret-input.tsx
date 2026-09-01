import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SecretInputProps = {
  id: string;
  value: string;
  placeholder: string;
  secretLabel: string;
  ariaInvalid: boolean;
  disabled?: boolean;
  size?: "default" | "sm";
  autoComplete?: string;
  onChange: (value: string) => void;
  onRevealStored?: () => Promise<string | null>;
};

export function SecretInput({
  id,
  value,
  placeholder,
  secretLabel,
  ariaInvalid,
  disabled = false,
  size = "default",
  autoComplete = "new-password",
  onChange,
  onRevealStored,
}: SecretInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [revealedStoredValue, setRevealedStoredValue] = useState<string | null>(null);
  const isRevealActiveRef = useRef(false);
  const revealRequestRef = useRef(0);
  const displayValue = value || revealedStoredValue || "";

  useEffect(() => {
    return () => {
      isRevealActiveRef.current = false;
      revealRequestRef.current += 1;
    };
  }, []);

  const startReveal = async () => {
    if (disabled || isRevealActiveRef.current) {
      return;
    }

    isRevealActiveRef.current = true;
    setIsVisible(true);

    if (value || revealedStoredValue !== null || !onRevealStored) {
      return;
    }

    const requestId = ++revealRequestRef.current;
    try {
      const secret = await onRevealStored();
      if (isRevealActiveRef.current && revealRequestRef.current === requestId) {
        setRevealedStoredValue(secret);
      }
    } catch {
      if (isRevealActiveRef.current && revealRequestRef.current === requestId) {
        setRevealedStoredValue(null);
      }
    }
  };

  const stopReveal = () => {
    isRevealActiveRef.current = false;
    revealRequestRef.current += 1;
    setIsVisible(false);
    setRevealedStoredValue(null);
  };

  const label = isVisible ? `隐藏${secretLabel}` : `悬停或聚焦显示${secretLabel}`;
  const Icon = isVisible ? EyeOff : Eye;

  return (
    <InputGroup size={size} data-disabled={disabled}>
      <InputGroupInput
        id={id}
        type={isVisible ? "text" : "password"}
        autoComplete={autoComplete}
        value={displayValue}
        placeholder={placeholder}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onChange={(event) => {
          setRevealedStoredValue(null);
          onChange(event.target.value);
        }}
      />
      <InputGroupAddon align="inline-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <InputGroupButton
              size="icon-xs"
              aria-label={label}
              disabled={disabled}
              className="opacity-0 transition-opacity group-focus-within/input-group:opacity-100 group-hover/input-group:opacity-100"
              onPointerEnter={() => void startReveal()}
              onPointerLeave={stopReveal}
              onFocus={() => void startReveal()}
              onBlur={stopReveal}
            >
              <Icon data-icon="inline-start" />
            </InputGroupButton>
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      </InputGroupAddon>
    </InputGroup>
  );
}
