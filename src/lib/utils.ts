import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Mobile keyboards and pasted text love to leave behind double spaces or a
// stray nonbreaking space, which show up as odd gaps once a room name is
// rendered. Collapse any run of whitespace down to one regular space and
// trim the ends so a messy paste still looks clean. Used both when a room
// is created and defensively wherever a name gets rendered, so any room
// named before this existed still displays cleanly.
export function normalizeRoomName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function formatGoldProceeds(amount: number): string {
  return `${amount < 0 ? "cost" : "proceeds"} ${Math.abs(amount)} Gold`;
}

export function formatReputation(amount: number): string {
  return amount < 0 ? `${Math.abs(amount)} below zero` : String(amount);
}

export function reputationActivityText(detail: string): string {
  return detail.replace(
    /^[-−]([\d,]+) Reputation$/i,
    "Reputation $1 below zero",
  );
}
