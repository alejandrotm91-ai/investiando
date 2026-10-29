import { TICKER_CLASSIFICATION } from "./tickerClassification";

export interface IndustryEpsBenchmark {
  sector: string;
  sector_es: string;
  industry: string;
  cagr: number; // Percentage value (e.g. 71.7 for 71.7%)
}

export const INDUSTRY_EPS_BENCHMARKS: IndustryEpsBenchmark[] = [
  // Tecnología
  { sector: "Technology", sector_es: "Tecnología", industry: "Semiconductors", cagr: 71.7 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Computer Hardware", cagr: 48.4 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Semiconductor Equipment & Materials", cagr: 36.7 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Electronic Components", cagr: 32.5 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Communication Equipment", cagr: 24.5 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Scientific & Technical Instruments", cagr: 25.6 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Software - Infrastructure", cagr: 22.6 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Software - Application", cagr: 18.4 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Consumer Electronics", cagr: 12.7 },
  { sector: "Technology", sector_es: "Tecnología", industry: "Information Technology Services", cagr: 7.8 },

  // Financiero
  { sector: "Financials", sector_es: "Financiero", industry: "Mortgage Finance", cagr: 50.6 },
  { sector: "Financials", sector_es: "Financiero", industry: "Capital Markets", cagr: 16.8 },
  { sector: "Financials", sector_es: "Financiero", industry: "Asset Management", cagr: 15.1 },
  { sector: "Financials", sector_es: "Financiero", industry: "Banks - Regional", cagr: 15.1 },
  { sector: "Financials", sector_es: "Financiero", industry: "Credit Services", cagr: 14.6 },
  { sector: "Financials", sector_es: "Financiero", industry: "Banks - Diversified", cagr: 14.1 },
  { sector: "Financials", sector_es: "Financiero", industry: "Insurance Brokers", cagr: 12.2 },
  { sector: "Financials", sector_es: "Financiero", industry: "Financial Conglomerates", cagr: 11.0 },
  { sector: "Financials", sector_es: "Financiero", industry: "Financial Data & Stock Exchanges", cagr: 11.0 },
  { sector: "Financials", sector_es: "Financiero", industry: "Insurance - Reinsurance", cagr: 9.5 },
  { sector: "Financials", sector_es: "Financiero", industry: "Insurance - Life", cagr: 8.7 },
  { sector: "Financials", sector_es: "Financiero", industry: "Insurance - Specialty", cagr: 5.2 },
  { sector: "Financials", sector_es: "Financiero", industry: "Insurance - Diversified", cagr: 3.6 },
  { sector: "Financials", sector_es: "Financiero", industry: "Insurance - Property & Casualty", cagr: 2.0 },

  // Servicios de Comunicación
  { sector: "Communication Services", sector_es: "Servicios de Comunicación", industry: "Broadcasting", cagr: 136.7 },
  { sector: "Communication Services", sector_es: "Servicios de Comunicación", industry: "Advertising Agencies", cagr: 29.2 },
  { sector: "Communication Services", sector_es: "Servicios de Comunicación", industry: "Entertainment", cagr: 21.9 },
  { sector: "Communication Services", sector_es: "Servicios de Comunicación", industry: "Electronic Gaming & Multimedia", cagr: 18.7 },
  { sector: "Communication Services", sector_es: "Servicios de Comunicación", industry: "Internet Content & Information", cagr: 18.6 },
  { sector: "Communication Services", sector_es: "Servicios de Comunicación", industry: "Publishing", cagr: 13.0 },
  { sector: "Communication Services", sector_es: "Servicios de Comunicación", industry: "Telecom Services", cagr: 11.0 },

  // Consumo Discrecional
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Internet Retail", cagr: 26.5 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Gambling", cagr: 18.8 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Travel Services", cagr: 16.9 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Auto Manufacturers", cagr: 21.0 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Lodging", cagr: 15.1 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Luxury Goods", cagr: 14.3 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Auto Parts", cagr: 14.3 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Apparel Retail", cagr: 12.2 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Restaurants", cagr: 11.9 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Specialty Retail", cagr: 11.1 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Home Improvement Retail", cagr: 5.5 },
  { sector: "Consumer Discretionary", sector_es: "Consumo Discrecional", industry: "Department Stores", cagr: 1.1 },

  // Salud
  { sector: "Healthcare", sector_es: "Salud", industry: "Biotechnology", cagr: 22.0 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Health Information Services", cagr: 19.3 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Healthcare Plans", cagr: 15.2 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Drug Manufacturers - Specialty & Generic", cagr: 14.9 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Medical Care Facilities", cagr: 14.6 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Drug Manufacturers - General", cagr: 14.1 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Diagnostics & Research", cagr: 13.2 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Medical Distribution", cagr: 12.4 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Medical Instruments & Supplies", cagr: 12.1 },
  { sector: "Healthcare", sector_es: "Salud", industry: "Medical Devices", cagr: 10.6 },

  // Industrial
  { sector: "Industrials", sector_es: "Industrial", industry: "Electrical Equipment & Parts", cagr: 56.6 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Trucking", cagr: 29.7 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Airlines", cagr: 27.5 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Aerospace & Defense", cagr: 25.0 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Engineering & Construction", cagr: 23.8 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Farm & Heavy Construction Machinery", cagr: 21.4 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Specialty Industrial Machinery", cagr: 16.3 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Industrial Distribution", cagr: 15.4 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Building Products & Equipment", cagr: 16.1 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Integrated Freight & Logistics", cagr: 13.0 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Railroads", cagr: 11.9 },
  { sector: "Industrials", sector_es: "Industrial", industry: "Waste Management", cagr: 11.3 },

  // Consumo Básico
  { sector: "Consumer Staples", sector_es: "Consumo Básico", industry: "Food Distribution", cagr: 13.8 },
  { sector: "Consumer Staples", sector_es: "Consumo Básico", industry: "Discount Stores", cagr: 11.2 },
  { sector: "Consumer Staples", sector_es: "Consumo Básico", industry: "Packaged Foods", cagr: 8.4 },
  { sector: "Consumer Staples", sector_es: "Consumo Básico", industry: "Beverages - Non-Alcoholic", cagr: 8.3 },
  { sector: "Consumer Staples", sector_es: "Consumo Básico", industry: "Tobacco", cagr: 7.7 },
  { sector: "Consumer Staples", sector_es: "Consumo Básico", industry: "Household & Personal Products", cagr: 5.7 },
  { sector: "Consumer Staples", sector_es: "Consumo Básico", industry: "Grocery Stores", cagr: 5.2 },

  // Energía
  { sector: "Energy", sector_es: "Energía", industry: "Oil & Gas Drilling", cagr: 48.8 },
  { sector: "Energy", sector_es: "Energía", industry: "Oil & Gas Refining & Marketing", cagr: 34.0 },
  { sector: "Energy", sector_es: "Energía", industry: "Oil & Gas Equipment & Services", cagr: 17.0 },
  { sector: "Energy", sector_es: "Energía", industry: "Oil & Gas E&P", cagr: 15.5 },
  { sector: "Energy", sector_es: "Energía", industry: "Oil & Gas Integrated", cagr: 14.4 },
  { sector: "Energy", sector_es: "Energía", industry: "Oil & Gas Midstream", cagr: 8.5 },

  // Servicios Públicos (Utilities)
  { sector: "Utilities", sector_es: "Servicios Públicos (Utilities)", industry: "Utilities - Independent Power Producers", cagr: 34.8 },
  { sector: "Utilities", sector_es: "Servicios Públicos (Utilities)", industry: "Utilities - Renewable", cagr: 12.7 },
  { sector: "Utilities", sector_es: "Servicios Públicos (Utilities)", industry: "Utilities - Regulated Water", cagr: 9.9 },
  { sector: "Utilities", sector_es: "Servicios Públicos (Utilities)", industry: "Utilities - Regulated Gas", cagr: 9.2 },
  { sector: "Utilities", sector_es: "Servicios Públicos (Utilities)", industry: "Utilities - Regulated Electric", cagr: 7.7 },
  { sector: "Utilities", sector_es: "Servicios Públicos (Utilities)", industry: "Utilities - Diversified", cagr: 4.8 },

  // Bienes Raíces (Real Estate)
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Healthcare Facilities", cagr: 35.3 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "Real Estate - Diversified", cagr: 19.9 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "Real Estate Services", cagr: 19.7 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Specialty", cagr: 14.2 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Office", cagr: 14.2 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Hotel & Motel", cagr: 14.4 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Diversified", cagr: 8.7 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Industrial", cagr: 3.4 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Mortgage", cagr: 3.2 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Retail", cagr: -1.9 },
  { sector: "Real Estate", sector_es: "Bienes Raíces (Real Estate)", industry: "REIT - Residential", cagr: -8.7 },

  // Materiales
  { sector: "Materials", sector_es: "Materiales", industry: "Aluminum", cagr: 35.8 },
  { sector: "Materials", sector_es: "Materiales", industry: "Steel", cagr: 33.4 },
  { sector: "Materials", sector_es: "Materiales", industry: "Silver", cagr: 27.7 },
  { sector: "Materials", sector_es: "Materiales", industry: "Chemicals", cagr: 25.6 },
  { sector: "Materials", sector_es: "Materiales", industry: "Gold", cagr: 22.5 },
  { sector: "Materials", sector_es: "Materiales", industry: "Copper", cagr: 21.2 },
  { sector: "Materials", sector_es: "Materiales", industry: "Building Materials", cagr: 14.4 },
  { sector: "Materials", sector_es: "Materiales", industry: "Specialty Chemicals", cagr: 13.0 },
  { sector: "Materials", sector_es: "Materiales", industry: "Other Industrial Metals & Mining", cagr: 10.3 },
  { sector: "Materials", sector_es: "Materiales", industry: "Agricultural Inputs", cagr: 4.6 },
];

// Average CAGR per sector as secondary fallback
export const SECTOR_EPS_AVERAGES: Record<string, number> = {
  "Technology": 30.1,
  "Tecnología": 30.1,
  "Financials": 15.0,
  "Financial Services": 15.0,
  "Financiero": 15.0,
  "Finanzas": 15.0,
  "Communication Services": 35.6,
  "Servicios de Comunicación": 35.6,
  "Consumer Discretionary": 14.1,
  "Consumer Cyclical": 14.1,
  "Consumo Discrecional": 14.1,
  "Healthcare": 14.8,
  "Salud": 14.8,
  "Industrials": 22.3,
  "Industrial": 22.3,
  "Industria": 22.3,
  "Consumer Staples": 8.6,
  "Consumer Defensive": 8.6,
  "Consumo Básico": 8.6,
  "Energy": 23.0,
  "Energía": 23.0,
  "Utilities": 13.2,
  "Servicios Públicos": 13.2,
  "Servicios Públicos (Utilities)": 13.2,
  "Real Estate": 11.1,
  "Bienes Raíces": 11.1,
  "Bienes Raíces (Real Estate)": 11.1,
  "Materials": 20.9,
  "Basic Materials": 20.9,
  "Materiales": 20.9,
};

// Clean string for normalized comparison
function clean(str: string): string {
  return str
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

// Map of normalized industry keys to benchmark entries
const NORMALIZED_INDUSTRY_MAP = new Map<string, IndustryEpsBenchmark>();

INDUSTRY_EPS_BENCHMARKS.forEach((item) => {
  NORMALIZED_INDUSTRY_MAP.set(clean(item.industry), item);
  // Also index specific aliases
  if (item.industry === "Semiconductors") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Semiconductors and AI Processors"), item);
    NORMALIZED_INDUSTRY_MAP.set(clean("Semiconductor"), item);
  }
  if (item.industry === "Computer Hardware") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Technology Hardware, Storage and Peripherals"), item);
    NORMALIZED_INDUSTRY_MAP.set(clean("Hardware"), item);
  }
  if (item.industry === "Semiconductor Equipment & Materials") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Semiconductor Materials and Equipment"), item);
  }
  if (item.industry === "Software - Application") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Application Software"), item);
    NORMALIZED_INDUSTRY_MAP.set(clean("Software Application"), item);
  }
  if (item.industry === "Software - Infrastructure") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Systems Software"), item);
    NORMALIZED_INDUSTRY_MAP.set(clean("Software Infrastructure"), item);
    NORMALIZED_INDUSTRY_MAP.set(clean("Internet Services and Infrastructure"), item);
  }
  if (item.industry === "Information Technology Services") {
    NORMALIZED_INDUSTRY_MAP.set(clean("IT Consulting and Other Services"), item);
  }
  if (item.industry === "Electrical Equipment & Parts") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Electrical Components and Equipment"), item);
  }
  if (item.industry === "Building Products & Equipment") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Building Products"), item);
  }
  if (item.industry === "Asset Management") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Asset Management and Custody Banks"), item);
  }
  if (item.industry === "Insurance - Property & Casualty") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Property and Casualty Insurance"), item);
  }
  if (item.industry === "Insurance - Life") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Life and Health Insurance"), item);
  }
  if (item.industry === "Insurance - Diversified") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Multi-line Insurance"), item);
  }
  if (item.industry === "Utilities - Diversified") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Multi-Utilities"), item);
  }
  if (item.industry === "Utilities - Regulated Electric") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Electric Utilities"), item);
  }
  if (item.industry === "Utilities - Regulated Gas") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Gas Utilities"), item);
  }
  if (item.industry === "Utilities - Regulated Water") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Water Utilities"), item);
  }
  if (item.industry === "Utilities - Independent Power Producers") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Independent Power Producers and Energy Traders"), item);
  }
  if (item.industry === "Internet Retail") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Broadline Retail"), item);
  }
  if (item.industry === "Diagnostics & Research") {
    NORMALIZED_INDUSTRY_MAP.set(clean("Life Sciences Tools and Services"), item);
  }
});

/**
 * Finds the benchmark EPS CAGR for an asset by its industry, sector, or ticker.
 * If E1 > 80%, this function provides the exact industry consensus CAGR to apply.
 */
export function getIndustryEpsBenchmark(
  industry?: string | null,
  sector?: string | null,
  ticker?: string | null
): { industry: string; sector: string; cagr: number } {
  // 1. Check direct industry match
  if (industry) {
    const directMatch = NORMALIZED_INDUSTRY_MAP.get(clean(industry));
    if (directMatch) {
      return { industry: directMatch.industry, sector: directMatch.sector, cagr: directMatch.cagr };
    }

    // Partial match in benchmark list
    const cleanedInd = clean(industry);
    const partialMatch = INDUSTRY_EPS_BENCHMARKS.find((b) => {
      const bClean = clean(b.industry);
      return cleanedInd.includes(bClean) || bClean.includes(cleanedInd);
    });
    if (partialMatch) {
      return { industry: partialMatch.industry, sector: partialMatch.sector, cagr: partialMatch.cagr };
    }
  }

  // 2. Check ticker in unified classification
  if (ticker) {
    const sym = ticker.toUpperCase();
    const classified = TICKER_CLASSIFICATION[sym];
    if (classified) {
      if (classified.subsector) {
        const classMatch = NORMALIZED_INDUSTRY_MAP.get(clean(classified.subsector));
        if (classMatch) {
          return { industry: classMatch.industry, sector: classMatch.sector, cagr: classMatch.cagr };
        }
        const cleanedSub = clean(classified.subsector);
        const partial = INDUSTRY_EPS_BENCHMARKS.find((b) => {
          const bClean = clean(b.industry);
          return cleanedSub.includes(bClean) || bClean.includes(cleanedSub);
        });
        if (partial) {
          return { industry: partial.industry, sector: partial.sector, cagr: partial.cagr };
        }
      }

      // Sector match from classification
      if (classified.sector && SECTOR_EPS_AVERAGES[classified.sector]) {
        return {
          industry: `${classified.sector} Sector Avg`,
          sector: classified.sector,
          cagr: SECTOR_EPS_AVERAGES[classified.sector]
        };
      }
    }
  }

  // 3. Fallback to sector average if industry not found
  if (sector && SECTOR_EPS_AVERAGES[sector]) {
    return {
      industry: `${sector} Sector Avg`,
      sector,
      cagr: SECTOR_EPS_AVERAGES[sector]
    };
  }

  // 4. Default conservative consensus benchmark
  return {
    industry: "Market Average",
    sector: sector || "General",
    cagr: 20.0
  };
}
