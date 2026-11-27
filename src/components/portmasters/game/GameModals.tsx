"use client";

import { displayLedgerLine } from "@/lib/game/engine/lifecycle";
import { ShipIcon, TextWithShipIcons } from "../ShipVisualizer";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_NAME } from "@/lib/game/constants";
import { difficultyConfig, type Difficulty } from "@/lib/game/difficulty";
import {
  classicHarbor,
  harborTrading,
  expanded,
  rebalanced,
  type Specialty,
} from "@/lib/game/expansion";
import {
  guideTabs,
  tipsGroups,
  tutorialSteps,
  type CalloutTone,
} from "@/lib/game/guide";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  unlockedProducts,
  unlockedResources,
  unlockedWorkerTypes,
} from "@/lib/game/pools";
import type { GameState } from "@/lib/game/types";
import { phaseLabel, whisperCost } from "@/lib/game/engine";
import { describeWhisperCargo } from "@/lib/game/broker-whispers";
import { brokerOfferItem } from "@/lib/game/engine/market";
import { intelPurchaseCount } from "@/lib/game/engine/orders";
import type { PlayerDetailData } from "@/lib/use-player-detail";
import type { PublicUser } from "@/lib/api";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import { cn, formatReputation } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import { Avatar, Pill, ItemIcon } from "../shared";
import { CaptainLegacyCard } from "../CaptainLegacyCard";
import {
  Sparkles,
  BookOpen,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Coins,
  Trophy,
  Loader2,
  Eye,
  RotateCcw,
  Bell,
  BellOff,
} from "lucide-react";
import type { NotificationItem } from "@/lib/use-notifications";

// Tone specific class lookup for the callout boxes used inside the guide
// and tips sections. Each tone maps to a (background, border, text) tuple so
// a single className string can be composed from one source of truth.
const CALLOUT_CLASSES: Record<CalloutTone, string> = {
  info: "bg-sky-500/10 border-sky-500/25 text-sky-700 dark:text-sky-300",
  warning:
    "bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300",
  success:
    "bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300",
  danger: "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300",
};

function CalloutBox({ tone, text }: { tone: CalloutTone; text: string }) {
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed",
        CALLOUT_CLASSES[tone],
      )}
    >
      {text}
    </div>
  );
}

function GuideSectionCard({
  section,
}: {
  section: ReturnType<typeof guideTabs>[number]["sections"][number];
}) {
  return (
    <section className="rounded-xl border border-black/5 dark:border-white/10 bg-background/60 p-4">
      <header className="flex items-center gap-2.5 mb-2.5">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-base shrink-0"
          aria-hidden
        >
          <TextWithShipIcons>{section.icon}</TextWithShipIcons>
        </span>
        <h4 className="text-sm font-semibold leading-tight">{section.title}</h4>
      </header>
      {section.intro && (
        <p className="text-[12.5px] leading-relaxed text-foreground/80 mb-2.5">
          {section.intro}
        </p>
      )}
      {section.bullets && (
        <ul className="space-y-1.5">
          {section.bullets.map((b, i) => (
            <li
              key={i}
              className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/80"
            >
              <span
                className="mt-1.5 h-1 w-1 rounded-full bg-teal-500/70 shrink-0"
                aria-hidden
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {section.cargo && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {section.cargo.map((item) => (
            <li key={item} className="rounded-full border px-2 py-1">
              <ItemIcon item={item} /> {item}
            </li>
          ))}
        </ul>
      )}
      {section.callout && (
        <CalloutBox tone={section.callout.tone} text={section.callout.text} />
      )}
    </section>
  );
}

export function GuideModal({
  open,
  onOpenChange,
  difficulty,
  rulesVersion,
  specialties,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  difficulty: Difficulty;
  rulesVersion?: number;
  specialties?: Specialty[];
}) {
  const tabs = useMemo(
    () => guideTabs(difficulty, rulesVersion, specialties),
    [difficulty, rulesVersion, specialties],
  );
  // Tabs needs a controlled value to survive difficulty changes. Rather
  // than resetting state in an effect (which triggers cascading renders
  // and trips the state update lint rule), we keep the user's
  // chosen tab id in state and derive the effective value: if their
  // saved tab is no longer in the new list (because difficulty removed
  // it), fall back to the first tab. This is the recommended React
  // "adjust state during render" pattern.
  const [savedTab, setSavedTab] = useState<string>(tabs[0]?.id ?? "overview");
  const activeTab = tabs.some((t) => t.id === savedTab)
    ? savedTab
    : (tabs[0]?.id ?? "overview");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            Navigation Guide
          </DialogTitle>
          <DialogDescription>
            {APP_NAME} rules and shortcuts. Skim a tab, then close and get back
            to the helm.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setSavedTab} className="gap-3">
          <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1 p-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex-1 min-w-[5.5rem] gap-1.5 px-2 py-1.5 text-xs"
              >
                <span aria-hidden>{tab.emoji}</span>
                <span className="truncate">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="max-h-[60vh] overflow-y-auto pm-scroll pr-1 -mr-1">
            {tabs.map((tab) => (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="mt-0 space-y-3"
              >
                <p className="text-[12px] text-muted-foreground px-1">
                  {tab.blurb}
                </p>
                {tab.sections.map((section, i) => (
                  <GuideSectionCard key={i} section={section} />
                ))}
              </TabsContent>
            ))}
          </div>
        </Tabs>
        <div className="flex justify-end pt-2 border-t border-black/5 dark:border-white/10">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TipsModal({
  open,
  onOpenChange,
  difficulty,
  rulesVersion,
  specialties,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  difficulty: Difficulty;
  rulesVersion?: number;
  specialties?: Specialty[];
}) {
  const groups = useMemo(
    () => tipsGroups(difficulty, rulesVersion, specialties),
    [difficulty, rulesVersion, specialties],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Trade Strategy Advice
          </DialogTitle>
          <DialogDescription>
            Review practical ways to avoid bankruptcy throughout the voyage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {groups.map((group, gi) => (
            <section
              key={gi}
              className="rounded-xl border border-black/5 dark:border-white/10 bg-background/60 p-3.5"
            >
              <header className="flex items-center gap-2.5 mb-2">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-sm shrink-0"
                  aria-hidden
                >
                  {group.icon}
                </span>
                <h4 className="text-sm font-semibold leading-tight">
                  {group.title}
                </h4>
              </header>
              <ol className="space-y-1.5">
                {group.items.map((item, ii) => (
                  <li
                    key={ii}
                    className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/80"
                  >
                    <span
                      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 shrink-0 mt-0.5"
                      aria-hidden
                    >
                      {ii + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <div className="flex justify-end pt-2 border-t border-black/5 dark:border-white/10">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The notification button's "expand" target: every ledger digest, harbor
 * chat message, and direct message that's arrived this session, newest
 * first. Only one ever shows as a floating bubble at a time (see
 * NotificationCenter.tsx); this is where the rest still are. A Dialog
 * here instead of a dropdown anchored to the button reuses the same
 * open/close pattern every other modal in this file already has, rather
 * than inventing custom outside click and positioning logic.
 */
export function NotificationHistoryModal({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: NotificationItem[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            Notifications
          </DialogTitle>
          <DialogDescription className="sr-only">
            Every ledger update, harbor message, and direct message this session
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-10">
              <BellOff className="h-6 w-6" /> Nothing yet this voyage.
            </div>
          ) : (
            <div className="space-y-2 pr-2">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    n.onActivate?.();
                    onOpenChange(false);
                  }}
                  className={cn(
                    "w-full text-left rounded-xl px-3.5 py-2.5 border border-black/5 dark:border-white/10 bg-background/50 transition-colors",
                    n.onActivate && "hover:border-teal-500/40 cursor-pointer",
                  )}
                >
                  <div className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                    <span className="text-base">{n.icon}</span> {n.title}
                    <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                      {new Date(n.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {n.lines.map((line, i) => (
                      <div
                        key={i}
                        className="text-[12.5px] text-foreground/80 leading-snug break-words"
                      >
                        {n.fromLedger ? (
                          <TextWithShipIcons>
                            {displayLedgerLine(line)}
                          </TextWithShipIcons>
                        ) : (
                          line
                        )}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RumorBoardModal({
  open,
  onOpenChange,
  game,
  onBuy,
  locked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  game: GameState;
  onBuy: (item?: string) => void;
  locked: boolean;
}) {
  const classic = classicHarbor(game);
  const count = intelPurchaseCount(game);
  const bundleBought =
    harborTrading(game) && Boolean(game.effectUses?.broker_bundle);
  const cost = whisperCost(game);
  const canBuy = !locked && game.phase === 1 && count > 0 && game.money >= cost;
  const broker = difficultyConfig(game.difficulty);
  const [requested, setRequested] = useState("");
  const selected = game.phase2DemandTags.includes(requested)
    ? requested
    : classic
      ? ""
      : brokerOfferItem(game);
  const leakProtected = expanded(game) && game.modifierFlags.false_colors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Broker's Rumor Board
          </DialogTitle>
          <DialogDescription>
            {classic
              ? "Each whisper reveals the exact terms of one buyer already on the board."
              : "Each rumor guarantees one buyer for the named good and port in Phase 2."}
          </DialogDescription>
        </DialogHeader>
        {rebalanced(game) &&
          count > 0 &&
          game.phase === 1 &&
          game.phase2DemandTags.length > 0 && (
            <label className="grid min-w-0 gap-1 text-sm">
              {classic ? "Prefer cargo when available" : "Request a buyer for"}
              <select
                className="min-w-0 rounded-md border bg-background p-2"
                value={selected}
                onChange={(event) => setRequested(event.target.value)}
              >
                {classic && <option value="">Any buyer</option>}
                {game.phase2DemandTags
                  .slice()
                  .sort()
                  .map((item) => (
                    <option key={item} value={item}>
                      {item} ({game.inventory[item] ?? 0} held)
                    </option>
                  ))}
              </select>
            </label>
          )}
        <div className="flex justify-center my-2">
          <Button
            className="pm-grad-gold text-amber-950 rounded-xl"
            onClick={() => onBuy(selected || undefined)}
            disabled={!canBuy}
          >
            {bundleBought
              ? "Bundle purchased this round"
              : count === 0
                ? "No rumors available"
                : `Buy ${count} ${count === 1 ? "rumor" : "rumors"} for ${cost} Gold`}
          </Button>
        </div>
        {game.phase === 1 && broker.brokerCorruption && (
          <p className="text-center text-xs text-muted-foreground">
            {leakProtected
              ? "False Colors blocks the added raid risk this round."
              : game.brokerTippedPirates
                ? "A leak already raised raid risk this round."
                : `Each paid bundle has a ${Math.round(broker.brokerCorruptionChance * 100)}% chance to raise raid risk by ${Math.round(broker.brokerCorruptionRisk * 100)} percentage points.`}
          </p>
        )}
        <div className="rounded-lg border border-teal-500/15 bg-teal-500/[0.04] p-3.5 min-h-[110px]">
          {game.revealedIntel.length ? (
            <>
              <div className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-1.5">
                📜 Revealed Rumors:
              </div>
              {game.revealedIntel.map((i, idx) => (
                <div key={idx} className="text-[13px] py-0.5">
                  <strong>{classic ? "Revealed" : "Guaranteed"}</strong> ·{" "}
                  {i.port} wants <ItemIcon item={i.item} />{" "}
                  {describeWhisperCargo(i)}
                  {i.reward !== undefined
                    ? ` for ${i.reward} Gold before costs.`
                    : ""}
                </div>
              ))}
            </>
          ) : (
            <div className="text-muted-foreground text-center py-5 text-sm">
              {classic && count === 0 && game.phase === 1
                ? "You already know every buyer on this board."
                : "You have no Broker whispers this round."}
            </div>
          )}
        </div>
        <div className="flex justify-end mt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close Board
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Host only confirmation before a restart goes out over the wire. A
 * restart resets every captain currently in the harbor back to round one,
 * not just whoever clicks the button, and opens the room to new joins again,
 * so it's worth one extra click to make sure that's actually intended.
 */
export function RestartConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-rose-600 dark:text-rose-400" />{" "}
            Restart the voyage?
          </DialogTitle>
          <DialogDescription>
            Every captain currently in this harbor goes back to round one: gold,
            cargo, workers, and ship upgrades all reset. The harbor also
            reopens, so new captains can join again. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Restart for Everyone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TutorialModal({
  open,
  onOpenChange,
  difficulty,
  rulesVersion,
  specialties,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  difficulty: Difficulty;
  rulesVersion?: number;
  specialties?: Specialty[];
}) {
  const [step, setStep] = useState(0);
  const steps = useMemo(
    () => tutorialSteps(difficulty, rulesVersion, specialties),
    [difficulty, rulesVersion, specialties],
  );
  const total = steps.length;
  const s = steps[step];
  const pct = Math.round(((step + 1) / total) * 100);
  const isLast = step === total - 1;

  function close() {
    setStep(0);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setStep(0);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base leading-tight pr-6">
            <TextWithShipIcons>{s.title}</TextWithShipIcons>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Tutorial step {step + 1} of {total}
          </DialogDescription>
        </DialogHeader>
        <Progress value={pct} className="h-1.5 mb-4" />
        <div
          className="text-[13.5px] leading-relaxed text-foreground/90 min-h-[160px] [&_p]:mb-2 [&_div]:mb-1"
          dangerouslySetInnerHTML={{ __html: s.content }}
        />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-3 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <span className="justify-self-center whitespace-nowrap text-[11px] text-muted-foreground">
            {step + 1} of {total}
          </span>
          {isLast ? (
            <Button
              size="sm"
              className="justify-self-end pm-grad-primary text-white"
              onClick={close}
            >
              <ShipIcon /> Set Sail!
            </Button>
          ) : (
            <Button
              size="sm"
              className="justify-self-end pm-grad-primary text-white"
              onClick={() => setStep((s) => s + 1)}
            >
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="text-center mt-2">
          <button
            onClick={close}
            className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground underline underline-offset-2"
          >
            Skip tutorial
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One stat, its own tile instead of a pill sharing a row with three
// others. Reused for every number the profile leads with (Gold,
// Reputation, Ship Level), so a future stat is one more tile, not a
// rework of a cramped row.
function ProfileStatTile({
  icon,
  value,
  label,
  toneClassName,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  toneClassName: string;
}) {
  return (
    <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.05] py-2 text-center">
      <div
        className={cn(
          "text-sm font-semibold flex items-center justify-center gap-1",
          toneClassName,
        )}
      >
        {icon} {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

/**
 * The "click a collapsed roster bar, see everything" popup. Doubles as a
 * bankrupt captain's spectator window. There is no separate view only
 * board, watching the rest of the room just means opening their popups.
 *
 * Laid out as a profile: an identity header, a headline stat row, Renown
 * underneath it, then cargo/workers and modules/log side by side. The
 * previous version stacked seven separate boxes in one narrow column
 * inside a wide dialog, tightly packed text top to bottom while using
 * barely half the available width; this uses the width instead.
 */
export function PlayerDetailModal({
  open,
  onOpenChange,
  player,
  isMe,
  detail,
  loading,
  legacy,
  difficulty,
  rulesVersion,
  specialties,
  colorFor,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  player: PublicUser | null;
  isMe: boolean;
  detail: PlayerDetailData | null | undefined;
  loading: boolean;
  legacy: CaptainLegacySummary | null | undefined;
  // The viewer's own tier. Difficulty is room wide, so this correctly
  // describes any captain in the harbor without adding it to the payload.
  difficulty: Difficulty;
  rulesVersion?: number;
  specialties?: Specialty[];
  // Optional, falls back to the
  // plain COLORS lookup when a caller hasn't wired useColorPreference in.
  colorFor?: (item: string) => string | undefined;
}) {
  const resolveColor = itemColorResolver(colorFor);
  // Only artisans this voyage has actually unlocked, and each group reports
  // how many are trained. Difficulty is a room property so the viewer's own
  // tier is authoritative for everyone; the round comes from the subject's own
  // payload, so a captain a checkpoint behind is still described correctly.
  const workerGroups = detail
    ? unlockedWorkerTypes(difficulty, detail.round, rulesVersion).map((w) => {
        const list = detail.workers?.[w.id] ?? [];
        return {
          icon: w.icon,
          name: w.plural,
          list,
          skilled: list.filter((x) => x.isSkilled).length,
        };
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {player && (
                <Avatar
                  hue={player.avatarHue}
                  name={player.displayName}
                  size={44}
                />
              )}
              <div>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {player?.displayName ?? "Captain"}
                  {isMe && (
                    <span className="text-xs text-muted-foreground font-normal">
                      (you)
                    </span>
                  )}
                </DialogTitle>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {detail
                    ? phaseLabel({
                        phase: detail.phase,
                        currentRound: detail.round,
                      })
                    : loading
                      ? "Loading…"
                      : "Unavailable"}
                </div>
              </div>
            </div>
            {detail?.phase === "bankruptcy" && (
              <Pill tone="rose" className="shrink-0">
                💥 Bankrupt, spectating
              </Pill>
            )}
            {detail?.phase === "endgame" && (
              <Pill tone="amber" className="shrink-0">
                🏁 Voyage complete
              </Pill>
            )}
          </div>
          <DialogDescription className="sr-only">
            Detailed voyage status
          </DialogDescription>
        </DialogHeader>

        {!detail ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-10">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Asking the harbor
                master…
              </>
            ) : (
              "Not available right now, they may have stepped away."
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Headline: this voyage's numbers, each in its own tile
                instead of a row of pills competing for space. */}
            <div className="grid grid-cols-3 gap-2">
              <ProfileStatTile
                icon={<Coins className="h-3.5 w-3.5" />}
                value={detail.money}
                label="Gold"
                toneClassName="text-emerald-600 dark:text-emerald-400"
              />
              <ProfileStatTile
                icon={<Trophy className="h-3.5 w-3.5" />}
                value={formatReputation(detail.score)}
                label="Reputation"
                toneClassName="text-amber-600 dark:text-amber-400"
              />
              <ProfileStatTile
                icon={<ShipIcon className="h-3.5 w-3.5" />}
                value={detail.shipLevel}
                label="Ship Level"
                toneClassName="text-teal-600 dark:text-teal-400"
              />
            </div>

            {/* Renown is server side, account wide data (see
                src/lib/game/legacy.ts), so it's shown independently of
                the live cargo/workers/log below, which relies on that
                captain's own client relaying it back and can be
                unavailable if they've stepped away. */}
            {legacy && <CaptainLegacyCard legacy={legacy} compact />}

            {/* Body: cargo and workers on the left, modules and the log
                on the right, instead of four boxes stacked one under
                the other in a single narrow column. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              <div className="space-y-3.5">
                <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    📦 Cargo
                  </h4>
                  <div className="grid grid-cols-2 gap-x-4">
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground mb-1">
                        Raw Materials
                      </div>
                      {unlockedResources(
                        difficulty,
                        detail.round,
                        rulesVersion,
                        specialties,
                      ).map((r) => (
                        <div
                          key={r}
                          className="flex items-center text-[12px] py-0.5"
                        >
                          <ItemIcon item={r} className="mr-1.5 h-3.5 w-3.5" />
                          <span
                            className="flex-1"
                            style={{ color: resolveColor(r) }}
                          >
                            {r}
                          </span>
                          <b style={{ color: resolveColor(r) }}>
                            {detail.inventory[r] || 0}
                          </b>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground mb-1">
                        Finished Goods
                      </div>
                      {unlockedProducts(
                        difficulty,
                        detail.round,
                        rulesVersion,
                        specialties,
                      ).map((r) => (
                        <div
                          key={r}
                          className="flex items-center text-[12px] py-0.5"
                        >
                          <ItemIcon item={r} className="mr-1.5 h-3.5 w-3.5" />
                          <span
                            className="flex-1"
                            style={{ color: resolveColor(r) }}
                          >
                            {r}
                          </span>
                          <b style={{ color: resolveColor(r) }}>
                            {detail.inventory[r] || 0}
                          </b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 dark:border-white/10 p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    👥 Workers
                  </h4>
                  {workerGroups.every((g) => g.list.length === 0) ? (
                    <p className="text-xs text-muted-foreground">
                      No artisans hired yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {workerGroups
                        .filter((g) => g.list.length > 0)
                        .map((g) => (
                          <div key={g.name}>
                            <div className="text-[11px] font-semibold mb-1">
                              {g.icon} {g.name} ({g.list.length})
                            </div>
                            {g.list.map((w, i) => (
                              <div
                                key={i}
                                className="text-[11px] text-muted-foreground"
                              >
                                {w.task
                                  ? `Working: ${w.task}${w.isSkilled ? " ⭐" : ""}`
                                  : `Idle${w.isSkilled ? " ⭐" : ""}`}
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="rounded-xl border border-black/10 dark:border-white/10 p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    🔧 Equipped Modules
                  </h4>
                  {detail.equippedModules.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No modules installed.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {detail.equippedModules.map((m) => (
                        <div key={m.id} className="text-[12px]">
                          <TextWithShipIcons>{m.icon}</TextWithShipIcons>{" "}
                          <strong>{m.name}</strong>: {m.desc}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-black/10 dark:border-white/10 p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> Recent Log
                  </h4>
                  <ScrollArea className="h-40 pr-2">
                    {detail.logs.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 italic">
                        Nothing logged yet.
                      </p>
                    ) : (
                      <div className="space-y-0.5 font-mono text-[11px] leading-relaxed">
                        {detail.logs.map((l, i) => (
                          <div
                            key={i}
                            className="whitespace-pre-wrap break-words"
                          >
                            <TextWithShipIcons>
                              {displayLedgerLine(l)}
                            </TextWithShipIcons>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
