import type { Kind } from "./quotes";

// Sample prices for trying the app. Not market data: the garage should replace them with its own rates.
export const SAMPLE_PRICES: { name: string; kind: Kind; unit_price_paise: number }[] = [
  { name: "Front brake pads (pair)", kind: "part", unit_price_paise: 180000 },
  { name: "Brake pad replacement labour (per axle)", kind: "labour", unit_price_paise: 80000 },
  { name: "Brake disc skimming (per disc)", kind: "service", unit_price_paise: 60000 },
  { name: "AC service (cooling check, leak check, gas top-up)", kind: "service", unit_price_paise: 180000 },
  { name: "Engine oil change with oil filter", kind: "service", unit_price_paise: 220000 },
  { name: "Air filter", kind: "part", unit_price_paise: 45000 },
  { name: "Wheel alignment", kind: "service", unit_price_paise: 70000 },
  { name: "Wheel balancing (per wheel)", kind: "service", unit_price_paise: 15000 },
  { name: "General inspection labour (per hour)", kind: "labour", unit_price_paise: 50000 },
];
