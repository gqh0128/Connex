import { Minus, Plus } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { getCommandError } from "@/lib/tauri/errors";

type MetricDirection = "increase" | "decrease";

type TerminalMetricSettingsFieldProps = {
  id: string;
  label: string;
  description: ReactNode;
  value: number;
  min: number;
  max: number;
  maxLength: number;
  inputMode: "numeric" | "decimal";
  suffix: ReactNode;
  isDisabled: boolean;
  externalError: string | null;
  isDraftAllowed: (draft: string) => boolean;
  normalize: (value: number) => number;
  format: (value: number) => string;
  adjust: (value: number, direction: MetricDirection) => number;
  onValueChange: (value: number) => Promise<void>;
};

export function TerminalMetricSettingsField({
  id,
  label,
  description,
  value,
  min,
  max,
  maxLength,
  inputMode,
  suffix,
  isDisabled,
  externalError,
  isDraftAllowed,
  normalize,
  format,
  adjust,
  onValueChange,
}: TerminalMetricSettingsFieldProps) {
  const [draft, setDraft] = useState(() => format(value));
  const [localError, setLocalError] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  const displayedError = localError ?? externalError;
  const descriptionId = `${id}-description`;

  const save = async (candidate: number) => {
    if (isSavingRef.current) {
      return;
    }

    const nextValue = normalize(candidate);
    setDraft(format(nextValue));
    setLocalError(null);
    if (nextValue === value) {
      return;
    }

    isSavingRef.current = true;
    try {
      await onValueChange(nextValue);
    } catch (nextError: unknown) {
      setDraft(format(value));
      setLocalError(getCommandError(nextError).message);
    } finally {
      isSavingRef.current = false;
    }
  };

  const saveDraft = () => {
    const parsed = Number(draft);
    if (!draft || !Number.isFinite(parsed)) {
      setDraft(format(value));
      return;
    }
    void save(parsed);
  };

  return (
    <Field
      orientation="responsive"
      className="p-4"
      data-disabled={isDisabled}
      data-invalid={Boolean(displayedError)}
    >
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
        <FieldError>{displayedError}</FieldError>
      </FieldContent>

      <div className="w-36 min-w-36 max-w-36 shrink-0">
        <InputGroup
          size="sm"
          data-disabled={isDisabled}
          className="w-36 min-w-36 max-w-36"
        >
          <div className="w-10 shrink-0">
            <InputGroupInput
              id={id}
              type="text"
              inputMode={inputMode}
              maxLength={maxLength}
              value={draft}
              disabled={isDisabled}
              aria-invalid={Boolean(displayedError)}
              aria-describedby={descriptionId}
              className="px-1 text-center"
              onChange={(event) => {
                if (isDraftAllowed(event.target.value)) {
                  setDraft(event.target.value);
                }
              }}
              onBlur={saveDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  setDraft(format(value));
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <InputGroupAddon className="shrink-0 gap-0 py-0 pl-0 has-[>button]:ml-0">
            <InputGroupButton
              size="icon-xs"
              className="shrink-0"
              disabled={isDisabled || value <= min}
              aria-label={`减小${label}`}
              onClick={() => void save(adjust(value, "decrease"))}
            >
              <Minus data-icon="inline-start" />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupAddon
            align="inline-end"
            className="w-[calc(100%-4rem)] min-w-[calc(100%-4rem)] max-w-[calc(100%-4rem)] shrink-0 gap-0 py-0 pr-0 has-[>button]:mr-0"
          >
            <InputGroupText className="min-w-0 flex-1 justify-center whitespace-nowrap">
              {suffix}
            </InputGroupText>
            <InputGroupButton
              size="icon-xs"
              className="shrink-0"
              disabled={isDisabled || value >= max}
              aria-label={`增大${label}`}
              onClick={() => void save(adjust(value, "increase"))}
            >
              <Plus data-icon="inline-start" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </Field>
  );
}
