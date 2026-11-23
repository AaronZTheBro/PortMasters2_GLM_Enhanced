"use client";

import { ShipIcon } from "../../ShipVisualizer";
import { poolsFor } from "@/lib/game/engine/market";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { QuantityInput } from "@/components/ui/quantity-input";
import { productPriceRange } from "@/lib/game/pools";
import { COMMODITIES } from "@/lib/game/constants";
import { getOwnedAmount } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { itemColorResolver } from "@/lib/use-color-preference";
import {
  Anchor,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Handshake,
  Info,
  Lightbulb,
  Lock,
  PackageOpen,
  Scale,
  Sparkles,
  Star,
  Waves,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicUser } from "@/lib/api";
import type { BarterOffer } from "@/lib/use-barter";
import { Term } from "../../Term";
import { Avatar, ItemIcon } from "../../shared";
import { ReadyFooter, type Barter, type PhaseSync } from "./PhaseShared";

// Decorative helpers (no game logic)
// A rough decorative "fairness" estimate. Items get a representative gold
// value: Gold is 1 (it IS gold), commodities the midpoint of their port price
// band, products the midpoint of their sale band. Real trade value depends on
// ports, modules, and demand; this is only a visual hint, never shown as fact.
function itemValueEstimate(item: string, rulesVersion?: number): number {
  if (item === "Gold") return 1;
  const comm = COMMODITIES[item];
  if (comm) return (comm.basePrice[0] + comm.basePrice[1]) / 2;
  const prod = productPriceRange(item, rulesVersion);
  if (prod) return (prod[0] + prod[1]) / 2;
  return 4;
}

function fairnessRatio(
  offerItem: string,
  offerAmount: number,
  requestItem: string,
  requestAmount: number,
  rulesVersion?: number,
): number {
  const give = itemValueEstimate(offerItem, rulesVersion) * offerAmount;
  const take = itemValueEstimate(requestItem, rulesVersion) * requestAmount;
  if (take <= 0) return 0;
  return give / take;
}

function fairnessTone(ratio: number): {
  label: string;
  bar: string;
  text: string;
  chip: string;
} {
  if (ratio >= 0.9 && ratio <= 1.1)
    return {
      label: "Fair deal",
      bar: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-300",
      chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  if (ratio > 1.1 && ratio <= 1.5)
    return {
      label: "Generous",
      bar: "bg-teal-500",
      text: "text-teal-600 dark:text-teal-300",
      chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    };
  if (ratio > 1.5)
    return {
      label: "Very generous",
      bar: "bg-sky-500",
      text: "text-sky-600 dark:text-sky-300",
      chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    };
  if (ratio >= 0.6)
    return {
      label: "Asking a premium",
      bar: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-300",
      chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    };
  return {
    label: "Steep ask",
    bar: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-300",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  };
}

// Quick trade presets: clickable shortcuts that fill the form. Decorative and
// purely a UX nudge : they only set state, never call any engine function.
const QUICK_PRESETS: {
  give: string;
  giveN: number;
  want: string;
  wantN: number;
  tag: string;
}[] = [
  { give: "Hemp", giveN: 2, want: "Gold", wantN: 8, tag: "Sell Hemp" },
  { give: "Gold", giveN: 10, want: "Silk", wantN: 1, tag: "Buy Silk" },
  { give: "Gold", giveN: 12, want: "Tea", wantN: 1, tag: "Buy Tea" },
  { give: "Hemp", giveN: 4, want: "Silk", wantN: 1, tag: "Hemp→Silk" },
  { give: "Silk", giveN: 1, want: "Tea", wantN: 1, tag: "Silk↔Tea" },
  {
    give: "Gold",
    giveN: 20,
    want: "Linen Clothes",
    wantN: 1,
    tag: "Buy Linen",
  },
];

type FilterKind = "all" | "mine" | "direct" | "open";

// Recent activity records watch
// the live offers list and remember offers that vanish, since the only way an
// offer leaves the board is being accepted or cancelled. We can't tell those
// apart here without the onFulfilled hook, so we label them as "settled",
// which is accurate either way.
type HistoryEntry = {
  id: string;
  fromName: string;
  offerItem: string;
  offerAmount: number;
  requestItem: string;
  requestAmount: number;
  closedAt: number;
};

// Component
export function BarterPhase({
  game,
  barter,
  myUserId,
  phaseSync,
  members,
  colorFor,
}: {
  game: GameState;
  barter: Barter;
  myUserId: string;
  phaseSync: PhaseSync;
  members: PublicUser[];
  // Optional, falls back to the
  // plain COLORS lookup when a caller hasn't wired useColorPreference in.
  colorFor?: (item: string) => string | undefined;
}) {
  const resolveColor = itemColorResolver(colorFor);
  const pool = poolsFor(game);
  const items = ["Gold", ...pool.resources, ...pool.products];
  const [offerItem, setOfferItem] = useState<string>("Hemp");
  const [offerAmount, setOfferAmount] = useState(1);
  const [requestItem, setRequestItem] = useState<string>("Gold");
  const [requestAmount, setRequestAmount] = useState(1);
  // "" means an ordinary open offer, anyone in the harbor can see and
  // accept it. Any other value is another captain's user id: a direct
  // offer, visible only to the two of us, a safeguard against a third
  // captain accepting a trade someone else already agreed to first.
  const [targetUserId, setTargetUserId] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [showTips, setShowTips] = useState(false);

  const owned = getOwnedAmount(game, offerItem);
  const sameItem = offerItem === requestItem;
  const validAmounts =
    Number.isInteger(offerAmount) &&
    offerAmount >= 1 &&
    Number.isInteger(requestAmount) &&
    requestAmount >= 1;
  const canPost = !sameItem && validAmounts && offerAmount <= owned;
  const otherMembers = members.filter((m) => m.id !== myUserId);

  // New badge and post age tracking
  // BarterOffer has no timestamp; record the first client sighting
  // of each id as its post time. All derived
  // displays are decorative. Held in state rather than a
  // ref) so reading it during render is safe; the 1s tick below keeps the
  // "Xs ago" labels fresh without a new offer landing.
  const [firstSeen, setFirstSeen] = useState<Record<string, number>>({});
  const [, forceTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const liveIds = new Set(barter.offers.map((o) => o.id));
    // Deferred so this isn't a synchronous setState call inside the effect
    // body to avoid a synchronous state update.
    queueMicrotask(() => {
      setFirstSeen((prev) => {
        let changed = false;
        const next: Record<string, number> = {};
        for (const o of barter.offers) {
          if (prev[o.id] !== undefined) next[o.id] = prev[o.id];
          else {
            next[o.id] = now;
            changed = true;
          }
        }
        // Drop ids we no longer see so the record can't grow unbounded.
        for (const id of Object.keys(prev)) {
          if (!liveIds.has(id)) changed = true;
        }
        return changed ? next : prev;
      });
    });
  }, [barter.offers]);

  // Update once a second so post age labels and the new badge age out
  // without needing a new offer to land.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const previousOffers = useRef<BarterOffer[]>([]);
  useEffect(() => {
    const liveIds = new Set(barter.offers.map(({ id }) => id));
    const closed = previousOffers.current.filter(({ id }) => !liveIds.has(id));
    previousOffers.current = barter.offers;
    if (!closed.length) return;
    const closedAt = Date.now();
    queueMicrotask(() => {
      setHistory((entries) =>
        [...closed.map((offer) => ({ ...offer, closedAt })), ...entries].slice(
          0,
          4,
        ),
      );
    });
  }, [barter.offers]);

  async function submitOffer() {
    if (!canPost) return;
    if (
      await barter.post(
        offerItem,
        offerAmount,
        requestItem,
        requestAmount,
        targetUserId || undefined,
      )
    ) {
      setOfferAmount(1);
      setRequestAmount(1);
      setTargetUserId("");
    }
  }

  function applyPreset(p: (typeof QUICK_PRESETS)[number]) {
    setOfferItem(p.give);
    setOfferAmount(p.giveN);
    setRequestItem(p.want);
    setRequestAmount(p.wantN);
  }

  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

  // Filtered offer list
  const filteredOffers = useMemo(() => {
    switch (filter) {
      case "mine":
        return barter.offers.filter((o) => o.fromUserId === myUserId);
      case "direct":
        return barter.offers.filter((o) => Boolean(o.targetUserId));
      case "open":
        return barter.offers.filter((o) => !o.targetUserId);
      default:
        return barter.offers;
    }
  }, [barter.offers, filter, myUserId]);

  const ratio = fairnessRatio(
    offerItem,
    offerAmount,
    requestItem,
    requestAmount,
    game.rulesVersion,
  );
  const tone = fairnessTone(ratio);
  // Map a 0..2 ratio onto a 0..100 bar fill, clamped.
  const barPct = Math.max(4, Math.min(100, Math.round((ratio / 2) * 100)));
  // Marker at 50% (= ratio 1.0, an exactly even deal).
  const fairnessHint = !sameItem && validAmounts;

  const ownedRequest = getOwnedAmount(game, requestItem);
  const offerItemColor = resolveColor(offerItem);
  const requestItemColor = resolveColor(requestItem);

  return (
    <div className="max-w-3xl mx-auto relative">
      {/* Marketplace / harbor atmosphere: soft layered radial glows + a
          drifting wave strip. Purely decorative, behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] via-teal-500/[0.04] to-sky-500/[0.05]" />
        <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute bottom-0 inset-x-0 h-8 opacity-50 pm-wave-bar">
          <div className="h-full w-full bg-[repeating-linear-gradient(90deg,transparent_0_14px,oklch(0.55_0.12_195/0.18)_14px_18px)]" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-amber-500/20 blur-md" />
          <div className="relative grid place-items-center h-9 w-9 rounded-xl pm-grad-amber text-white shadow-md">
            <Handshake className="h-5 w-5" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 leading-tight">
            <Term term="Barter">Captain&apos;s Exchange</Term>
            <Sparkles className="h-3.5 w-3.5 text-amber-500/80" />
          </h2>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Anchor className="h-3 w-3" />
            Harbor marketplace · open to all captains in port
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Short on one good and sitting on too much of another? Post a swap for
        the rest of the harbor to see, or take someone else&apos;s.
      </p>

      {/* Post offer panel */}
      <div className="relative rounded-xl border border-teal-500/20 bg-teal-500/[0.03] p-4 mb-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <ShipIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Post an Offer
          </h3>
          {fairnessHint && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                tone.chip,
              )}
            >
              <Scale className="h-3 w-3" />
              {tone.label}
            </span>
          )}
        </div>

        {/* Trade flow: give card → arrow → receive card */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:gap-3 items-stretch">
          {/* Give side */}
          <div className="min-w-0 rounded-lg border border-black/10 dark:border-white/10 bg-background/70 p-2.5">
            <div className="text-[10px] tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
              <PackageOpen className="h-3 w-3" /> You give
            </div>
            <div className="flex items-center gap-2">
              <QuantityInput
                value={offerAmount}
                onCommit={setOfferAmount}
                min={1}
                aria-label="Amount to offer"
                className="h-9 w-16 shrink-0"
              />
              <select
                aria-label="Good to offer"
                value={offerItem}
                onChange={(e) => setOfferItem(e.target.value)}
                className={cn(selectClass, "flex-1 min-w-0")}
              >
                {items.map((it) => (
                  <option key={it} value={it}>
                    {it}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="mt-1.5 flex items-center justify-between rounded-md px-2 py-1 text-[11px]"
              style={{
                backgroundColor: offerItemColor
                  ? `color-mix(in srgb, ${offerItemColor} 10%, transparent)`
                  : "transparent",
              }}
            >
              <span
                className="flex items-center gap-1 font-medium"
                style={{ color: offerItemColor }}
              >
                <ItemIcon item={offerItem} className="h-3.5 w-3.5" />
                {offerItem}
              </span>
              <span className="text-muted-foreground">
                have <b className="text-foreground">{owned}</b>
              </span>
            </div>
          </div>

          {/* Arrow + fairness bar */}
          <div className="flex sm:flex-col items-center justify-center gap-1 py-1 sm:py-0">
            <div className="grid place-items-center h-7 w-7 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-300">
              <ArrowRight className="h-4 w-4 sm:hidden" />
              <ArrowRight className="h-4 w-4 hidden sm:block rotate-90" />
            </div>
            {fairnessHint && (
              <div className="hidden sm:flex flex-col items-center w-20">
                <div className="relative h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div
                    className={cn(
                      "absolute left-0 top-0 h-full rounded-full transition-all",
                      tone.bar,
                    )}
                    style={{ width: `${barPct}%` }}
                  />
                  {/* 50% marker = "fair" midpoint */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-px bg-foreground/40" />
                </div>
                <span
                  className={cn("text-[9px] mt-0.5 font-medium", tone.text)}
                >
                  {ratio.toFixed(2)}×
                </span>
              </div>
            )}
          </div>

          {/* Receive side */}
          <div className="min-w-0 rounded-lg border border-black/10 dark:border-white/10 bg-background/70 p-2.5">
            <div className="text-[10px] tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> You receive
            </div>
            <div className="flex items-center gap-2">
              <QuantityInput
                value={requestAmount}
                onCommit={setRequestAmount}
                min={1}
                aria-label="Amount to request"
                className="h-9 w-16 shrink-0"
              />
              <select
                aria-label="Good to request"
                value={requestItem}
                onChange={(e) => setRequestItem(e.target.value)}
                className={cn(selectClass, "flex-1 min-w-0")}
              >
                {items.map((it) => (
                  <option key={it} value={it}>
                    {it}
                  </option>
                ))}
              </select>
            </div>
            <div
              className="mt-1.5 flex items-center justify-between rounded-md px-2 py-1 text-[11px]"
              style={{
                backgroundColor: requestItemColor
                  ? `color-mix(in srgb, ${requestItemColor} 10%, transparent)`
                  : "transparent",
              }}
            >
              <span
                className="flex items-center gap-1 font-medium"
                style={{ color: requestItemColor }}
              >
                <ItemIcon item={requestItem} className="h-3.5 w-3.5" />
                {requestItem}
              </span>
              <span className="text-muted-foreground">
                have <b className="text-foreground">{ownedRequest}</b>
              </span>
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> Quick presets:
          </span>
          {QUICK_PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-full border border-black/10 dark:border-white/10 bg-background/60 hover:bg-teal-500/10 hover:border-teal-500/30 px-2 py-0.5 text-[10px] font-medium transition-colors"
            >
              {p.tag}
            </button>
          ))}
        </div>

        {/* Direct offer selector with avatars */}
        <div className="mt-2.5 rounded-lg border border-black/5 dark:border-white/10 bg-background/40 p-2">
          <div className="text-[10px] tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Direct this offer to…
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              type="button"
              onClick={() => setTargetUserId("")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium border transition-colors",
                targetUserId === ""
                  ? "bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-300"
                  : "bg-background/60 border-black/10 dark:border-white/10 hover:border-teal-500/30",
              )}
            >
              <Waves className="h-3 w-3" /> Anyone in harbor
            </button>
            {otherMembers.map((m) => {
              const active = targetUserId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTargetUserId(m.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 text-[11px] font-medium border transition-colors",
                    active
                      ? "bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-300"
                      : "bg-background/60 border-black/10 dark:border-white/10 hover:border-teal-500/30",
                  )}
                  title={`Direct offer to ${m.displayName} only`}
                >
                  <Avatar hue={m.avatarHue} name={m.displayName} size={18} />
                  {m.displayName}
                  {active && <Lock className="h-2.5 w-2.5" />}
                </button>
              );
            })}
          </div>
          {targetUserId && (
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Only{" "}
              <b className="text-foreground">
                {otherMembers.find((m) => m.id === targetUserId)?.displayName}
              </b>{" "}
              will see this offer. A safeguard so nobody else can take it first.
            </p>
          )}
        </div>

        {/* Errors inline (with shake) */}
        <AnimatePresence>
          {sameItem && (
            <motion.p
              key="same-item"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-[11px] text-rose-600 dark:text-rose-400 mt-2 pm-shake"
            >
              Pick two different items to barter.
            </motion.p>
          )}
          {!sameItem && offerAmount > owned && (
            <motion.p
              key="too-few"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-[11px] text-rose-600 dark:text-rose-400 mt-2 pm-shake"
            >
              You only have {owned} {offerItem}.
            </motion.p>
          )}
        </AnimatePresence>

        {/* Submit */}
        <div className="mt-3 flex justify-center">
          <Button
            className={cn(
              "rounded-lg gap-1.5",
              canPost && "pm-grad-emerald text-white",
            )}
            variant={canPost ? "default" : "secondary"}
            disabled={phaseSync.waiting || !canPost || barter.busy}
            onClick={submitOffer}
          >
            <Handshake className="h-4 w-4" />
            Post Offer
          </Button>
        </div>
      </div>

      {/* Network error toast (shake) */}
      <AnimatePresence>
        {barter.error && (
          <motion.div
            key={barter.error}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3.5 py-2 mb-4 text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between pm-shake"
          >
            <span>⚠️ {barter.error}</span>
            <button onClick={barter.clearError} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offers board */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 bg-background/50 p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <PackageOpen className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Open Offers
            <span className="rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">
              {barter.offers.length}
            </span>
          </h3>
          {/* Filter dropdown */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKind)}
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-[11px]"
              aria-label="Filter offers"
            >
              <option value="all">All offers</option>
              <option value="mine">My offers</option>
              <option value="direct">Direct only</option>
              <option value="open">Open only</option>
            </select>
          </div>
        </div>

        {barter.offers.length === 0 ? (
          // Empty state with illustration
          <div className="py-7 flex flex-col items-center text-center">
            <div className="relative mb-2">
              <div className="absolute inset-0 rounded-full bg-teal-500/10 blur-xl" />
              <div className="relative grid place-items-center h-14 w-14 rounded-full border border-dashed border-teal-500/40 text-teal-600 dark:text-teal-300">
                <ShipIcon className="h-6 w-6 pm-bob" />
              </div>
              <Waves className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-3 w-10 text-teal-500/40" />
            </div>
            <p className="text-xs font-medium">No offers on the board yet.</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Be the first captain to put a deal on the dock.
            </p>
          </div>
        ) : filteredOffers.length === 0 ? (
          <div className="py-4 text-center text-[11px] text-muted-foreground">
            No offers match this filter.
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {filteredOffers.map((o) => {
                const mine = o.fromUserId === myUserId;
                const canAfford =
                  getOwnedAmount(game, o.requestItem) >= o.requestAmount;
                const isDirect = Boolean(o.targetUserId);
                const target = isDirect
                  ? members.find((m) => m.id === o.targetUserId)
                  : null;
                const seenAt = firstSeen[o.id] ?? Date.now();
                const ageMs = Date.now() - seenAt;
                const isNew = ageMs < 10_000;
                const agoLabel =
                  ageMs < 60_000
                    ? `${Math.max(1, Math.round(ageMs / 1000))}s ago`
                    : `${Math.round(ageMs / 60_000)}m ago`;
                const offerColor = resolveColor(o.offerItem);
                const requestColor = resolveColor(o.requestItem);
                return (
                  <motion.div
                    key={o.id}
                    layout
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={cn(
                      "relative flex items-center justify-between rounded-lg px-3 py-2 text-xs border gap-2 overflow-hidden",
                      mine
                        ? "bg-amber-500/[0.06] border-amber-500/25"
                        : isDirect
                          ? "bg-teal-500/[0.06] border-teal-500/30"
                          : "bg-background/60 border-black/5 dark:border-white/10",
                    )}
                  >
                    {/* Left accent stripe in the offer item's hue */}
                    <span
                      className="absolute left-0 top-0 bottom-0 w-1"
                      style={{
                        backgroundColor: offerColor ?? "transparent",
                        opacity: 0.7,
                      }}
                      aria-hidden
                    />
                    <div className="flex items-center gap-1.5 flex-wrap pl-1">
                      {/* Poster avatar (or "You") */}
                      {mine ? (
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500/20 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                          You
                        </span>
                      ) : (
                        (() => {
                          const poster = members.find(
                            (m) => m.id === o.fromUserId,
                          );
                          if (!poster)
                            return (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-black/10 dark:bg-white/10 text-[9px] font-bold">
                                ?
                              </span>
                            );
                          return (
                            <Avatar
                              hue={poster.avatarHue}
                              name={poster.displayName}
                              size={20}
                            />
                          );
                        })()
                      )}
                      <span className="font-medium">
                        {mine ? "You" : o.fromName}
                      </span>
                      <span className="text-muted-foreground">offers</span>
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium"
                        style={{
                          color: offerColor,
                          backgroundColor: offerColor
                            ? `color-mix(in srgb, ${offerColor} 10%, transparent)`
                            : "transparent",
                        }}
                      >
                        <ItemIcon item={o.offerItem} className="h-3.5 w-3.5" />
                        {o.offerAmount} {o.offerItem}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium"
                        style={{
                          color: requestColor,
                          backgroundColor: requestColor
                            ? `color-mix(in srgb, ${requestColor} 10%, transparent)`
                            : "transparent",
                        }}
                      >
                        <ItemIcon
                          item={o.requestItem}
                          className="h-3.5 w-3.5"
                        />
                        {o.requestAmount} {o.requestItem}
                      </span>

                      {/* Direct badge with target avatar */}
                      {isDirect && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 dark:text-teal-300">
                          <Lock className="h-2.5 w-2.5" />
                          {mine ? (
                            <>
                              {target && (
                                <Avatar
                                  hue={target.avatarHue}
                                  name={target.displayName}
                                  size={14}
                                />
                              )}
                              Just for {o.targetName}
                            </>
                          ) : (
                            <>
                              <Star className="h-2.5 w-2.5" />
                              Just for you
                            </>
                          )}
                        </span>
                      )}
                      {isNew && (
                        <motion.span
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-rose-600 dark:text-rose-300"
                        >
                          <Sparkles className="h-2.5 w-2.5" /> New
                        </motion.span>
                      )}
                      {/* Post age indicator */}
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/80"
                        title="When you first saw this offer"
                      >
                        <Clock className="h-2.5 w-2.5" />
                        {agoLabel}
                      </span>
                    </div>
                    {mine ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2.5 text-[10px] rounded shrink-0"
                        disabled={phaseSync.waiting || barter.busy}
                        onClick={() => void barter.cancel(o.id)}
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className={cn(
                          "h-7 px-2.5 text-[10px] rounded shrink-0 gap-1",
                          canAfford && "pm-grad-primary text-white",
                        )}
                        variant={canAfford ? "default" : "secondary"}
                        disabled={
                          phaseSync.waiting || !canAfford || barter.busy
                        }
                        onClick={() => barter.accept(o.id)}
                      >
                        <Handshake className="h-3 w-3" />
                        Trade
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Recently closed offers */}
      {history.length > 0 && (
        <div className="rounded-xl border border-black/5 dark:border-white/10 bg-background/40 p-3 mb-4">
          <h3 className="text-[11px] font-semibold flex items-center gap-1.5 mb-1.5 text-muted-foreground">
            <Clock className="h-3 w-3" />
            Recently Closed Offers
          </h3>
          <div className="space-y-1">
            {history.map((h) => {
              const giveColor = resolveColor(h.offerItem);
              const takeColor = resolveColor(h.requestItem);
              const secs = Math.round((Date.now() - h.closedAt) / 1000);
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground font-medium">
                    <Clock className="h-3 w-3" /> closed
                  </span>
                  <span className="font-medium text-foreground">
                    {h.fromName}
                  </span>
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: giveColor }}
                  >
                    <ItemIcon item={h.offerItem} className="h-3 w-3" />
                    {h.offerAmount} {h.offerItem}
                  </span>
                  <ArrowRight className="h-2.5 w-2.5" />
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: takeColor }}
                  >
                    <ItemIcon item={h.requestItem} className="h-3 w-3" />
                    {h.requestAmount} {h.requestItem}
                  </span>
                  <span className="ml-auto text-[9px]">
                    {secs < 60
                      ? `${secs}s ago`
                      : `${Math.round(secs / 60)}m ago`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Barter tips */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] mb-4 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTips((s) => !s)}
          className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left"
        >
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Barter Tips
          </span>
          {showTips ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        <AnimatePresence initial={false}>
          {showTips && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <ul className="px-3.5 pb-3 text-[11px] space-y-1 text-muted-foreground">
                <li className="flex items-start gap-1.5">
                  <Star className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                  Post <b className="text-foreground">direct offers</b> when
                  you&apos;ve agreed a deal in chat. Only the named captain can
                  accept it.
                </li>
                <li className="flex items-start gap-1.5">
                  <Star className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                  Items are <b className="text-foreground">escrowed</b> the
                  moment you post. Cancel an offer to refund what you put up.
                </li>
                <li className="flex items-start gap-1.5">
                  <Star className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                  The fairness bar is a{" "}
                  <b className="text-foreground">rough hint</b> based on base
                  port prices. Real value depends on which port you&apos;ll sell
                  at next round.
                </li>
                <li className="flex items-start gap-1.5">
                  <Star className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                  Any offers still on the board when you sail are{" "}
                  <b className="text-foreground">refunded automatically</b>.
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ReadyFooter
        phaseSync={phaseSync}
        members={members}
        idleLabel="✅ Done Bartering, Continue"
        disabled={barter.busy}
        onConfirm={() => void phaseSync.markReady()}
      />
    </div>
  );
}
