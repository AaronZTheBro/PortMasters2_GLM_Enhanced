"use client";

import { Fragment, useId } from "react";
import { commodityLedgerText } from "./CommodityIcon";

import { Anchor, Package, Settings2, Users } from "lucide-react";
import type { Module } from "@/lib/game/constants";
import { cn } from "@/lib/utils";

const rigs = [
  [{ x: 103, top: 34, width: 54, foot: 109 }],
  [
    { x: 86, top: 27, width: 53, foot: 109 },
    { x: 148, top: 49, width: 34, foot: 100 },
  ],
  [
    { x: 81, top: 22, width: 55, foot: 108 },
    { x: 147, top: 39, width: 44, foot: 100 },
  ],
  [
    { x: 54, top: 44, width: 31, foot: 106 },
    { x: 94, top: 13, width: 52, foot: 109 },
    { x: 158, top: 29, width: 43, foot: 97 },
  ],
];

const hulls = [
  {
    bow: "44 118",
    stern: "175 113",
    rail: "Q70 126 137 121",
    keel: "Q170 136 146 146H80Q57 143 44 118",
  },
  {
    bow: "35 117",
    stern: "195 110",
    rail: "Q75 126 145 120",
    keel: "Q186 138 159 148H75Q49 144 35 117",
  },
  {
    bow: "26 114",
    stern: "207 104",
    rail: "Q69 126 149 119",
    keel: "Q200 136 166 150H69Q44 146 26 114",
  },
  {
    bow: "19 113",
    stern: "221 98",
    rail: "Q74 128 157 118",
    keel: "Q211 138 174 151H65Q39 148 19 113",
  },
];

export function ShipMark({
  level = 0,
  className,
  compact = false,
}: {
  level?: number;
  className?: string;
  compact?: boolean;
}) {
  const id = useId();
  const index = compact ? 0 : Math.min(3, Math.max(0, level));
  const { bow, stern, rail, keel } = hulls[index];
  const deck = `M${bow}${rail}L${stern}`;
  const hull = deck + keel + "Z";
  const masts = rigs[index];
  const foremast = masts[0];
  const aftmast = masts[masts.length - 1];
  return (
    <svg
      viewBox={compact ? "37 25 145 127" : "0 0 240 177"}
      width={compact ? 16 : 240}
      height={compact ? 16 : 177}
      fill="none"
      aria-hidden="true"
      data-ship-art={compact ? "icon" : "illustration"}
      className={className}
    >
      <defs>
        <linearGradient
          id={id + "hull"}
          x1="95"
          y1="113"
          x2="100"
          y2="151"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={compact ? "#439891" : "#256A68"} />
          <stop offset="1" stopColor={compact ? "#286067" : "#102E38"} />
        </linearGradient>
        <linearGradient
          id={id + "linen"}
          x1="18%"
          y1="0%"
          x2="80%"
          y2="100%"
          gradientUnits="objectBoundingBox"
        >
          <stop stopColor="#F8E6BA" />
          <stop offset="1" stopColor="#D9A75A" />
        </linearGradient>
        <clipPath id={id + "clip"}>
          <path d={hull} />
        </clipPath>
      </defs>
      {!compact && (
        <>
          <circle cx="120" cy="83" r="65" fill="currentColor" opacity=".055" />
          <circle
            cx="120"
            cy="83"
            r="64.5"
            stroke="currentColor"
            opacity=".15"
          />
        </>
      )}
      <path
        d={`M${bow}L${foremast.x} ${foremast.top + 9}M${aftmast.x} ${aftmast.top + 10}L${stern}`}
        stroke="#976C46"
        strokeWidth={compact ? 5 : 1.8}
        strokeLinecap="round"
      />
      {masts.map(({ x, top, width, foot }, i) => {
        const head = top + 12;
        const headX = x + width * 0.83;
        const headY = head + 8;
        const clewX = x + width;
        const clewY = foot + 2;
        const edgeX = x + width * 1.14;
        const edgeY = (headY + clewY) / 2;
        return (
          <g key={x}>
            <path
              d={`M${x} ${head}Q${x + width * 0.46} ${head - 8} ${headX} ${headY}Q${edgeX} ${edgeY} ${clewX} ${clewY}Q${x + width * 0.45} ${foot - 9} ${x} ${foot}Z`}
              fill={`url(#${id}linen)`}
              stroke="#946B3E"
              strokeWidth={compact ? 4.5 : 1.8}
              strokeLinejoin="round"
            />
            {(compact ? [0.35, 0.7] : [0.22, 0.43, 0.64, 0.83]).map((part) => {
              const inverse = 1 - part;
              const rightX =
                inverse ** 2 * headX +
                2 * inverse * part * edgeX +
                part ** 2 * clewX;
              const rightY = headY + (clewY - headY) * part;
              const leftY = head + (foot - head) * part;
              return (
                <path
                  key={part}
                  d={`M${x} ${leftY}Q${x + width * 0.48} ${leftY - 7} ${rightX} ${rightY}`}
                  stroke="#A36E3A"
                  strokeWidth={compact ? 4 : 1.65}
                  strokeLinecap="round"
                />
              );
            })}
            <path
              d={`M${x} 129V${top}`}
              stroke="#745137"
              strokeWidth={compact ? 6 : 3}
              strokeLinecap="round"
            />
            <path
              d={`M${x} ${top}q10 -6 21 -2l-5 4 5 4q-13 -4 -21 1Z`}
              fill={i === 0 ? "#DB8F4B" : "#52A59D"}
            />
          </g>
        );
      })}
      {index >= 1 && (
        <g stroke="#8C633A" strokeWidth="1.4" strokeLinejoin="round">
          <path
            d={index < 3 ? "M162 122V99h28v16Z" : "M169 121V92h38v18Z"}
            fill="#D0A366"
          />
          <path
            d={index < 3 ? "M158 100l10-8h19l7 6Z" : "M164 94l12-10h29l7 7Z"}
            fill="#34645C"
          />
          <path
            d={index < 3 ? "M170 106h4m6 0h4" : "M178 100h5m8 0h5"}
            strokeLinecap="round"
          />
        </g>
      )}
      <path
        d={hull}
        fill={`url(#${id}hull)`}
        stroke="#142C34"
        strokeWidth={compact ? 5 : 2.4}
        strokeLinejoin="round"
      />
      <g clipPath={`url(#${id}clip)`}>
        <path
          d="M19 122Q90 145 222 108M23 131Q110 153 219 119M35 140Q121 157 208 130"
          stroke="#79BEAF"
          strokeOpacity=".28"
          strokeWidth="1.1"
        />
      </g>
      <path
        d={deck}
        stroke="#D0A76B"
        strokeWidth={compact ? 5 : 1.7}
        strokeLinecap="round"
      />
      {!compact && (
        <path
          d="M24 151q13-5 25 0t25 0 25 0 25 0 25 0 25 0 25 0m-133 9q12-4 24 0t24 0 24 0 24 0"
          stroke="currentColor"
          opacity=".52"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function ShipIcon({ className }: { className?: string }) {
  return (
    <ShipMark
      compact
      className={cn(
        "inline-block h-[1em] w-[1em] shrink-0 align-middle",
        className,
      )}
    />
  );
}

export function TextWithShipIcons({ children }: { children: string }) {
  return children
    .split(/([⛵🚢]\uFE0F?)/u)
    .map((part, index) =>
      index % 2 === 1 ? (
        <ShipIcon key={index} />
      ) : (
        <Fragment key={index}>{commodityLedgerText(part)}</Fragment>
      ),
    );
}

export function ShipVisualizer({
  shipLevel,
  equippedModules,
  compact = false,
  cargoUnits = 0,
  crewCount = 0,
}: {
  shipLevel: number;
  equippedModules: Module[];
  compact?: boolean;
  cargoUnits?: number;
  crewCount?: number;
}) {
  return (
    <figure
      className={cn(
        "mx-auto w-full min-w-0 text-center",
        compact ? "max-w-52" : "max-w-72",
      )}
    >
      <ShipMark
        level={shipLevel}
        className="mx-auto h-auto w-full max-w-56 text-teal-700 dark:text-teal-300"
      />
      <figcaption className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Anchor className="size-3" /> Level {shipLevel}
        </span>
        <span className="inline-flex items-center gap-1">
          <Package className="size-3" /> {cargoUnits} cargo
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" /> {crewCount} crew
        </span>
        <span className="inline-flex items-center gap-1">
          <Settings2 className="size-3" /> {equippedModules.length} of{" "}
          {shipLevel} slots
        </span>
      </figcaption>
      {equippedModules.length > 0 && (
        <ul
          aria-label="Equipped ship modules"
          className="mt-3 flex flex-wrap justify-center gap-1.5"
        >
          {equippedModules.map((module) => (
            <li
              key={module.id}
              className="max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <span aria-hidden="true">
                <TextWithShipIcons>{module.icon}</TextWithShipIcons>{" "}
              </span>
              {module.name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
