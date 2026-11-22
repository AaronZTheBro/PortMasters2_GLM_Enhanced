"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GLOSSARY } from "@/lib/game/glossary";
import { cn } from "@/lib/utils";

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
  const body =
    content ??
    (term ? GLOSSARY[term] : undefined) ??
    (typeof children === "string" ? GLOSSARY[children] : undefined);
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
