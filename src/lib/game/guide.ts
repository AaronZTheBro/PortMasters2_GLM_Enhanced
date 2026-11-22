import {
  CLASSIC_RULES,
  EXPANDED_RULES,
  FORECAST_WINDOWS,
  RAID_TERMS,
} from "./expansion";
// =====================================================================
// PortMasters 2: structured guide content
// GuideModal and TipsModal render these difficulty aware sections directly.
// Values that affect player decisions come from the same content and
// difficulty records used by the engine.
// =====================================================================

import {
  APP_NAME,
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
  canProduce,
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

export function guideTabs(
  difficulty: Difficulty,
  rulesVersion = CLASSIC_RULES,
): GuideTab[] {
  const cfg = difficultyConfig(difficulty);
  const newRules = rulesVersion === EXPANDED_RULES;
  const mandates = mandateRounds(cfg);
  const resources = unlockedResources(difficulty, cfg.rounds, rulesVersion);
  const products = unlockedProducts(difficulty, cfg.rounds, rulesVersion);
  const workers = unlockedWorkerTypes(difficulty, cfg.rounds);
  const workerCopy = workers.map((worker) => {
    const output = products
      .filter((product) => canProduce(worker.id, product))
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
          text: "The eligible solvent captain with the highest Reputation is crowned Sea Master.",
        },
      },
      {
        icon: "🔄",
        title: "Round Sequence",
        intro:
          "Every round follows the same synchronized sequence. The room advances after every active captain is ready.",
        bullets: [
          "Draft a Boon for one round",
          "Phase 1 buys cargo and reveals rumors from the Broker's Rumor Board",
          "Barter: exchange goods or Gold with other captains",
          "Artisan Management: hire workers and assign production",
          "Phase 2: complete trade orders",
          "Phase 3: finish production, resolve pirates, then pay wages and maintenance",
          "Phase 4 opens the Shipyard. Income Tax is assessed when you end the round.",
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
          `Raw materials available during this voyage: ${resources.join(", ")}`,
          `Finished goods available during this voyage: ${products.join(", ")}`,
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
          text: "Hiring adds a wage to your Phase 3 bill. Dismissing an artisan immediately costs one base wage.",
        },
      },
      {
        icon: "🧾",
        title: "Tax System",
        bullets: [
          "VAT is 5% of the positive margin per finished good sold, rounded down. The margin uses average recipe material prices and the recipe's base wage. Raw goods and Imperial Mandates are exempt.",
          "Base Income Tax is 10% of positive round trading profit, rounded down, after deducting market purchases, freight, audits, wages, and maintenance. It is collected after the Shipyard.",
        ],
      },
      {
        icon: "⚓",
        title: "Freight and order bonuses",
        bullets: [
          "Start at 2 Gold per cargo unit. Subtract the ship level and Favorable Tides reductions, keeping a base minimum of 5 Gold.",
          `Then apply Bulk Hauler Rigging and Overdrive Engine. Split the remaining freight by unit count for Silk Winds and Silk Road Monopoly, rounding down. Apply Fleet of Treasures${newRules ? ", then Cargo Net and Convoy Pennant when eligible" : " last"}. Freight cannot fall below zero.`,
          "Salvage Crane can refund the quoted freight. Tax Evasion Ledger can charge an audit after an order. The order card shows those chances when they apply.",
          "Reward bonuses apply to the eligible share by cargo units after VAT. Apply Silk Road Monopoly, Kiln and Forge Guild, Maritime Bureau Token, then Exotic Treasures, rounding down each bonus. Mandate rewards are fixed.",
        ],
      },
      {
        icon: "🔮",
        title: "Broker's Whisper",
        intro:
          "Open the Broker's Rumor Board during buying. It shows how many rumors the current price buys.",
        bullets: [
          "Each revealed rumor guarantees exactly one order at the named port in Phase 2. Look for the Guaranteed badge on that buyer.",
          "The usual price is 5 Gold for one rumor. Broker's Network charges 2 Gold for up to two, and Ocean Interpreter adds one when available.",
          "Farsight costs no Gold and draws from the same pool. Modules only add rumors to paid purchases.",
        ],
        ...(cfg.brokerCorruption
          ? {
              callout: {
                tone: "danger" as CalloutTone,
                text: `Each paid purchase has a ${Math.round(cfg.brokerCorruptionChance * 100)}% chance to add ${Math.round(cfg.brokerCorruptionRisk * 100)} percentage points to base raid risk. The leak happens at most once per round, and you still receive every rumor.`,
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
          "Lending Gold raises your own Reputation, scaled to how much you lent",
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
  const terms = RAID_TERMS[difficulty];
  const riskSections: GuideSection[] = [
    {
      icon: "🏴‍☠️",
      title: "Pirates and Escorts",
      intro: newRules
        ? `On direct passage, base raid risk is ${raidCopy(cfg)}. A raid can take ${Math.round(terms.lossRate * 100)}% of Gold exposed after protection. Up to ${Math.round(terms.reserveRate * 100)}% of current bills can be reserved from available funds.`
        : `Phase 3, after production and before bills: ${raidCopy(cfg)} of losing every Gold coin you're carrying.`,
      bullets: [
        `Hire an escort for ${escortPct(
          cfg,
        )} of ${newRules ? "Gold beyond the reserve for bills" : "current Gold"} to guarantee safe passage`,
        "The choice has to be made before that round's pirates are rolled for",
      ],
      callout: {
        tone: "info",
        text: "The escort fee scales with your own Gold, so it's relatively cheap exactly when you're poor and the stakes are also low.",
      },
    },
  ];

  if (newRules) {
    riskSections.unshift({
      icon: "🧭",
      title: "Harbor Forecasts",
      intro: `Check the briefing before drafting in rounds ${FORECAST_WINDOWS[difficulty].join(", ")}.`,
      bullets: [
        "Market Day features a material lot and adds a discount to its listed prices. The combined adjustment from the forecast and Harbor Pulse is capped at 15% in either direction. Guild Exhibition reserves two buyers for the named finished good.",
        "Heavy Seas raises base raid risk by four percentage points, capped at 50% before personal effects.",
        "Every round has a staple lot and a staple contract. Confirmed Broker rumors occupy separate slots.",
        "Emergency Loan can be offered when your Gold is below the estimated bills and you have yet to use the Boon this voyage.",
        "Imperial Mandate cargo is announced up to two rounds in advance. Production lands at settlement.",
      ],
    });
  }

  if (mandates.length) {
    riskSections.push({
      icon: "📜",
      title: "Imperial Mandates",
      intro: `On round${mandates.length === 1 ? "" : "s"} ${mandates.join(
        ", ",
      )} the Emperor commissions one order at a fixed reward.`,
      bullets: [
        "A mandate has a fixed reward with no VAT or reward bonuses. Freight discounts still apply.",
        "Every captain gets a personal copy of the same mandate. Completing yours leaves the other captains' copies available.",
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
      intro: `When the captains' combined Reputation reaches ${TIDEWATCH_SURGE_THRESHOLD}, the harbor takes notice of a bustling crew.`,
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
          "A module stays equipped for the voyage until you replace it. Each upgrade opens one slot, up to three.",
          "You can reroll the remaining draft once per round for free. Boon rerolls cost 10 Gold once per round.",
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
          "A captain who cannot repay a loan at the end of the voyage is bankrupt and cannot win the Sea Master crown",
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

export function tipsGroups(
  difficulty: Difficulty,
  rulesVersion = CLASSIC_RULES,
): TipsGroup[] {
  const cfg = difficultyConfig(difficulty);
  const resources = unlockedResources(difficulty, cfg.rounds, rulesVersion);
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
        "Buy rumors early if you have spare Gold",
        "Use revealed demand to plan purchases and production. Check freight and VAT before filling the order.",
        "Balance rumor purchases with other expenses",
      ],
    },
    {
      icon: "🛒",
      title: "Buying Strategy",
      items: [
        "Reserve funds for maintenance + wages first",
        "Select goods with strong value for money",
        `Goods that can open during this voyage: ${resources.join(", ")}`,
        "Prioritize port specialties and goods named in rumors",
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
        "Finished good orders can have larger rewards. Compare the payout after freight and VAT.",
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
        "Lending Gold raises your own Reputation, so helping a captain who can clearly repay you is rarely a bad trade",
        "Watch how much you've lent out across the voyage; it's still your Gold until it's actually repaid",
      ],
    },
    {
      icon: "🛡️",
      title: "Backing Strategy",
      items: [
        "Back a loan you'd have happily lent Gold on yourself; you're taking on the same risk and earn Reputation if the loan is fully repaid",
        "Only pledge what you can afford to lose outright, the same rule as lending directly",
        "A loan to a captain who's clearly about to turn a profit is a safer backing bet than one taken late in the voyage with little runway left to repay it",
      ],
    },
  ];
}

export function tutorialSteps(
  difficulty: Difficulty,
  rulesVersion = CLASSIC_RULES,
): { title: string; content: string }[] {
  const cfg = difficultyConfig(difficulty);
  const mandates = mandateRounds(cfg);
  const availableResources = unlockedResources(
    difficulty,
    cfg.rounds,
    rulesVersion,
  );
  const availableProducts = unlockedProducts(
    difficulty,
    cfg.rounds,
    rulesVersion,
  );
  const workerRoster = unlockedWorkerTypes(difficulty, cfg.rounds);
  const workerWages = workerRoster.map((worker) => worker.wage);
  const minimumWage = Math.min(...workerWages);
  const maximumWage = Math.max(...workerWages);
  const newRules = rulesVersion === EXPANDED_RULES;
  const charterResources = availableResources.slice(
    unlockedResources(difficulty, 1, rulesVersion).length,
  );
  const marketCopy = charterResources.length
    ? `The market begins with Hemp, Silk, and Tea. Later rounds add ${charterResources.join(", ")}.`
    : "The market remains on the founding trade: Hemp, Silk, and Tea.";
  const workerCopy = workerRoster
    .map((worker) => `${worker.label} (${worker.wage}g)`)
    .join(", ");
  return [
    {
      title: "⚓ Welcome aboard",
      content: `<p>${APP_NAME} puts you on the ancient Silk Road for a voyage of ${cfg.rounds} rounds with limited Gold and a harbor full of rival captains.</p>
<p>These waters are <strong>${cfg.name}</strong>: ${cfg.tagline}</p>
<p>The rules are easy to pick up, but money is tight early on and a string of bad calls compounds quickly. This guide covers the full round flow and the decisions that most often sink a first voyage.</p>
<p style="color:var(--muted-foreground);font-size:13px">Use the full guide for reference during the voyage.</p>`,
    },
    {
      title: "🏆 What you're playing for",
      content: `<p>After round ${cfg.rounds}, the solvent captain with the highest Reputation is crowned <strong>Sea Master</strong>. Reputation comes mainly from profitable trade orders.</p>
<p>Reaching zero Gold does not end the voyage by itself. Bankruptcy happens if you cannot cover wages or maintenance at settlement, or if a loan remains unpaid at the end of the voyage.</p>
<p>These waters start you with <strong>${cfg.startingGold} Gold</strong> before any Renown bonus. That is enough to get moving, but not enough to ignore the next settlement.</p>`,
    },
    {
      title: "🔄 How each round works",
      content: `<p>Each of the ${cfg.rounds} rounds follows the same synchronized sequence:</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr));gap:8px;margin:12px 0">
  <div style="background:#F3E8FF;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #8B5CF6"><strong>Draft</strong><br><span style="font-size:12px;color:#444">Choose a Boon for this round</span></div>
  <div style="background:#E8F5E9;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #4CAF50"><strong>1️⃣ Buy</strong><br><span style="font-size:12px;color:#444">Stock up at port markets</span></div>
  <div style="background:#FFF8E1;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #FFA000"><strong>🤝 Barter</strong><br><span style="font-size:12px;color:#444">Swap goods with other captains</span></div>
  <div style="background:#F0FDFA;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #0D9488"><strong>Artisans</strong><br><span style="font-size:12px;color:#444">Hire workers and assign production</span></div>
  <div style="background:#E3F2FD;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #2196F3"><strong>2️⃣ Trade</strong><br><span style="font-size:12px;color:#444">Sell to waiting buyers</span></div>
  <div style="background:#FFF3CD;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #FFC107"><strong>3️⃣ Settle</strong><br><span style="font-size:12px;color:#444">Production lands, pirates resolve, then bills come due</span></div>
  <div style="background:#FCE4EC;color:#17212a;border-radius:6px;padding:10px;border-left:3px solid #E91E63"><strong>4️⃣ Upgrade</strong><br><span style="font-size:12px;color:#444">Improve your ship</span></div>
</div>
<p style="font-size:12px;color:var(--muted-foreground);margin:4px 0 0">The room advances only after every active captain is ready. In the game room, <kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl+N</kbd> performs the current Next Phase action.</p>`,
    },
    {
      title: "🏪 Phase 1: Buying",
      content: `<p>${marketCopy} Prices and card selection change each round. Buy now, barter if you need to, then sell in Phase 2. That is the core loop.${newRules ? " The opening briefing highlights any forecast event. Look for the staple lot and its matching staple contract each round." : ""}</p>
<p>One thing worth knowing about: the <strong>Broker</strong>. Pay a small fee for a demand rumor and a specific trade order is <em>guaranteed</em> to appear when Phase 2 opens. Useful when you have stocked a particular good and want to make sure a buyer shows up.</p>
<div style="background:#FFF8DC;color:#17212a;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  💡 Early on, raw materials are easier to manage because they can be sold in the same round. Finished goods need materials, an artisan, and one production cycle.
</div>`,
    },
    {
      title: "🤝 Bartering",
      content: `<p>Right after buying, there's a short window where captains can trade directly with each other instead of through the market. Post an offer, like Hemp you don't need for Silk you do, and any other captain in the harbor can take it with one click.</p>
<p>It is the easiest way to recover from a bad draw. All Tea and no Silk, and expecting a Sachet buyer? Someone else in the harbor has probably drawn the opposite problem.</p>
<div style="background:#FFF8DC;color:#17212a;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  A few ground rules: you can't offer an item for itself, both amounts have to be whole numbers of at least one, and you can never offer more than you currently have. The moment you post an offer, that amount is set aside until someone takes it or you cancel it.
</div>
<p style="font-size:13px;color:var(--foreground);margin-top:8px">Nobody has to barter. If nothing on the board interests you, or nobody is offering anything, just move on to the next phase.</p>`,
    },
    {
      title: "📋 Phase 2: Filling orders",
      content: `<p>Trade orders appear and you match your cargo to them. Each one shows the goods needed, the reward, and the shipping fee. Your take is whatever is left after fees and tax.</p>
<p>You can fill as many orders as your cargo allows in a single phase.</p>
<div style="background:#E3F2FD;color:#17212a;border:1px solid #2196F3;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  📌 <strong>Finished goods</strong> available during this voyage include ${availableProducts.join(", ")}. They usually command larger rewards, but their recipes consume materials and production completes after the order phase.
</div>
${mandates.length ? `<p style="font-size:13px;margin-top:10px">📜 On round${mandates.length === 1 ? "" : "s"} ${mandates.join(", ")} the Emperor commissions a <strong>mandate</strong>: one order at a fixed reward, with no VAT or reward bonuses. Plan your inventory and bartering around it.</p>` : ""}`,
    },
    {
      title: "⚠️ The artisan trap",
      content: `<p>Artisans turn raw materials into valuable finished goods and collect wages at each Phase 3. That part is simple. What catches most new players is this:</p>
<div style="background:#C62828;color:#fff;border-radius:6px;padding:12px;margin:12px 0;text-align:center;font-size:14px;font-weight:bold;line-height:1.7">
  Assign a task this round.<br>Production lands at settlement, after this round's order phase.
</div>
<p style="font-size:13px;color:var(--foreground);line-height:1.6">Artisans available during this voyage are ${workerCopy}. Every hired artisan charges wages <strong>each round</strong>, even when idle. Hire only when you can cover payroll alongside maintenance.</p>`,
    },
    {
      title: "🏴‍☠️ Pirates at Phase 3",
      content: `<p>After production and before the bills come due each round, there is ${raidCopy(cfg)} that pirates find your ship. ${newRules ? `A raid takes ${Math.round(RAID_TERMS[difficulty].lossRate * 100)}% of exposed Gold before personal reductions.` : "A raid takes all Gold you are carrying."}</p>
<p>You get one choice before that roll happens: hire an escort for ${escortPct(cfg)} of ${newRules ? "Gold beyond the reserve for bills" : "your current Gold"} and sail through guaranteed safe, or set sail anyway and keep the Gold if the pirates don't show.</p>
${cfg.brokerCorruption ? `<p>In these waters a broker can be corrupt. The rumor you buy is still true and still arrives, always, but a corrupt one also leaks your position to the pirates. The log says so plainly when it happens, and the odds you see already include it.</p>` : ""}
<div style="background:#FFF8DC;color:#17212a;border:1px solid #FFA000;border-radius:6px;padding:9px;font-size:13px;margin-top:10px;line-height:1.5">
  💡 Compare the escort fee and the possible raid loss with your Gold after bills before making your choice.
</div>`,
    },
    {
      title: "💸 Phase 3: Settlement",
      content: `<p>Once the pirates are dealt with, two bills come due:</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0">
  <div style="background:#E3F2FD;color:#17212a;border-radius:6px;padding:10px;text-align:center">
    <div style="font-size:22px;margin-bottom:4px">🔧</div>
    <strong>Ship Maintenance</strong><br>
    <span style="font-size:12px;color:#444">${cfg.maintenance} Gold per round before modifiers</span>
  </div>
  <div style="background:#FCE4EC;color:#17212a;border-radius:6px;padding:10px;text-align:center">
    <div style="font-size:22px;margin-bottom:4px">👥</div>
    <strong>Artisan Wages</strong><br>
    <span style="font-size:12px;color:#444">${minimumWage} to ${maximumWage} Gold per artisan per round</span>
  </div>
</div>
<p style="font-size:13px;color:var(--foreground)">The <strong>Due</strong> total in Status and the Dues tab show exactly what is owed. Check them before spending anything.</p>
<p style="font-size:13px;color:var(--foreground)">Coming up short isn't the end on its own. Right there on the settlement screen, you can ask another captain in the harbor for a loan, and they can send it to you on the spot if they've got the Gold to spare. Just repay it before the voyage's last round ends, or it comes out of your funds automatically and goes straight to them.</p>`,
    },
    {
      title: "🚢 You are ready",
      content: `<p>Keep these points in mind as you play:</p>
<ul style="padding-left:18px;line-height:2.1;font-size:14px">
  <li>Start with raw material orders. Fast money, no complications.</li>
  <li>Keep a reserve above the exact wages and maintenance shown in Status and Dues.</li>
  <li>Hire artisans only when you can cover their wages for more than the current round.</li>
  <li>Ship upgrades add a module slot and reduce base freight. Keep enough Gold for later bills.</li>
  <li>Caught short by pirates or a bad round? Ask the harbor for a loan before you assume the voyage is over.</li>
  <li>An eligible finished voyage banks final Reputation as Renown XP, win or lose. Check your Captain's Legacy from the Lobby.</li>
  <li><kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl+S</kbd> saves, <kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">Ctrl/Cmd+K</kbd> opens Quick Actions, and <kbd style="background:#eee;color:#17212a;border:1px solid #ccc;padding:1px 6px;border-radius:3px">F1</kbd> opens the full guide.</li>
</ul>
<div style="background:#E8F5E9;color:#17212a;border:2px solid #4CAF50;border-radius:8px;padding:12px;text-align:center;margin-top:14px">
  <strong style="font-size:15px">Good winds and good margins, Captain. ⚓</strong>
</div>`,
    },
  ];
}
