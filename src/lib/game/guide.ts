// =====================================================================
// PortMasters 2: structured guide content
// GuideModal and TipsModal render these difficulty aware sections directly.
// Values that affect player decisions come from the same content and
// difficulty records used by the engine.
// =====================================================================

import {
  APP_NAME,
  COMMODITIES,
  PRODUCT_PRICES,
  RECIPES,
  WORD_ON_THE_DOCKS_THRESHOLD,
  WORD_ON_THE_DOCKS_REWARD,
  TIDEWATCH_SURGE_THRESHOLD,
  CONVOY_VENTURE_PAYOUT_MULTIPLIER,
  CONVOY_VENTURE_FAILURE_REFUND_RATE,
  CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE,
} from "./constants";
import {
  difficultyConfig,
  type Difficulty,
  type DifficultyConfig,
} from "./difficulty";
import {
  unlockedProducts,
  unlockedResources,
  unlockedWorkerTypes,
} from "./pools";

// A callout is a highlighted box with a tone specific background and border.
export type CalloutTone = "info" | "warning" | "success" | "danger";

export type Callout = {
  tone: CalloutTone;
  text: string;
};

export type GuideSection = {
  icon: string;
  title: string;
  intro?: string;
  bullets?: string[];
  callout?: Callout;
};

export type GuideTab = {
  id: string;
  label: string;
  emoji: string;
  blurb: string;
  sections: GuideSection[];
};

function raidCopy(cfg: DifficultyConfig): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const [first, second] = cfg.pirateChance;
  return second === undefined || second === first
    ? `a ${pct(first)} chance`
    : `a ${pct(first)} chance that rises to ${pct(second)} past the midpoint`;
}

function escortPct(cfg: DifficultyConfig): string {
  return `${Math.round(cfg.escortCostRate * 100)}%`;
}

function mandateRounds(cfg: DifficultyConfig): number[] {
  return Object.keys(cfg.mandates)
    .map(Number)
    .sort((a, b) => a - b);
}

export function guideTabs(difficulty: Difficulty): GuideTab[] {
  const cfg = difficultyConfig(difficulty);
  const mandates = mandateRounds(cfg);
  const resources = unlockedResources(difficulty, cfg.rounds);
  const products = unlockedProducts(difficulty, cfg.rounds);
  const workers = unlockedWorkerTypes(difficulty, cfg.rounds);
  const resourceCopy = resources
    .map((resource) => {
      const [minimum, maximum] = COMMODITIES[resource].basePrice;
      return `${resource} (${minimum} to ${maximum} Gold)`;
    })
    .join(", ");
  const productCopy = products
    .map((product) => {
      const [minimum, maximum] = PRODUCT_PRICES[product];
      return `${product} (${minimum} to ${maximum} Gold)`;
    })
    .join(", ");
  const workerCopy = workers.map((worker) => {
    const output = Object.entries(RECIPES)
      .filter(([, recipe]) => recipe.worker_type === worker.id)
      .map(([product]) => product)
      .join(" or ");
    return `${worker.label} (${worker.wage} Gold per round): makes ${output}`;
  });
  const tabs: GuideTab[] = [];

  // Overview
  tabs.push({
    id: "overview",
    label: "Overview",
    emoji: "🌊",
    blurb:
      "What this voyage is, what you're trying to do, and how a round flows.",
    sections: [
      {
        icon: "🌊",
        title: `These Waters: ${cfg.icon} ${cfg.name}`,
        intro: cfg.summary,
      },
      {
        icon: "🚢",
        title: "Objective",
        intro: `Sail ${cfg.rounds} rounds, trade profitably, and finish with the strongest Reputation.`,
        callout: {
          tone: "warning",
          text: "The captain with the highest Reputation among everyone who reaches the endgame is crowned Sea Master.",
        },
      },
      {
        icon: "🔄",
        title: "Round Sequence",
        intro:
          "Every round follows the same synchronized sequence. The room advances after every active captain is ready.",
        bullets: [
          "Draft a Boon for one round",
          "Phase 1: buy resources and optionally purchase Broker intel",
          "Barter: exchange goods or Gold with other captains",
          "Artisan Management: hire workers and assign production",
          "Phase 2: complete trade orders",
          "Phase 3: finish production, resolve pirates, then pay wages and maintenance",
          "Phase 4: upgrade the ship and manage modules",
        ],
      },
    ],
  });

  // Markets
  tabs.push({
    id: "markets",
    label: "Markets",
    emoji: "📦",
    blurb: "Goods, workers, taxes, and the Broker's rumors.",
    sections: [
      {
        icon: "📦",
        title: "Goods System",
        intro:
          "Raw materials are bought at ports and either sold directly or assigned to artisans. Production lands at settlement, after that round's order phase.",
        bullets: [
          `Raw materials available during this voyage: ${resourceCopy}`,
          `Finished goods available during this voyage: ${productCopy}`,
        ],
      },
      {
        icon: "👥",
        title: "Worker System",
        intro:
          "Artisans turn raw materials into valuable finished goods. Each one charges a wage every round, even when idle.",
        bullets: workerCopy,
        callout: {
          tone: "warning",
          text: "Hire only as needed. Wages are settled at Phase 3, not on hire, so a hire you can't pay for shows up as a bill later, not a deduction now.",
        },
      },
      {
        icon: "🧾",
        title: "Tax System",
        bullets: [
          "VAT: 5% of finished good profit margin",
          "Income Tax: 10% of round net profit before boon and module adjustments",
        ],
      },
      {
        icon: "⚓",
        title: "Freight and order bonuses",
        bullets: [
          "Start at 2 Gold per cargo unit. Subtract the ship level and Favorable Tides reductions, keeping a base minimum of 5 Gold.",
          "Then apply Bulk Hauler and Overdrive. Split the remaining freight by unit count for Silk Winds and Silk Road Monopoly, rounding the result down. Fleet of Treasures applies last. Freight cannot fall below zero.",
          "Reward bonuses apply to the eligible share by cargo units after VAT. Apply Silk Road Monopoly, Kiln and Forge Guild, Maritime Bureau Token, then Exotic Treasures, rounding down each bonus. Mandate rewards are fixed.",
        ],
      },
      {
        icon: "🔮",
        title: "Broker's Whisper",
        intro:
          "Open the rumor board during buying. The board shows the current price and how many unique tips are left.",
        bullets: [
          "Revealed intel guarantees matching orders will appear",
          "The usual price is 5 Gold for one rumor. Broker’s Network charges 2 Gold for up to two, and Ocean Interpreter adds one when available.",
          "Farsight costs no Gold and draws from the same pool.",
        ],
        ...(cfg.brokerCorruption
          ? {
              callout: {
                tone: "danger" as CalloutTone,
                text: "Each paid purchase has a 30% chance to leak your position until one leak occurs. It still delivers every rumor. The free Farsight tip never causes a leak.",
              },
            }
          : {}),
      },
    ],
  });

  // Harbor
  tabs.push({
    id: "harbor",
    label: "Harbor",
    emoji: "🤝",
    blurb:
      "Trade directly with other captains: barter, ventures, loans, and backing.",
    sections: [
      {
        icon: "🤝",
        title: "Bartering",
        intro:
          "Right after Phase 1, before Phase 2 opens: trade directly with the other captains in your harbor. Post what you have and what you want for it; anyone can accept it with one click.",
        bullets: [
          "An offer can't be an item for itself, and both amounts must be whole numbers of at least 1",
          "You can never offer more than you currently own; it's set aside the moment you post, and returned to you if you cancel or nobody takes it",
          'Want to make sure a specific captain gets your offer, not whoever clicks fastest? Pick their name under "With" when you post: only the two of you will ever see it',
        ],
      },
      {
        icon: "⚓",
        title: "Convoy Ventures",
        intro:
          "Open Status, then Dues: any captain can post a venture with a Gold target and a deadline round.",
        bullets: [
          "Anyone in the harbor, including the poster, can chip in Gold toward that target at any time before the deadline",
          `Reach the target in time and it fills: every contributor is paid back ${Math.round(
            (CONVOY_VENTURE_PAYOUT_MULTIPLIER - 1) * 100,
          )}% more Gold than they put in, split in exact proportion to their share`,
          `Miss the deadline and it fails: every contributor only gets back ${Math.round(
            CONVOY_VENTURE_FAILURE_REFUND_RATE * 100,
          )}% of their own stake, the rest is lost`,
          "Your whole harbor only ever gets one filled venture per voyage: the moment any venture fills, every other open venture is cancelled and fully refunded, and posting a new one is disabled until the next voyage",
          "A deadline can never land on your voyage's final round: it always leaves at least one full round afterward to actually spend whatever you're paid",
          `No single captain can ever fund more than ${Math.round(
            CONVOY_VENTURE_MAX_CONTRIBUTOR_SHARE * 100,
          )}% of a venture's target alone`,
        ],
      },
      {
        icon: "🆘",
        title: "Financial Aid",
        intro:
          "Can't cover this round's wages or maintenance? Ask the harbor for a loan, right on the settlement screen.",
        bullets: [
          "Any captain with enough Gold can lend it to you on the spot; it's in your hands immediately",
          "Repay it any time before the voyage's last round ends, or it's taken from your funds automatically and handed to your lender",
          "Still short when the voyage finishes? That unpaid loan is what bankrupts you, not the round it was borrowed in",
          "Lending Gold raises your own reputation, scaled to how much you lent",
        ],
      },
      {
        icon: "🛡️",
        title: "Backing",
        intro:
          "Every outstanding loan in your harbor is visible on the settlement screen, to everyone, not just the lender and borrower.",
        bullets: [
          "A third captain can back one: pledge some of their own Gold as a safety net for the lender, escrowed the instant they pledge it",
          "Only spent if the loan actually defaults, and only up to whatever was pledged; the lender still eats any shortfall past that",
          "Never called on when the loan is repaid in full? The whole pledge comes back, plus a small Reputation bonus for the risk paying off",
          "One backer per loan; you can't back a loan you're the lender or borrower on yourself",
        ],
      },
    ],
  });

  // Risk and race
  const riskSections: GuideSection[] = [
    {
      icon: "🏴‍☠️",
      title: "Pirates and Escorts",
      intro: `Phase 3, after production and before bills: ${raidCopy(
        cfg,
      )} of losing every Gold coin you're carrying.`,
      bullets: [
        `Hire an escort for ${escortPct(
          cfg,
        )} of your current Gold to guarantee safe passage instead`,
        "The choice has to be made before that round's pirates are rolled for",
      ],
      callout: {
        tone: "info",
        text: "The escort fee scales with your own Gold, so it's relatively cheap exactly when you're poor and the stakes are also low.",
      },
    },
  ];

  if (mandates.length) {
    riskSections.push({
      icon: "📜",
      title: "Imperial Mandates",
      intro: `On round${mandates.length === 1 ? "" : "s"} ${mandates.join(
        ", ",
      )} the Emperor commissions one large order at a fixed reward.`,
      bullets: [
        "A mandate has a fixed reward with no VAT or reward bonuses. Freight discounts still apply.",
        "Every captain in the harbor is dealt the same mandate, so it is a race",
      ],
    });
  }

  riskSections.push(
    {
      icon: "📣",
      title: "Word on the Docks",
      intro: `Whichever captain is first in the harbor to complete ${WORD_ON_THE_DOCKS_THRESHOLD} trade orders total this voyage wins ${WORD_ON_THE_DOCKS_REWARD} Gold on the spot.`,
      bullets: [
        "It's a race against the rest of the room, not a scheduled event: it can land on any round, for any captain",
        "Announced to the whole harbor the moment it is won, like every shared harbor milestone",
      ],
    },
    {
      icon: "🌊",
      title: "Tidewatch Alerts",
      intro: `Once everyone in the harbor's own Reputation adds up past ${TIDEWATCH_SURGE_THRESHOLD}, the harbor takes notice of a bustling crew.`,
      bullets: [
        "From the next Port Merchant Exchange onward, every captain's board gets one extra cargo lot, for the rest of the voyage",
        "This never changes your voyage length or which tier's goods you see, only how busy the market gets",
      ],
    },
  );

  tabs.push({
    id: "risk",
    label: "Risk & Race",
    emoji: "🏴‍☠️",
    blurb:
      "Pirates, mandates, and shared harbor races that fire during a voyage.",
    sections: riskSections,
  });

  // Progression
  tabs.push({
    id: "progression",
    label: "Progression",
    emoji: "🔧",
    blurb: "Ship modules and the Renown that survives a restart.",
    sections: [
      {
        icon: "🔧",
        title: "Ship Modules",
        intro: "Phase 4: Upgrade your ship to unlock Module Slots.",
        bullets: [
          "Draft powerful modules to create unique synergies",
          "Swap modules to adapt to your current run!",
        ],
      },
      {
        icon: "⭐",
        title: "Captain's Legacy",
        intro:
          "An eligible voyage banks final Reputation as Renown XP when the harbor concludes, win or lose.",
        bullets: [
          "Renown is permanent: it survives a restart and carries into every future voyage, in any harbor, unlike Gold, cargo, and ship level",
          "Each Renown level grants a small Gold bonus at the start of your next fresh voyage",
          "Whoever ends a voyage with the highest Reputation among everyone who reached the endgame screen is crowned Sea Master",
          "Check your current Renown level, title, and Sea Master crowns any time from the Lobby",
        ],
        callout: {
          tone: "success",
          text: "An honest bankruptcy still banks final Reputation as Renown XP, even though that captain cannot win the crown.",
        },
      },
    ],
  });

  // Shortcuts
  tabs.push({
    id: "shortcuts",
    label: "Shortcuts",
    emoji: "⌨️",
    blurb: "Common game room actions are available from the keyboard.",
    sections: [
      {
        icon: "⌨️",
        title: "Keyboard Shortcuts",
        bullets: [
          "Ctrl + S: Save Game",
          "Ctrl + N: Next Phase",
          "Ctrl + R: Restart Voyage (host only)",
          "Ctrl or Cmd + K: Open Quick Actions",
          "F1: Open this guide",
          "Esc: Close any open dialog",
        ],
      },
      {
        icon: "⚓",
        title: "Bon Voyage",
        intro: `${APP_NAME} puts you on the ancient Silk Road for ${cfg.rounds} rounds of trading, production, risk, and shared harbor decisions.`,
        callout: {
          tone: "success",
          text: "Good winds and good margins, Captain. ⚓",
        },
      },
    ],
  });

  return tabs;
}

// =====================================================================
// Tips: structured the same way, but as a single column of sections
// rather than tabs (the tips modal is shorter and reads better as one
// scrollable list with grouped headings).
// =====================================================================

export type TipsGroup = {
  icon: string;
  title: string;
  items: string[];
};

export function tipsGroups(difficulty: Difficulty): TipsGroup[] {
  const cfg = difficultyConfig(difficulty);
  const resources = unlockedResources(difficulty, cfg.rounds);
  const workers = unlockedWorkerTypes(difficulty, cfg.rounds);
  return [
    {
      icon: "💰",
      title: "Financial Management",
      items: [
        "Always maintain reserve funds for expenses",
        `Base maintenance is ${cfg.maintenance} Gold per round before modifiers`,
        "Wages are charged every round for every hired artisan, including idle ones",
        "Calculate total expenditure before buying",
      ],
    },
    {
      icon: "👥",
      title: "Artisan Management",
      items: [
        ...workers.map(
          (worker) => `${worker.label}: ${worker.wage} Gold per round`,
        ),
        "Hire only as needed",
      ],
    },
    {
      icon: "🔮",
      title: "Broker's Whisper Strategy",
      items: [
        "Buy rumors early if you have spare gold",
        "Hoard revealed items to guarantee Phase 2 profits",
        "Balance intel purchases with other investments",
      ],
    },
    {
      icon: "🛒",
      title: "Buying Strategy",
      items: [
        "Reserve funds for maintenance + wages first",
        "Select goods with strong value for money",
        `Goods that can open during this voyage: ${resources.join(", ")}`,
        "Prioritize port specialties + revealed intel",
      ],
    },
    {
      icon: "🔄",
      title: "Bartering Strategy",
      items: [
        "Trade away surplus raw materials for the one you're actually short on",
        "A modest Gold offer can secure a needed item faster than waiting on the next round's market",
        "Cancel an offer that's sitting unclaimed if you'd rather keep the material yourself",
      ],
    },
    {
      icon: "🤝",
      title: "Trading Strategy",
      items: [
        "Prioritize highest profit orders",
        "Consider freight impact on margins",
        "Finished orders yield high profit but incur VAT",
      ],
    },
    {
      icon: "⚠️",
      title: "Risk Control",
      items: [
        "Calculate fixed round costs: Maintenance + Wages",
        "Keep funds consistently greater than fixed costs",
        "Avoid cash flow issues from expanding too quickly",
      ],
    },
    {
      icon: "🏴‍☠️",
      title: "Pirates and Escorts",
      items: [
        "The escort fee scales with your own Gold, so it's relatively cheap exactly when you're poor and the stakes are also low",
        "Hire one when you're carrying enough Gold that losing it would actually hurt",
        "Sailing without one is a fair bet when you have little to lose anyway",
      ],
    },
    {
      icon: "🆘",
      title: "Borrowing and Lending",
      items: [
        `Repay a loan as soon as you can afford it, instead of waiting for it to be deducted automatically at Round ${cfg.rounds}`,
        "Lending Gold raises your own reputation, so helping a captain who can clearly repay you is rarely a bad trade",
        "Watch how much you've lent out across the voyage; it's still your Gold until it's actually repaid",
      ],
    },
    {
      icon: "🛡️",
      title: "Backing Strategy",
      items: [
        "Back a loan you'd have happily lent Gold on yourself; you're taking on the same risk without earning the lender's own full reputation rate",
        "Only pledge what you can afford to lose outright, the same rule as lending directly",
        "A loan to a captain who's clearly about to turn a profit is a safer backing bet than one taken late in the voyage with little runway left to repay it",
      ],
    },
  ];
}
