"use client";

import { createContext, useContext, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { glossaryEntry } from "@/lib/game/glossary";
import { cn } from "@/lib/utils";

export const VoyageGlossary = createContext<number | undefined>(undefined);

export function Term({
  children,
  term,
  content,
  className,
}: {
  children: React.ReactNode;
  term?: string;
  content?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rulesVersion = useContext(VoyageGlossary);
  const body =
    content ??
    (term ? glossaryEntry(term, rulesVersion) : undefined) ??
    (typeof children === "string"
      ? glossaryEntry(children, rulesVersion)
      : undefined);
  if (!body) return <>{children}</>;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "cursor-help text-left underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring",
            className,
          )}
          onClick={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{body}</TooltipContent>
    </Tooltip>
  );
}
