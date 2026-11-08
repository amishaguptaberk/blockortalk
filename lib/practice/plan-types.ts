/**
 * Browser-safe types for the Drill Planner's result. The practice page imports these, never
 * planner.ts or script.ts, which are server-only.
 */
import type { NewsItem } from "./news.ts";
import type { ScenarioId } from "./catalog.ts";

export type Verdict = "Real" | "Scam" | "Unverified";
export type Rule = 1 | 2 | 3 | 4;
export type HistoryEntry = { kind: "scenario"; id: ScenarioId; verdict: Verdict; leaked: string[] };

export interface PlanStep { n: number; tool: string; input_summary: string; result_summary: string; ms: number; by: "nemotron" | "fixed" }
export interface Plan {
  version: 1;
  path: "agent" | "fixed";
  model: string | null;
  fallback_reason: string | null;
  drill: { kind: "scenario"; id: string; caller: string; org: string };
  target_rule: Rule;
  /** Shown to the player before the call, so it never names a call type. */
  reason: string;
  news: NewsItem | null;
  history: HistorySummary;
  steps: PlanStep[];
  /** Model choices that code rejected before it got a valid one. */
  rejected: Array<{ choice: unknown; error: string }>;
}

export interface HistorySummary {
  drills: number;
  rules: Array<{ rule: Rule; broken: number; kept: number }>;
  /** Real callers the player called a scam. Tell counts these as mistakes too. */
  false_alarms: number;
  weakest_rule: Rule;
  recent: string[];
}
