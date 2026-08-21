import { Holding } from "../../types";

export interface SuperinvestorHolding extends Holding {
  company: string;
  valueM: number;
  portfolioWeight: number;
  sector: string;
  reportedPrice?: number;
  avgBuyPrice?: number;
  activity?: string;
}

export interface SuperinvestorMeta {
  name: string;
  fund: string;
  institution: string;
  period: string;
  aum13F: number; // in $B
  filingDate: string;
  source: string;
  category: "Value" | "Activist" | "Growth/Tech" | "Specialty";
  categoryES: "Valor" | "Activista" | "Crecimiento/Tecnología" | "Especializado";
  descEN: string;
  descES: string;
  holdings: SuperinvestorHolding[];
}
