"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Anchor,
  Shield,
  Zap,
  Package,
  Cog,
  Sparkles,
  Wrench,
  Gauge,
  Crown,
  Heart,
  Wind,
} from "lucide-react";
import type { Module } from "@/lib/game/constants";
import { cn } from "@/lib/utils";

// Types
export type ShipVisualizerProps = {
  shipLevel: number; // 0, 1, or 2
  equippedModules: Module[];
  compact?: boolean; // Smaller version used in Status and Shipyard.
  cargoFill?: number; // Cargo fullness from zero to one.
  crewCount?: number; // number of workers aboard
};

// Module icon mapping : maps module IDs to lucide icons for the slot badges
const MODULE_ICON_MAP: Record<string, React.ElementType> = {
  smugglers_hold: Shield,
  bulk_hauler: Package,
  artisans_workshop: Wrench,
  tax_evasion: Cog,
  silk_monopoly: Sparkles,
  brokers_network: Gauge,
  salvage_crane: Cog,
  overdrive_engine: Zap,
  bureau_token: Shield,
  kiln_cellar: Sparkles,
  ocean_relay: Gauge,
  foreign_quarter_pass: Shield,
  persian_dome_compass: Anchor,
  fleet_of_treasures: Package,
};

function getModuleIcon(id: string): React.ElementType {
  return MODULE_ICON_MAP[id] ?? Cog;
}

// Shared palette
const HULL = "#7C3AED";
const SAIL = "#F59E0B";
const ACCENT = "#14B8A6";
const RIGGING = "#A78BFA";
const CRATE = "#B45309";
const CRATE_DARK = "#78350F";
const CREW = "#FBBF24";

// Animated water ripples : concentric ellipses expanding outward below the hull
function Ripples() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.ellipse
          key={i}
          cx={100}
          cy={110}
          fill="none"
          stroke={ACCENT}
          strokeWidth={0.8}
          initial={{ opacity: 0, rx: 14, ry: 2 }}
          animate={{
            opacity: [0, 0.5, 0],
            rx: [14, 42, 68],
            ry: [2, 5, 7],
          }}
          transition={{
            duration: 3.6,
            repeat: Infinity,
            delay: i * 1.2,
            ease: "easeOut",
          }}
        />
      ))}
    </>
  );
}

// Wake trail : animated streaks trailing behind the stern (right side)
function WakeTrail() {
  return (
    <g>
      {[0, 1, 2, 3].map((i) => (
        <motion.path
          key={i}
          d={`M ${162 + i * 5} ${107 - i * 1.5} q 10 -1 18 0`}
          fill="none"
          stroke={ACCENT}
          strokeWidth={0.7}
          strokeLinecap="round"
          initial={{ opacity: 0, pathLength: 0 }}
          animate={{
            opacity: [0, 0.55, 0],
            pathLength: [0, 1, 1],
          }}
          transition={{
            duration: 2.4,
            repeat: Infinity,
            delay: i * 0.6,
            ease: "easeInOut",
          }}
        />
      ))}
    </g>
  );
}

// Wind lines drift left behind the ship.
function WindIndicator() {
  return (
    <g opacity={0.5}>
      {[0, 1, 2].map((i) => (
        <motion.g
          key={i}
          animate={{ x: [0, -4, 0], opacity: [0.2, 0.7, 0.2] }}
          transition={{
            duration: 2.4 + i * 0.3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.4,
          }}
        >
          <line
            x1={148}
            y1={16 + i * 4}
            x2={160}
            y2={16 + i * 4}
            stroke={ACCENT}
            strokeWidth={0.8}
            strokeLinecap="round"
          />
        </motion.g>
      ))}
    </g>
  );
}

// Cargo crates on deck : count scales with cargoFill and ship level
function CargoCrates({
  level,
  cargoFill,
}: {
  level: number;
  cargoFill: number;
}) {
  const maxCrates = level === 0 ? 2 : level === 1 ? 4 : 6;
  const fill = Math.max(0, Math.min(1, cargoFill));
  const count = Math.round(fill * maxCrates);
  if (count === 0) return null;
  const deckY = level === 0 ? 88 : level === 1 ? 80 : 72;
  const startX = level === 0 ? 84 : level === 1 ? 76 : 68;
  const stepX = level === 0 ? 9 : 8;
  const w = 5;
  const h = 4;
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => (
        <motion.rect
          key={i}
          x={startX + i * stepX}
          y={deckY - h}
          width={w}
          height={h}
          rx={0.6}
          fill={CRATE}
          stroke={CRATE_DARK}
          strokeWidth={0.3}
          initial={{ opacity: 0, y: deckY - h - 5 }}
          animate={{ opacity: 1, y: deckY - h }}
          transition={{
            delay: 0.3 + i * 0.06,
            type: "spring",
            stiffness: 300,
            damping: 18,
          }}
        />
      ))}
    </g>
  );
}

// Crew figures : small dots on deck representing workers aboard
function CrewFigures({
  level,
  crewCount,
}: {
  level: number;
  crewCount: number;
}) {
  const count = Math.min(Math.max(0, Math.floor(crewCount)), 6);
  if (count === 0) return null;
  const deckY = level === 0 ? 86 : level === 1 ? 78 : 70;
  const startX = level === 0 ? 78 : level === 1 ? 70 : 62;
  const stepX = 6;
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => (
        <motion.circle
          key={i}
          cx={startX + i * stepX}
          cy={deckY}
          r={1.4}
          fill={CREW}
          stroke={CRATE_DARK}
          strokeWidth={0.2}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.4 + i * 0.05,
            type: "spring",
            stiffness: 400,
            damping: 15,
          }}
          style={{
            transformOrigin: `${startX + i * stepX}px ${deckY}px`,
          }}
        />
      ))}
    </g>
  );
}

// Ship SVG : Chinese junk / merchant ship with animated decorations and
// morphing level transitions
function ShipSVG({
  level,
  cargoFill,
  crewCount,
  className,
}: {
  level: number;
  cargoFill: number;
  crewCount: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 120"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Static water lines (always present) */}
      <path
        d="M10 108 Q30 103 50 108 Q70 113 90 108 Q110 103 130 108 Q150 113 170 108 Q190 103 200 108"
        fill="none"
        stroke={ACCENT}
        strokeWidth="1.5"
        opacity="0.5"
      />
      <path
        d="M0 112 Q25 107 50 112 Q75 117 100 112 Q125 107 150 112 Q175 117 200 112"
        fill="none"
        stroke={ACCENT}
        strokeWidth="1"
        opacity="0.3"
      />

      {/* Animated ripples below the hull */}
      <Ripples />

      {/* Wake trail behind the stern */}
      <WakeTrail />

      {/* Wind indicator lines */}
      <WindIndicator />

      {/* Hull + sails (morphs on level change via AnimatePresence) */}
      <AnimatePresence mode="wait">
        <motion.g
          key={level}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          style={{ transformOrigin: "center", transformBox: "fill-box" }}
        >
          {level === 0 && (
            <>
              {/* Small junk hull */}
              <path
                d="M60 100 L55 85 Q57 78 70 76 L130 76 Q143 78 145 85 L140 100 Q100 106 60 100Z"
                fill={HULL}
                opacity="0.9"
              />
              {/* Bow taper */}
              <path
                d="M55 85 L42 80 Q44 75 50 76 L57 78"
                fill={HULL}
                opacity="0.85"
              />
              {/* Stern rise */}
              <path
                d="M145 85 L155 80 Q157 75 152 74 L130 76"
                fill={HULL}
                opacity="0.85"
              />
              {/* Single mast & sail */}
              <line
                x1="100"
                y1="76"
                x2="100"
                y2="30"
                stroke={RIGGING}
                strokeWidth="2"
              />
              <path d="M100 32 L118 50 L100 68Z" fill={SAIL} opacity="0.85" />
              <path d="M100 32 L82 50 L100 68Z" fill={SAIL} opacity="0.65" />
            </>
          )}

          {level === 1 && (
            <>
              {/* Medium hull : wider and taller */}
              <path
                d="M45 100 L38 80 Q42 70 60 67 L140 67 Q158 70 162 80 L155 100 Q100 108 45 100Z"
                fill={HULL}
                opacity="0.9"
              />
              {/* Bow */}
              <path
                d="M38 80 L24 74 Q28 66 36 67 L42 70"
                fill={HULL}
                opacity="0.85"
              />
              {/* Stern with raised poop deck */}
              <path
                d="M162 80 L172 74 Q176 64 168 60 L140 67"
                fill={HULL}
                opacity="0.85"
              />
              {/* Poop deck railing */}
              <line
                x1="148"
                y1="63"
                x2="167"
                y2="61"
                stroke={RIGGING}
                strokeWidth="1"
                opacity="0.6"
              />
              {/* Main mast & sail */}
              <line
                x1="90"
                y1="67"
                x2="90"
                y2="22"
                stroke={RIGGING}
                strokeWidth="2"
              />
              <path d="M90 24 L112 44 L90 62Z" fill={SAIL} opacity="0.85" />
              <path d="M90 24 L68 44 L90 62Z" fill={SAIL} opacity="0.6" />
              {/* Fore mast & sail */}
              <line
                x1="55"
                y1="70"
                x2="55"
                y2="38"
                stroke={RIGGING}
                strokeWidth="1.5"
              />
              <path d="M55 40 L70 52 L55 64Z" fill={SAIL} opacity="0.75" />
              {/* Batten (horizontal boom) */}
              <line
                x1="70"
                y1="67"
                x2="130"
                y2="67"
                stroke={RIGGING}
                strokeWidth="1"
                opacity="0.5"
              />
              {/* Decorative hull stripe */}
              <path
                d="M48 90 Q100 95 152 90"
                fill="none"
                stroke={ACCENT}
                strokeWidth="1.5"
                opacity="0.5"
              />
            </>
          )}

          {level === 2 && (
            <>
              {/* Large hull : widest and most ornate */}
              <path
                d="M35 100 L28 78 Q34 65 55 60 L145 60 Q166 65 172 78 L165 100 Q100 110 35 100Z"
                fill={HULL}
                opacity="0.9"
              />
              {/* Bow with figurehead */}
              <path
                d="M28 78 L14 70 Q20 58 30 58 L34 65"
                fill={HULL}
                opacity="0.85"
              />
              {/* Figurehead curl */}
              <circle cx="12" cy="68" r="3" fill={ACCENT} opacity="0.7" />
              {/* Stern : tall poop deck with cabin */}
              <path
                d="M172 78 L182 70 Q188 55 178 50 L145 60"
                fill={HULL}
                opacity="0.85"
              />
              {/* Cabin windows */}
              <circle cx="158" cy="55" r="2" fill={SAIL} opacity="0.6" />
              <circle cx="166" cy="53" r="2" fill={SAIL} opacity="0.6" />
              <circle cx="174" cy="52" r="2" fill={SAIL} opacity="0.5" />
              {/* Railing */}
              <line
                x1="148"
                y1="56"
                x2="180"
                y2="50"
                stroke={RIGGING}
                strokeWidth="1"
                opacity="0.5"
              />
              {/* Main mast & large sail */}
              <line
                x1="95"
                y1="60"
                x2="95"
                y2="14"
                stroke={RIGGING}
                strokeWidth="2.5"
              />
              <path d="M95 16 L120 38 L95 56Z" fill={SAIL} opacity="0.85" />
              <path d="M95 16 L70 38 L95 56Z" fill={SAIL} opacity="0.6" />
              {/* Fore mast & sail */}
              <line
                x1="55"
                y1="65"
                x2="55"
                y2="30"
                stroke={RIGGING}
                strokeWidth="2"
              />
              <path d="M55 32 L74 46 L55 60Z" fill={SAIL} opacity="0.8" />
              <path d="M55 32 L40 44 L55 58Z" fill={SAIL} opacity="0.55" />
              {/* Mizzen mast (aft) & lateen sail */}
              <line
                x1="130"
                y1="62"
                x2="130"
                y2="38"
                stroke={RIGGING}
                strokeWidth="1.5"
              />
              <path d="M130 40 L145 50 L130 58Z" fill={SAIL} opacity="0.7" />
              {/* Batten */}
              <line
                x1="48"
                y1="60"
                x2="140"
                y2="60"
                stroke={RIGGING}
                strokeWidth="1"
                opacity="0.4"
              />
              {/* Double hull stripe (decorative) */}
              <path
                d="M38 88 Q100 94 162 88"
                fill="none"
                stroke={ACCENT}
                strokeWidth="1.5"
                opacity="0.5"
              />
              <path
                d="M40 92 Q100 97 160 92"
                fill="none"
                stroke={SAIL}
                strokeWidth="1"
                opacity="0.3"
              />
              {/* Dragon eye bow ornament */}
              <circle cx="18" cy="66" r="2.5" fill={ACCENT} opacity="0.8" />
              <circle cx="18" cy="66" r="1" fill={HULL} opacity="0.9" />
            </>
          )}
        </motion.g>
      </AnimatePresence>

      {/* Cargo crates on deck (rendered after hull so they appear on top) */}
      <CargoCrates level={level} cargoFill={cargoFill} />

      {/* Crew figures on deck */}
      <CrewFigures level={level} crewCount={crewCount} />
    </svg>
  );
}

// Module slot positions : arranged around the hull like RPG equipment slots
function getSlotPositions(
  count: number,
  compact: boolean,
): { x: number; y: number }[] {
  // Base positions for up to 3 slots, arranged around the ship silhouette
  const scale = compact ? 0.8 : 1;
  const basePositions = [
    // Left of hull (port side)
    { x: -28 * scale, y: -8 },
    // Right of hull (starboard side)
    { x: 28 * scale, y: -8 },
    // Bottom center (keel)
    { x: 0, y: 22 },
  ];
  return basePositions.slice(0, count);
}

// Main component
export function ShipVisualizer({
  shipLevel,
  equippedModules,
  compact = false,
  cargoFill = 0,
  crewCount = 0,
}: ShipVisualizerProps) {
  const maxModules = shipLevel; // ship level = max module slots
  const moduleCount = equippedModules.length;
  const size = compact ? "w-36 h-auto" : "w-52 h-auto";
  const svgSize = compact ? "w-32 h-[76px]" : "w-48 h-[115px]";
  const overlayW = compact ? 128 : 192;
  const overlayH = compact ? 76 : 115;

  // Decorative stats (visual only : not game logic)
  const healthPct = shipLevel === 0 ? 60 : shipLevel === 1 ? 80 : 100;
  const speedPct = Math.min(100, 30 + shipLevel * 20 + moduleCount * 10);
  const hasSynergy = moduleCount >= 2;

  return (
    <motion.div
      className={cn("relative mx-auto flex flex-col items-center", size)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Ship SVG with bobbing and hover glow */}
      <div className="group/ship relative">
        <motion.div
          className={cn("pm-bob transition-shadow duration-300", svgSize)}
          whileHover={{ scale: 1.04 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <div className="h-full w-full rounded-lg transition-shadow duration-300 group-hover/ship:shadow-[0_0_18px_3px_rgba(20,184,166,0.35)]">
            <ShipSVG
              level={shipLevel}
              cargoFill={cargoFill}
              crewCount={crewCount}
              className="h-full w-full"
            />
          </div>
        </motion.div>

        {/* Connection lines from ship center to equipped module slots */}
        {maxModules > 0 && moduleCount > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${overlayW} ${overlayH}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            {getSlotPositions(maxModules, compact).map((pos, i) => {
              const mod = equippedModules[i];
              if (!mod) return null;
              return (
                <motion.line
                  key={i}
                  x1={overlayW / 2}
                  y1={overlayH / 2}
                  x2={overlayW / 2 + pos.x}
                  y2={overlayH / 2 + pos.y}
                  stroke="rgba(20, 184, 166, 0.45)"
                  strokeWidth={compact ? 0.6 : 0.8}
                  strokeDasharray="2 2"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                />
              );
            })}
          </svg>
        )}

        {/* Synergy bonus indicator (2+ modules equipped) */}
        {hasSynergy && (
          <motion.div
            className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.4,
              type: "spring",
              stiffness: 300,
              damping: 18,
            }}
          >
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[8px] font-bold text-violet-700 dark:text-violet-300 backdrop-blur-sm">
              <Sparkles className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} />
              Synergy
            </span>
          </motion.div>
        )}

        {/* Module slot badges positioned around the hull */}
        {maxModules > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {getSlotPositions(maxModules, compact).map((pos, i) => {
              const mod = equippedModules[i];
              const Icon = mod ? getModuleIcon(mod.id) : null;
              const filled = !!mod;
              return (
                <div
                  key={i}
                  className="group/slot pointer-events-auto absolute"
                  style={{
                    left: `calc(50% + ${pos.x}px)`,
                    top: `calc(50% + ${pos.y}px)`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <motion.div
                    className={cn(
                      "relative flex items-center justify-center rounded-full border-2 transition-colors duration-200",
                      compact ? "h-5 w-5" : "h-6 w-6",
                      filled
                        ? "border-teal-500/60 bg-teal-500/20 text-teal-600 dark:text-teal-400"
                        : "border-dashed border-muted-foreground/30 bg-background/80 text-muted-foreground/40",
                    )}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      delay: 0.15 + i * 0.08,
                      type: "spring",
                      stiffness: 400,
                      damping: 18,
                    }}
                    title={
                      mod
                        ? `${mod.name}: ${mod.desc}`
                        : `Empty slot ${i + 1} : equip a module in the Shipyard`
                    }
                  >
                    {Icon ? (
                      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                    ) : (
                      <>
                        {/* Pulsing glow ring on empty slots to invite equipping */}
                        <motion.span
                          className="absolute inset-0 rounded-full"
                          animate={{
                            boxShadow: [
                              "0 0 0 0 rgba(20, 184, 166, 0)",
                              "0 0 0 3px rgba(20, 184, 166, 0.18)",
                              "0 0 0 0 rgba(20, 184, 166, 0)",
                            ],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            delay: i * 0.3,
                          }}
                        />
                        <span className={compact ? "text-[7px]" : "text-[9px]"}>
                          +
                        </span>
                      </>
                    )}
                  </motion.div>

                  {/* Enhanced tooltip with module name + description */}
                  <div
                    className={cn(
                      "pointer-events-none absolute left-1/2 top-full mt-1 z-20 -translate-x-1/2",
                      "whitespace-nowrap rounded-md border border-black/10 bg-popover px-2 py-1 text-[9px] text-popover-foreground shadow-md",
                      "opacity-0 transition-opacity duration-150 group-hover/slot:opacity-100 dark:border-white/10",
                    )}
                  >
                    {mod ? (
                      <>
                        <span className="font-semibold text-teal-600 dark:text-teal-400">
                          {mod.name}
                        </span>
                        <span className="ml-1 text-muted-foreground">
                          {mod.desc}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Empty slot : equip in Shipyard
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ship stats row */}
      <div
        className={cn(
          "mt-2 flex w-full items-center justify-center gap-2",
          compact ? "text-[9px]" : "text-[11px]",
        )}
      >
        {/* Ship level badge : crown for level 2 */}
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
            shipLevel === 2
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
              : "bg-teal-500/15 text-teal-700 dark:text-teal-300",
          )}
        >
          {shipLevel === 2 ? (
            <Crown className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
          ) : (
            <Anchor className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
          )}
          Lv {shipLevel}
        </span>

        {/* Cargo capacity bar with gradient and animated fill */}
        <CargoBar level={shipLevel} cargoFill={cargoFill} compact={compact} />

        {/* Module count */}
        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
          <Cog className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
          {moduleCount}/{maxModules}
        </span>
      </div>

      {/* Expanded health and speed indicators */}
      {!compact && (
        <div className="mt-1.5 flex w-full items-center justify-center gap-3 text-[9px]">
          <DecorativeBar
            icon={Heart}
            label="Hull"
            pct={healthPct}
            colorClass="from-rose-400 to-rose-600"
          />
          <DecorativeBar
            icon={Wind}
            label="Speed"
            pct={speedPct}
            colorClass="from-sky-400 to-sky-600"
          />
        </div>
      )}
    </motion.div>
  );
}

// Cargo capacity bar : gradient fill, animated, shows fill vs capacity
function CargoBar({
  level,
  cargoFill,
  compact,
}: {
  level: number;
  cargoFill: number;
  compact: boolean;
}) {
  // Cargo capacity: level 0 = 5, level 1 = 8, level 2 = 11 (matches engine scaling)
  const maxCapacity = 11;
  const capacity = Math.max(5, level * 3 + 5);
  const capPct = (capacity / maxCapacity) * 100;
  const fill = Math.max(0, Math.min(1, cargoFill));
  const fillPct = fill * 100;
  const barW = compact ? 24 : 36;

  return (
    <span
      className="inline-flex items-center gap-1"
      title={`Cargo: ${Math.round(fill * capacity)}/${capacity} (max capacity ${capacity})`}
    >
      <Package className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      <span
        className="relative inline-block overflow-hidden rounded-full bg-muted-foreground/15"
        style={{ width: barW, height: compact ? 4 : 5 }}
      >
        {/* Capacity outline (light) */}
        <motion.span
          className="absolute inset-y-0 left-0 bg-amber-500/20"
          initial={{ width: 0 }}
          animate={{ width: `${capPct}%` }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
        {/* Actual fill (cargoFill) with gradient */}
        <motion.span
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400 to-amber-600"
          initial={{ width: 0 }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.6, delay: 0.4 }}
        />
      </span>
    </span>
  );
}

// Decorative stat bar (health, speed) : visual only, not game logic
function DecorativeBar({
  icon: Icon,
  label,
  pct,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  pct: number;
  colorClass: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-muted-foreground"
      title={`${label}: ${pct}%`}
    >
      <Icon className="h-2.5 w-2.5" />
      <span className="text-[8px] tracking-wide">{label}</span>
      <span
        className="inline-block overflow-hidden rounded-full bg-muted-foreground/15"
        style={{ width: 28, height: 4 }}
      >
        <motion.span
          className={cn(
            "block h-full rounded-full bg-gradient-to-r",
            colorClass,
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, delay: 0.3 }}
        />
      </span>
    </span>
  );
}
