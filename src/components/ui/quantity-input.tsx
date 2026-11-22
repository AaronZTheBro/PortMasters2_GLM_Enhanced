"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Keeps an editable string while focused and commits a finite clamped integer
 * on blur or Enter. Empty intermediate input never reaches callers. Text input
 * with numeric input mode avoids browser coercion while retaining touch keys.
 */
export function QuantityInput({
  value,
  onCommit,
  min = 1,
  max,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const editing = useRef(false);

  // Sync external values only while the user is not editing.
  useEffect(() => {
    if (!editing.current) setDraft(String(value));
  }, [value]);

  function commit(raw: string) {
    editing.current = false;
    const parsed = Number.parseInt(raw, 10);
    let next = Number.isFinite(parsed) ? parsed : value;
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      value={draft}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => {
        editing.current = true;
        // Digits only, but the empty string is explicitly allowed so the
        // field can be cleared and retyped.
        setDraft(e.target.value.replace(/[^0-9]/g, ""));
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit((e.target as HTMLInputElement).value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(className)}
    />
  );
}
