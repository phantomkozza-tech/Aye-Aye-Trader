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
  blownTradeId?: string;
  blownReason?: "drawdown" | "margin";
  debt?: number;
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
  slip?: number;  // copy-lag slippage cost
}

export interface Trade {
  id: string;
  date: string;
  inst: string;
  dir: Direction;
  setup: string;
  setupId?: string;
  grade: Grade;
  r?: string;           // R-multiple as string e.g. "1.5", "-0.5"
  metCrit?: number[];   // indices of met strategy criteria
  entryTime?: string;
  exitTime?: string;
  disc?: string;        // discipline score /12
  plan?: string;        // followed plan: yes/no/partial
  notes?: string;       // rich text notes (may contain embedded img data-paths)
  shots?: string[];     // legacy screenshot paths (Dropbox)
  tags?: {
    feelings: string[];
    actions: string[];
    execution: string[];
  };
  legs: TradeLeg[];
}

export interface StrategyThresholds {
  aplus: number;
  a: number;
}

export interface StrategySurvey {
  reps: number;
  automatic: boolean;
  drift: boolean;
  date: string;
}

export interface Strategy {
  id: string;
  name: string;
  criteria: string[];
  thresholds: StrategyThresholds;
  surveys?: StrategySurvey[];
  masteryOverride?: "Developing" | "Mastered" | "No edge" | null;
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

export interface NoteTemplate {
  id: string;
  name: string;
  description?: string;
  blocks: any[]; // BlockNote document JSON
  builtIn?: boolean; // true = shipped preset, false/absent = user-created
}

export interface JournalDB {
  accounts: Account[];
  trades: Trade[];
  groups: string[];
  strategies: Strategy[];
  settings: Settings;
  notes: Note[];
  templates?: NoteTemplate[];
  _resetCostFixed?: boolean;
}
