export type Mode = "market" | "gcv";
export type Direction = "pi_to_fiat" | "fiat_to_pi";
export type Route = "marche" | "gcv" | "devises" | "reglages";

export interface Currency {
  code: string;
  name: string;
  decimals: number;
}

export interface SourceInfo {
  name: string;
  state: "live" | "stale" | "unavailable";
  staleReason?: string;
  sourceUpdatedAt: string | null;
  fetchedAt: string | null;
  attribution: { text: string; url: string };
}

export interface ConvertResponse {
  mode: Mode;
  direction: Direction;
  amount: string;
  currency: Currency;
  result: string;
  resultPrecise: string;
  priceUsd: string;
  usdToFiat: string;
  unitPriceFiat: string;
  gcvReferenceUsd: string | null;
  sources: { price: SourceInfo | null; fx: SourceInfo | null };
  dataState: "live" | "stale";
  kind: "market_estimate" | "gcv_reference";
  disclaimer: string;
}

export interface StatusResponse {
  env: string;
  price: SourceInfo;
  fx: SourceInfo;
}

export interface AppConfig {
  appName: string;
  env: "testnet" | "mainnet";
  gcvDefaultUsd: string;
}

export interface ConvertParams {
  mode: Mode;
  direction: Direction;
  amount: string;
  currency: string;
  gcvReference?: string;
}
