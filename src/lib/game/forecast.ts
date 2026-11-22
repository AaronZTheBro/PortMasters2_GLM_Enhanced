import { difficultyConfig, normalizeDifficulty } from "./difficulty";
import {
  CLASSIC_RULES,
  EXPANDED_RULES,
  EFFECT,
  FORECAST_WINDOWS,
  type HarborForecast,
  type VoyageRules,
} from "./expansion";
import { unlockedProducts, unlockedResources } from "./pools";
import { createRng, pick } from "./rng";

export function buildForecasts(
  roomId: string,
  epoch: number,
  difficulty: unknown,
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
        ? unlockedResources(waters, round, EXPANDED_RULES)
        : unlockedProducts(waters, round, EXPANDED_RULES);
    return { round, kind, item: pick(random, goods) };
  });
}

export function readVoyageRules(
  room?: { rulesVersion: number; forecastPlan: string } | null,
): VoyageRules {
  if (room?.rulesVersion !== EXPANDED_RULES)
    return { version: CLASSIC_RULES, forecasts: [] };
  return {
    version: EXPANDED_RULES,
    forecasts: JSON.parse(room.forecastPlan) as HarborForecast[],
  };
}

export function describeForecast(forecast: HarborForecast) {
  switch (forecast.kind) {
    case "market":
      return {
        title: "Market Day",
        detail: `Look for a featured ${forecast.item} lot. An ${Math.round(EFFECT.marketDay * 100)}% discount combines with Harbor Pulse, capped at a 15% change in either direction before personal effects.`,
      };
    case "guild":
      return {
        title: "Guild Exhibition",
        detail: `Two featured buyers will request ${forecast.item} in Phase 2.`,
      };
    case "seas":
      return {
        title: "Heavy Seas",
        detail: `Direct sailing adds ${Math.round(EFFECT.heavySeas * 100)} percentage points to base raid risk, up to 50%, before personal reductions.`,
      };
  }
}

export function announcedMandateRound(difficulty: unknown, round: number) {
  return Object.keys(difficultyConfig(difficulty).mandates)
    .map(Number)
    .find((scheduled) => scheduled >= round && scheduled <= round + 2);
}
