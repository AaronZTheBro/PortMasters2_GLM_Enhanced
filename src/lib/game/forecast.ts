import {
  difficultyConfig,
  mandateIndexFor,
  normalizeDifficulty,
} from "./difficulty";
import {
  CLASSIC_RULES,
  EXPANDED_RULES,
  EFFECT,
  REBALANCE,
  REBALANCED_RULES,
  OPEN_HARBOR_RULES,
  CLASSIC_HARBOR_RULES,
  classicHarbor,
  harborTrading,
  rebalanced,
  voyageSpecialties,
  type Specialty,
  FORECAST_WINDOWS,
  type HarborForecast,
  type VoyageRules,
} from "./expansion";
import { unlockedPorts, unlockedProducts, unlockedResources } from "./pools";
import { createRng, pick } from "./rng";

export function buildForecasts(
  roomId: string,
  epoch: number,
  difficulty: unknown,
  version = EXPANDED_RULES,
  specialties?: Specialty[],
): HarborForecast[] {
  const waters = normalizeDifficulty(difficulty);
  const random = createRng(`${roomId}:V${epoch}:forecasts`);
  let previousWasSeas = false;
  return FORECAST_WINDOWS[waters].map((round, index) => {
    const kinds =
      waters === "fair_winds" || previousWasSeas || index === 0
        ? (["market", "guild"] as const)
        : (["market", "guild", "seas"] as const);
    const kind = pick(random, kinds);
    previousWasSeas = kind === "seas";
    if (kind === "seas") return { round, kind };
    const goods =
      kind === "market"
        ? unlockedResources(waters, round, version, specialties)
        : unlockedProducts(waters, round, version, specialties);
    return { round, kind, item: pick(random, goods) };
  });
}

export function readVoyageRules(
  room?: { rulesVersion: number; forecastPlan: string } | null,
): VoyageRules {
  if (
    room?.rulesVersion === REBALANCED_RULES ||
    room?.rulesVersion === OPEN_HARBOR_RULES ||
    room?.rulesVersion === CLASSIC_HARBOR_RULES
  ) {
    const saved = JSON.parse(room.forecastPlan) as
      Omit<VoyageRules, "version"> | [];
    return Array.isArray(saved)
      ? { version: room.rulesVersion, forecasts: [] }
      : { ...saved, version: room.rulesVersion };
  }
  if (room?.rulesVersion !== EXPANDED_RULES)
    return { version: CLASSIC_RULES, forecasts: [] };
  return {
    version: EXPANDED_RULES,
    forecasts: JSON.parse(room.forecastPlan) as HarborForecast[],
  };
}

export function buildVoyageRules(
  roomId: string,
  epoch: number,
  difficulty: unknown,
  choices?: unknown,
): VoyageRules {
  const version = REBALANCED_RULES;
  const specialties = voyageSpecialties(difficulty, choices);
  return {
    version,
    specialties,
    forecasts: buildForecasts(roomId, epoch, difficulty, version, specialties),
  };
}

export function buildOpenHarborRules(
  roomId: string,
  epoch: number,
  difficulty: unknown,
): VoyageRules {
  const cfg = difficultyConfig(difficulty);
  const version = OPEN_HARBOR_RULES;
  const random = createRng(`${roomId}:V${epoch}:openHarbor`);
  const ports = unlockedPorts(cfg.key, 1, version);
  const arrivals = Array.from({ length: cfg.rounds }, () =>
    pick(random, ports),
  );
  const kinds: HarborForecast["kind"][] = [
    "market",
    "guild",
    "seas",
    "fleet",
    "shortfall",
    "festival",
    "rival",
  ];
  const rounds =
    cfg.key === "fair_winds" ? [2, 3, 4, 5, 6, 7, 8] : [2, 4, 5, 7, 8, 10, 12];
  const forecasts = rounds.map((round): HarborForecast => {
    const choices =
      round === 2
        ? kinds.filter((kind) => kind !== "seas" && kind !== "shortfall")
        : kinds;
    const kind = pick(random, choices);
    kinds.splice(kinds.indexOf(kind), 1);
    if (kind === "guild")
      return {
        round,
        kind,
        item: pick(random, unlockedProducts(cfg.key, round, version)),
      };
    if (kind === "market" || kind === "fleet" || kind === "shortfall")
      return {
        round,
        kind,
        item: pick(random, unlockedResources(cfg.key, round, version)),
      };
    return { round, kind };
  });
  if (cfg.key === "monsoon")
    forecasts.push(
      { round: 14, kind: "seas" },
      { round: 16, kind: "festival" },
    );
  return { version, arrivals, forecasts };
}

export function buildCurrentVoyageRules(
  roomId: string,
  epoch: number,
  difficulty: unknown,
): VoyageRules {
  const cfg = difficultyConfig(difficulty);
  const version = CLASSIC_HARBOR_RULES;
  const random = createRng(`${roomId}:V${epoch}:classicHarbor`);
  const arrivals = Array.from({ length: cfg.rounds }, (_, index) =>
    pick(random, unlockedPorts(cfg.key, index + 1, version)),
  );
  return {
    version,
    arrivals,
    forecasts: buildForecasts(roomId, epoch, cfg.key, version),
  };
}

export function describeForecast(
  forecast: HarborForecast,
  state: { rulesVersion?: number } = {},
) {
  if (harborTrading(state)) {
    const copy = {
      market: {
        title: "Market Day",
        detail: `Market Day lowers the price adjustment for ${forecast.item}, subject to the combined adjustment limit and rounding. Look for a featured lot.`,
      },
      guild: {
        title: "Guild Exhibition",
        detail: classicHarbor(state)
          ? `A guild buyer seeks ${forecast.item} unless Merchants Converge replaces that buyer.`
          : `A premium commission seeks ${forecast.item}.`,
      },
      seas: {
        title: "Heavy Seas",
        detail:
          "Direct sailing adds six percentage points to base raid risk, up to 50% before personal reductions.",
      },
      fleet: {
        title: "Fleet Arrival",
        detail: `An extra large ${forecast.item} shipment is on the board at a lower price.`,
      },
      shortfall: {
        title: "Harvest Shortfall",
        detail: `${forecast.item} purchase and exchange prices rise this round.`,
      },
      festival: {
        title: "Harbor Festival",
        detail:
          "The Exchange rate for the first three units of each good rises by 14 percentage points before rounding, and a commission pays a premium.",
      },
      rival: {
        title: "Rival Merchant",
        detail: "A visiting captain pays a premium for a mixed cargo order.",
      },
    };
    return copy[forecast.kind];
  }
  const effect = rebalanced(state) ? REBALANCE : EFFECT;
  switch (forecast.kind) {
    case "market":
      return {
        title: "Market Day",
        detail: `Look for a featured ${forecast.item} lot. Market Day subtracts ${Math.round(effect.marketDay * 100)} percentage points from the Harbor Pulse price adjustment. The combined adjustment is capped at 15% in either direction before personal effects.`,
      };
    case "guild":
      return {
        title: "Guild Exhibition",
        detail: `Two featured buyers will request ${rebalanced(state) ? "one unit each of " : ""}${forecast.item} in Phase 2.`,
      };
    case "fleet":
    case "shortfall":
    case "festival":
    case "rival":
      return { title: "Harbor Forecast", detail: "" };
    case "seas":
      return {
        title: "Heavy Seas",
        detail: `Direct sailing adds ${Math.round(effect.heavySeas * 100)} percentage points to base raid risk, up to 50%, before personal reductions.`,
      };
  }
}

export function announcedMandateRound(
  difficulty: unknown,
  round: number,
  notice = 2,
  version?: number,
) {
  for (let next = round; next <= round + notice; next++)
    if (mandateIndexFor(difficulty, next, version) !== undefined) return next;
}
