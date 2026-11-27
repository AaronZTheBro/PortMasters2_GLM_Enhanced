// Plain language definitions shared by tooltips and player detail views.
import {
  BOONS,
  COMMODITIES,
  MODULES,
  RECIPES,
  WORKER_TYPES,
  workerType,
} from "./constants";
import {
  classicHarbor,
  harborTrading,
  openHarbor,
  rebalanced,
  voyageBaseWage,
} from "./expansion";
import { canProduce, voyageBoon, voyageModule, voyageRecipe } from "./pools";

const GLOSSARY: Record<string, string> = {
  // Core stats
  Reputation:
    "Ordinary orders change your Reputation by their net Gold after freight, VAT and any audit. Cargo costs and wages affect trading profit separately. The eligible solvent captain with the highest final Reputation is crowned Sea Master.",
  Gold: "Your spendable funds. Reaching zero is not an automatic loss, but failing to cover wages or maintenance at settlement causes bankruptcy.",
  VAT: "A base tax of 5% on the positive margin per finished good sold, using average recipe material prices and the recipe's base wage. Raw goods and Imperial Mandates are exempt.",
  "Income Tax":
    "A base tax of 10% on positive round trading profit. It is charged when the round ends after the Shipyard.",
  Freight:
    "The shipping fee for completing a trade order, based on how many items you're moving. Reduced by your ship level and certain Boons or modules.",
  Maintenance:
    "A fixed upkeep fee for your ship each round, due at Phase 3 regardless of how the round went.",
  "Ship Level":
    "Raises your module slots and gives a flat discount on freight costs. Upgraded from the Shipyard in Phase 4.",
  Wages:
    "What your hired artisans cost per round, paid at Phase 3 whether they produced anything or not.",
  Boon: "A bonus drafted for one round at the start of each round. Choices are personal, so captains can receive different offers.",
  Module:
    "A ship upgrade for the current voyage, drafted in the Shipyard for an open slot or to replace an installed module. It stays equipped until swapped or the voyage resets.",
  Barter:
    "A short window right after buying where captains trade directly with each other instead of through the market. Post what you have for what you want; the offered amount is set aside the moment you post it, and comes back to you if it's canceled or nobody takes it.",
  "Pirate Attack":
    "A Phase 3 risk of losing Gold. Check the passage quote for the exact odds, protected funds, and possible loss in your voyage.",
  Escort:
    "Guarantees safety from that round's pirate attack. Check the passage quote for its exact cost and your balance after bills.",
  "Financial Aid":
    "A loan from another captain when you cannot cover wages or maintenance. The lender's Gold transfers immediately; unpaid debt is settled automatically at the voyage's final round.",
  "Broker's Rumor Board":
    "Buy rumors during Phase 1. Each rumor guarantees one order for the named good and port. The board has a limited number of distinct rumors each round.",
  Debt: "Gold owed after taking Financial Aid. Repay it before the final round ends; any remaining amount is taken from available funds, and an uncovered shortfall marks the voyage bankrupt.",
};

export function glossaryEntry(term: string, rulesVersion?: number) {
  if (term === "Income Tax" && rebalanced({ rulesVersion }))
    return "A base tax of 10% on positive round trading profit. The Shipyard sets aside the amount due before upgrades, voluntary loan repayments, or Convoy Venture contributions. Module changes apply to the next round. Only available Gold can be collected.";
  if (openHarbor({ rulesVersion }) && term === "Module")
    return "A ship upgrade for this voyage. Choose one before the first Boon. At each later Shipyard visit you can fill an open slot or replace one equipped module.";
  if (classicHarbor({ rulesVersion }) && term === "Broker's Rumor Board")
    return "Buy whispers during Phase 1 to reveal the exact terms of distinct buyers already on the board.";
  if (harborTrading({ rulesVersion }) && term === "Port Exchange")
    return "Sell any held cargo for Gold during trading. The first three units of each good use a higher rate each round, subject to rounding. Quotes include freight and VAT. Exchange sales grant no Reputation.";
  const material = COMMODITIES[term];
  if (material)
    return `A raw material with specialty prices at ${material.ports.join(" and ")}.${openHarbor({ rulesVersion }) ? " Available at every difficulty." : " Availability depends on the saved voyage rules."}`;
  const artisan = WORKER_TYPES.find(({ label }) => label === term);
  if (artisan) {
    const products = Object.keys(RECIPES).filter((product) =>
      canProduce(artisan.id, product),
    );
    return `Can make ${products.join(", ")} when those recipes are available. The base wage is ${voyageBaseWage(artisan.wage, rulesVersion)} Gold per round, including idle rounds.`;
  }
  if (RECIPES[term]) {
    const recipe = voyageRecipe(term, rulesVersion);
    const inputs = Object.entries(recipe.materials)
      .map(([name, qty]) => `${qty} ${name}`)
      .join(" and ");
    return `A finished good made by a ${workerType(recipe.worker_type)!.label}. The base recipe uses ${inputs} and completes at settlement.`;
  }
  const boon = BOONS.find(({ name }) => name === term);
  if (boon) return voyageBoon(boon, rulesVersion).desc;
  const shipModule = MODULES.find(({ name }) => name === term);
  if (shipModule) return voyageModule(shipModule, rulesVersion).desc;
  return GLOSSARY[term];
}
