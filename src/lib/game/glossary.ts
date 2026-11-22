// Plain language definitions shared by tooltips and player detail views.
import { BOONS, MODULES } from "./constants";

export const GLOSSARY: Record<string, string> = {
  // Raw materials
  Hemp: "A cheap raw material, bought at port. Weavers turn it into Linen Clothes, or combine it with Silk for Cotton Clothes.",
  Silk: "A pricier raw material. Goes into Cotton Clothes, Brocade, and Sachets. Most valuable recipes need it.",
  Tea: "A raw material used only in Sachets, alongside Silk.",
  "Porcelain Clay":
    "A charter raw material used by Potters to make Celadon Ware.",
  "Copper Ore":
    "A charter raw material used by Coppersmiths to make Bronze Mirrors.",
  Spices:
    "A raw material from later charters. Perfumers combine it with Silk to make Foreign Balm.",
  Pearls:
    "A raw material from later charters. Jewelers combine it with Silk to make Pearl Strings.",

  // Finished goods
  "Linen Clothes":
    "A Weaver's product: 2 Hemp in, one item out. The cheapest finished good to produce.",
  "Cotton Clothes":
    "A Weaver's product: 2 Hemp + 1 Silk in. Worth more than Linen Clothes, costs more to make.",
  Brocade:
    "A Master Weaver's product: 3 Silk in. A valuable finished good from the founding trade.",
  Sachet:
    "A Sachet Maker's product: 1 Silk + 2 Tea in. The most valuable founding product and the only recipe that needs Tea.",
  "Bronze Mirror":
    "A Coppersmith's product: 3 Copper Ore in, one Bronze Mirror out.",
  "Celadon Ware":
    "A Potter's product: 3 Porcelain Clay in, one Celadon Ware out.",
  "Foreign Balm":
    "A Perfumer's product: 2 Spices + 1 Silk in. A valuable trade good from later charters.",
  "Pearl String":
    "A Jeweler's product: 2 Pearls + 1 Silk in. The most valuable finished good in the current catalogue.",

  // Workers
  Weaver:
    "Makes Linen Clothes or Cotton Clothes. Costs a wage every round, paid at Phase 3, whether or not they're working.",
  "Master Weaver":
    "Makes Linen Clothes, Cotton Clothes, or Brocade. Pricier than a Weaver, and the only one who can make Brocade.",
  "Sachet Maker":
    "Makes Sachets from Silk and Tea. Charges wages every round, including idle rounds.",
  Coppersmith:
    "Makes Bronze Mirrors from Copper Ore after the first charter opens.",
  Potter:
    "Makes Celadon Ware from Porcelain Clay after the first charter opens.",
  Perfumer:
    "Makes Foreign Balm from Spices and Silk after the late charter opens.",
  Jeweler:
    "Makes Pearl Strings from Pearls and Silk after the late charter opens.",

  // Core stats
  Reputation:
    "Your score for the voyage, earned mainly from profitable trade orders. The solvent captain with the highest Reputation at the final round is crowned Sea Master.",
  Gold: "Your spendable funds. Reaching zero is not an automatic loss, but failing to cover wages or maintenance at settlement causes bankruptcy.",
  VAT: "A 5% tax on the profit margin of finished good sales (selling price minus material cost minus wage). Raw material sales are not taxed this way.",
  "Income Tax":
    "A 10% tax on your net profit for the round, charged at Phase 3 settlement after everything else is paid.",
  Freight:
    "The shipping fee for completing a trade order, based on how many items you're moving. Reduced by your ship level and certain boons or modules.",
  Maintenance:
    "A fixed upkeep fee for your ship each round, due at Phase 3 regardless of how the round went.",
  "Ship Level":
    "Raises your module slots and gives a flat discount on freight costs. Upgraded from the Shipyard in Phase 4.",
  Wages:
    "What your hired artisans cost per round, paid at Phase 3 whether they produced anything or not.",
  Boon: "A bonus drafted for one round at the start of each round. Choices are personal, so captains can receive different offers.",
  Module:
    "A ship upgrade for the current voyage, drafted from the Shipyard when a slot is available. It stays equipped until swapped or the voyage resets.",
  Barter:
    "A short window right after buying where captains trade directly with each other instead of through the market. Post what you have for what you want; the offered amount is set aside the moment you post it, and comes back to you if it's canceled or nobody takes it.",
  "Pirate Attack":
    "A Phase 3 risk of losing every Gold coin you are carrying. The probability depends on room difficulty and can rise later in the voyage.",
  Escort:
    "Guarantees safety from that round's pirate attack. Its cost is a percentage of your current Gold set by the selected waters.",
  "Financial Aid":
    "A loan from another captain when you cannot cover wages or maintenance. The lender's Gold transfers immediately; unpaid debt is settled automatically at the voyage's final round.",
  Debt: "Gold owed after taking Financial Aid. Repay it before the final round ends; any remaining amount is taken from available funds, and an uncovered shortfall marks the voyage bankrupt.",
};

for (const b of BOONS) GLOSSARY[b.name] = b.desc;
for (const m of MODULES) GLOSSARY[m.name] = m.desc;
