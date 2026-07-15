// Watchlist definitions for both markets.
// basePrice is only used to seed realistic sample data when live feeds are
// unreachable — it is never shown as a live price.

export interface WatchlistEntry {
  symbol: string;
  name: string;
  sector: string;
  basePrice: number; // sample-data seed, approximate recent level
  drift: number;     // sample-data annual drift (e.g. 0.15 = +15%/yr trend)
  vol: number;       // sample-data annualized volatility (e.g. 0.30)
}

export interface MarketConfig {
  id: "psx" | "us";
  label: string;
  currency: string;
  currencySymbol: string;
  indexName: string;
  stocks: WatchlistEntry[];
}

export const PSX: MarketConfig = {
  id: "psx",
  label: "Pakistan (PSX)",
  currency: "PKR",
  currencySymbol: "Rs ",
  indexName: "PSX watchlist index",
  stocks: [
    { symbol: "OGDC", name: "Oil & Gas Development Co", sector: "Energy", basePrice: 225, drift: 0.30, vol: 0.32 },
    { symbol: "PPL", name: "Pakistan Petroleum", sector: "Energy", basePrice: 190, drift: 0.25, vol: 0.34 },
    { symbol: "MARI", name: "Mari Energies", sector: "Energy", basePrice: 640, drift: 0.28, vol: 0.36 },
    { symbol: "PSO", name: "Pakistan State Oil", sector: "Energy", basePrice: 385, drift: 0.20, vol: 0.38 },
    { symbol: "LUCK", name: "Lucky Cement", sector: "Cement", basePrice: 1060, drift: 0.35, vol: 0.30 },
    { symbol: "ENGRO", name: "Engro Holdings", sector: "Conglomerate", basePrice: 320, drift: 0.15, vol: 0.28 },
    { symbol: "FFC", name: "Fauji Fertilizer", sector: "Fertilizer", basePrice: 455, drift: 0.32, vol: 0.26 },
    { symbol: "EFERT", name: "Engro Fertilizers", sector: "Fertilizer", basePrice: 212, drift: 0.18, vol: 0.24 },
    { symbol: "HBL", name: "Habib Bank", sector: "Banking", basePrice: 285, drift: 0.28, vol: 0.30 },
    { symbol: "UBL", name: "United Bank", sector: "Banking", basePrice: 375, drift: 0.34, vol: 0.32 },
    { symbol: "MCB", name: "MCB Bank", sector: "Banking", basePrice: 265, drift: 0.22, vol: 0.26 },
    { symbol: "MEBL", name: "Meezan Bank", sector: "Banking", basePrice: 350, drift: 0.30, vol: 0.28 },
    { symbol: "HUBC", name: "Hub Power", sector: "Power", basePrice: 152, drift: 0.12, vol: 0.34 },
    { symbol: "SYS", name: "Systems Limited", sector: "Technology", basePrice: 455, drift: 0.10, vol: 0.40 },
    { symbol: "TRG", name: "TRG Pakistan", sector: "Technology", basePrice: 66, drift: 0.05, vol: 0.48 },
    { symbol: "AIRLINK", name: "Air Link Communication", sector: "Technology", basePrice: 178, drift: 0.20, vol: 0.44 },
  ],
};

export const US: MarketConfig = {
  id: "us",
  label: "United States",
  currency: "USD",
  currencySymbol: "$",
  indexName: "US watchlist index",
  stocks: [
    { symbol: "AAPL", name: "Apple", sector: "Technology", basePrice: 232, drift: 0.10, vol: 0.24 },
    { symbol: "MSFT", name: "Microsoft", sector: "Technology", basePrice: 505, drift: 0.16, vol: 0.22 },
    { symbol: "GOOGL", name: "Alphabet", sector: "Technology", basePrice: 198, drift: 0.14, vol: 0.26 },
    { symbol: "AMZN", name: "Amazon", sector: "Consumer", basePrice: 228, drift: 0.15, vol: 0.28 },
    { symbol: "NVDA", name: "NVIDIA", sector: "Semiconductors", basePrice: 172, drift: 0.30, vol: 0.42 },
    { symbol: "META", name: "Meta Platforms", sector: "Technology", basePrice: 715, drift: 0.18, vol: 0.30 },
    { symbol: "TSLA", name: "Tesla", sector: "Automotive", basePrice: 318, drift: 0.02, vol: 0.52 },
    { symbol: "AVGO", name: "Broadcom", sector: "Semiconductors", basePrice: 272, drift: 0.24, vol: 0.34 },
    { symbol: "JPM", name: "JPMorgan Chase", sector: "Banking", basePrice: 292, drift: 0.12, vol: 0.20 },
    { symbol: "V", name: "Visa", sector: "Payments", basePrice: 358, drift: 0.10, vol: 0.18 },
    { symbol: "LLY", name: "Eli Lilly", sector: "Healthcare", basePrice: 785, drift: 0.12, vol: 0.32 },
    { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare", basePrice: 305, drift: -0.05, vol: 0.36 },
    { symbol: "XOM", name: "Exxon Mobil", sector: "Energy", basePrice: 114, drift: 0.04, vol: 0.24 },
    { symbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare", basePrice: 156, drift: 0.05, vol: 0.16 },
    { symbol: "COST", name: "Costco", sector: "Consumer", basePrice: 985, drift: 0.11, vol: 0.20 },
    { symbol: "BRK-B", name: "Berkshire Hathaway", sector: "Diversified", basePrice: 488, drift: 0.08, vol: 0.16 },
  ],
};

export const MARKETS: Record<string, MarketConfig> = { psx: PSX, us: US };
