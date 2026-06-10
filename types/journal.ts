// ============================================================
// Aye Aye Trader — Core Data Types
// These mirror the vanilla JS data model in journal.html.
// As views are migrated to React, components import from here.
// ============================================================

export type AccountType = "prop" | "personal";
export type AccountStatus = "active" | "blown";
export type DDType = "static" | "eod" | "intraday";
export type PhaseKind = "eval" | "funded" | "live";
export type PhaseOutcome = "active" | "passed" | "blown";
export type Direction = "Long" | "Short";
export type Grade = "A+" | "A" | "B" | "";

export interface Phase {
  id: string;
  kind: PhaseKind;
  label: string | null;
  startDate: string;
  endDate: string | null;
  startBal: number;
  target: number;
  dd: number;
  ddtype: DDType;
  cost: number;
  outcome: PhaseOutcome;
}

export interface Reset {
  date: string;
  amount: number;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  firm: string;
  broker: string;
  bal: number;
  target: number;
  dd: number;
  ddtype: DDType;
  cost: number;
  copy: "yes" | "no";
  comm: number;
  dll: number;
  pdll: number;
  status: AccountStatus;
  blownDate?: string;
  phases: Phase[];
  resets?: Reset[];
}

export interface TradeLeg {
  acct: string;
  pnl: number;
  size?: number;
  entry?: number;
  exit?: number;
  sl?: number;
  comm?: number;
  phase?: string;
}

export interface Trade {
  id: string;
  date: string;
  inst: string;
  dir: Direction;
  setup: string;
  grade: Grade;
  entryTime?: string;
  exitTime?: string;
  criteria?: string[];
  feelings?: string[];
  actions?: string[];
  execution?: string[];
  note?: string;
  screenshots?: string[];
  legs: TradeLeg[];
}

export interface StrategyThresholds {
  aplus: number;
  a: number;
}

export interface Strategy {
  id: string;
  name: string;
  criteria: string[];
  thresholds: StrategyThresholds;
}

export interface Broker {
  id: string;
  name: string;
  timing: "intraday" | "eod";
  commMini: number;
  commMicro: number;
}

export interface Settings {
  emoji: string;
  onenote: string;
  firms: string[];
  tags: {
    feelings: string[];
    actions: string[];
    execution: string[];
  };
  journalAccts: string[];
  commMini: number;
  commMicro: number;
  maxConsecLosses: number;
  maxTradesPerDay: number;
  rapidMins: number;
  brokers: Broker[];
}

export interface Note {
  id: string;
  date: string;
  title: string;
  body: string;
}

export interface JournalDB {
  accounts: Account[];
  trades: Trade[];
  groups: string[];
  strategies: Strategy[];
  settings: Settings;
  notes: Note[];
  _resetCostFixed?: boolean;
}
