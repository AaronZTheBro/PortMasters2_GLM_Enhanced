import { COLORS, ICONS } from "@/lib/game/constants";
import { cn } from "@/lib/utils";

const cargoShapes: Record<string, string> = {
  Gold: "M12 2 21 7v10l-9 5-9-5V7Zm0 0v20M3 7l9 5 9-5m-6 1V5",
  Hemp: "M12 21V4m0 12c-4 0-8-2-9-6 4 0 7 1 9 5m0-3c4-1 7-4 7-8-4 2-6 4-7 8m0 6c3 0 6-1 8-4-4 0-6 1-8 4m0-8C8 8 7 5 7 3c3 1 5 3 5 7",
  Silk: "M4 6c2-3 5-3 8-1l8 5-5 10c-3 1-8-1-12-4l5-9m4-2c-2 0-3 2-4 3l8 5 4-3m-4 3-3 7",
  Tea: "M5 17C3 9 8 5 20 3c0 10-6 16-14 15m-3 3L17 7m-8 9v-6m3 3h5",
  Bamboo:
    "M6 21 9 3m1 18 6-18M7 15l5 1m-4-6 6 1m1 3c2-4 5-5 7-5-1 3-3 5-7 5m-9-2C3 11 2 9 2 6c2 0 4 2 4 6",
  Beeswax:
    "M12 3 20 7v10l-8 4-8-4V7Zm-3 7h6l2 4-2 3H9l-2-3Zm3-7v7m-8 7 3-3m10 0 3 3",
  "Iron Sand":
    "M3 19 6 12l3 2 3-7 4 8 3-2 2 6Zm4-2h.1m6-1h.1m3 2h.1M5 7h.1m13-2h.1m2 4h.1",
  "River Lacquer":
    "M5 8h14l2 10-4 3H7l-4-3Zm1 0V5l6-2 6 2v3M4 16h16m-6-5 2 3h-4z",
  Frankincense:
    "M5 17 8 9l5-3 4 4 3 8-6 3-6-1Zm3-8 4 6 5-5m-5 5 2 6m-9-4 7-2m1-9 1-3",
  "Lapis Lazuli":
    "M3 9 9 4h6l6 5-2 8-7 4-7-4Zm0 0 7 2 2 10m9-12-7 2-2 10m-2-10 2-7 2 7m-4 0h4",
  "Porcelain Clay":
    "M3 16 6 9l9-3 6 4v8l-10 3Zm0 0 8 1 10-7m-10 7v4m-6-9 7 1 5-4",
  "Copper Ore": "M3 15 7 6l8-2 5 4 1 9-7 4-8-2Zm4-9 4 7 9-5m-9 5 3 8m-11-6 8-2",
  Spices:
    "M4 16c6 2 7-5 10-6 3-2 6 0 4 4-3 5-9 7-14 2Zm13-6c0-4 2-6 5-6m-12 6 2-3m-5 6 1-3",
  Pearls:
    "M4 13c0-6 4-9 8-10 4 1 8 4 8 10 0 4-3 8-8 8s-8-4-8-8Zm0 1 5 1m6 0 5-1m-8 4a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-4-9-1-2m9 2 1-2",
  "Linen Clothes":
    "M8 4 4 5l-2 7 4 1 1-3v11h10V10l1 3 4-1-2-7-4-1-4 4Zm4 4v12m-3-7h1m4 3h1",
  "Cotton Clothes":
    "M7 4 2 8l3 5 3-2v10h8V11l3 2 3-5-5-4h-2c0 4-6 4-6 0Zm1 13h8m-6-5h4",
  Brocade:
    "M5 4h14l-1 3 2 12-3 1-3-1-3 1-3-1-3 1 1-13Zm1 3h12m-6 3 3 3-3 3-3-3Zm0 0v6",
  Sachet:
    "M8 3h8l-1 5c4 4 6 7 4 11-2 3-12 3-14 0-2-4 0-7 4-11Zm0 5h8m-4 5v5m-2-3h4",
  "Bronze Mirror":
    "M12 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 11v4m-2 0h4m-2-11h.1",
  "Celadon Ware":
    "M3 9h18c-1 7-5 9-9 9s-8-2-9-9Zm4 6c3 1 7 1 10 0m-8 6h6m-3-3v3M3 9c1-4 17-4 18 0",
  "Foreign Balm":
    "M9 3h6v5l3 3v9H6v-9l3-3Zm0 5h6m-9 4h12m-12 5h12m-6-4v3m-2-1.5h4",
  "Pearl String":
    "M5 4c-2 6 0 12 7 16 7-4 9-10 7-16m-15 6h.1m2 5h.1m3 3h.1m6 0h.1m3-3h.1m2-5h.1m-8 12h.1",
  "Bamboo Mat": "M5 3h14v18H5Zm0 4h14M5 11h14M5 15h14M5 19h14M9 3v18m6-18v18",
  "Waxed Canvas":
    "M4 20V7l5-3 10 3v13l-6-3Zm0-13 9 3v7m0-7 6-3m-9 6c0 2-3 2-3 0 0-1 1-2 1.5-3 .5 1 1.5 2 1.5 3",
  "Scented Candle":
    "M8 10h8v11H8Zm4 0V8c-4-1-1-5 1-6 1 3 3 5-1 6m-4 5c4 2 4-2 8 0m-11 8h14",
  "Inlaid Kettle":
    "M7 9h11c3 3 3 8-1 10H8c-3-2-4-6-1-10Zm0 0C2 1 21 1 18 9M6 12 2 9v4l4 3m5-8V6h3v2m-4 7 3-3 3 3-3 2z",
  "Lacquered Jar":
    "M8 5h8l-1 3c5 4 6 10 2 13H7c-4-3-3-9 2-13Zm0 0 1-2h6l1 2m-7 3h6m-8 8 5-4 5 4-5 3z",
  "Lacquered Mirror":
    "M8 3h8l5 5v8l-5 5H8l-5-5V8Zm1 3h6l3 3v6l-3 3H9l-3-3V9Zm1 7 3-4m0 6 2-3",
  "Incense Oil":
    "M9 3h6v3h-1v3l4 4v6l-2 2H8l-2-2v-6l4-4V6H9Zm1 3h4m-2 6c2 2 3 3 3 4a3 3 0 1 1-6 0c0-1 1-2 3-4Z",
  "Lapis Pendant":
    "M5 3c1 4 3 6 7 8 4-2 6-4 7-8m-7 8 5 4-5 7-5-7Zm-5 4h10m-5 7v-11",
  "Pearl and Lapis Strand":
    "M4 4c0 6 2 11 8 13 6-2 8-7 8-13m-15 6h.1m3 5h.1m8 0h.1m3-5h.1m-7 7 3 3-3 2-3-2Z",
  Indigo:
    "M12 3 18 5v4l3 8-2 4H5l-2-4 3-8V5Zm-6 6h12M7 16h10m-5-4 2 2-2 2-2-2Z",
  Sandalwood:
    "M5 13 15 3c3-1 7 3 6 6L11 19c-3 3-9-3-6-6Zm0 0c2-2 8 4 6 6m-2-7 7-7m-4 10 7-7M6 20l8-8",
  Tin: "M6 6h12l4 6-3 6H5l-3-6Zm0 0 3 6h13M9 12l-4 6m5-9h6m-4 6h5",
  "Sea Salt":
    "M10 3h4l2 5 2 1 2 10-2 2H6l-2-2L6 9l2-1Zm-2 5h8M6 9h12m-8-4h4m-6 9h.1m4 3h.1m4-4h.1",
  "Indigo Sailcloth":
    "M5 4c5-2 9 3 14 1v14c-5 2-9-3-14-1Zm3 3v9m8-8v9m-6-4 3-4 2 5m-5-1 5 1",
  "Sandalwood Censer":
    "M5 12h14c0 5-3 7-7 7s-7-2-7-7Zm0 0c2-3 12-3 14 0M8 20h8m-9-1v2m10-2v2M11 9c-3-3 3-4 1-7m4 7c-2-2 2-3 1-5",
  "Salt Glazed Bowl":
    "M3 8c3-4 15-4 18 0 0 6-4 10-9 10S3 14 3 8Zm0 0c3 4 15 4 18 0M8 19l-1 2h10l-1-2m-6-6h.1m4 1h.1",
  "Tinbound Tea Chest":
    "M4 7 7 4h10l3 3v13H4Zm0 0h16M4 12h16M8 7v13m8-13v13m-6-7h4v3h-4Z",
};

export function CommodityIcon({
  item,
  className,
}: {
  item: string;
  className?: string;
}) {
  const shape = cargoShapes[item];
  if (!shape) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(
        "inline-block size-4 shrink-0 align-text-bottom",
        className,
      )}
      aria-hidden="true"
      data-commodity={item}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle
        cx="12"
        cy="12"
        r="11.5"
        fill={COLORS[item]}
        fillOpacity="0.16"
        stroke="none"
      />
      <path d={shape} />
    </svg>
  );
}

const legacyEmoji: Record<string, string> = {
  "Inlaid Kettle": "🫖",
  "River Lacquer": "🏺",
  "Lacquered Mirror": "🪞",
  "Incense Oil": "🧴",
  "Pearl and Lapis Strand": "📿",
};

const ledgerNames = new Map(
  Object.keys(cargoShapes).flatMap((item) =>
    [ICONS[item], legacyEmoji[item]]
      .filter(Boolean)
      .map((icon) => [`${icon}${item}`, item] as const),
  ),
);
const ledgerParts = new RegExp(
  `(${[...ledgerNames.keys()].sort((a, b) => b.length - a.length).join("|")})`,
  "gu",
);

export function commodityLedgerText(line: string) {
  return line.split(ledgerParts).map((part, index) => {
    const item = ledgerNames.get(part);
    return item ? (
      <span key={index}>
        <CommodityIcon item={item} /> {item}
      </span>
    ) : (
      part
    );
  });
}
