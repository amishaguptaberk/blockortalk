/**
 * SERVER-ONLY: the Drill Planner agent. Nemotron reads the player's practice history and today's FTC
 * alerts through a few tools, then chooses the next scenario drill and the rule it
 * targets. Code scores the history, checks the choice and rewrites any reason that would give a
 * caller's call type away. If the model fails, is too slow or never chooses, a fixed plan runs on the
 * same tools and the result says which path ran.
 */
import type { LlmClient } from "../debrief/index.mjs";
import { RULES, SCENARIOS, type ScenarioId } from "./catalog.ts";
import type { NewsItem } from "./news.ts";
import { callTypeOf, isScenarioId } from "./script.ts";
import type { HistoryEntry, HistorySummary, Plan, PlanStep, Rule } from "./plan-types.ts";
export type { HistoryEntry, HistorySummary, Plan, PlanStep } from "./plan-types.ts";

export const PLAN_TIMEOUT_MS = 8000;
export const PLAN_MAX_TOOL_CALLS = 6;
const MAX_HISTORY = 30;

// Never let this module reach the browser: it imports script.ts, which holds every caller's call type.
if (typeof window !== "undefined") throw new Error("lib/practice/planner.ts is server-only");

/** Rules each scenario exercises. Real callers test rule 4: check, don't just hang up on them. */
const SCENARIO_RULES: Record<ScenarioId, Rule[]> = {
  recruiter: [4],
  onboarding: [1, 2, 4],
  fraud_team: [1, 3, 4],
  bank_callback: [4],
};

// ---------- input ----------

/** Validates history sent by the browser. Bad entries are dropped, not trusted. */
export function readHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryEntry[] = [];
  for (const e of value.slice(-MAX_HISTORY)) {
    const leaked = Array.isArray(e?.leaked) ? e.leaked.filter((x: unknown): x is string => typeof x === "string").slice(0, 6) : [];
    if (e?.kind === "scenario" && isScenarioId(e.id) && ["Real", "Scam", "Unverified"].includes(e.verdict)) out.push({ kind: "scenario", id: e.id, verdict: e.verdict, leaked });
  }
  return out;
}

// ---------- tools ----------


export function summarizeHistory(history: HistoryEntry[]): HistorySummary {
  const tally = new Map<Rule, { broken: number; kept: number }>(([1, 2, 3, 4] as Rule[]).map(r => [r, { broken: 0, kept: 0 }]));
  let falseAlarms = 0;
  for (const e of history) {
    const broken = new Set<Rule>();
    const tested = SCENARIO_RULES[e.id];
    const type = callTypeOf(e.id);
    if (e.leaked.length) { broken.add(1); if (e.id === "fraud_team") broken.add(3); if (e.id === "onboarding") broken.add(2); }
    if (type === "Hijacked" && e.verdict === "Real") broken.add(3);
    if (type === "Scam" && e.verdict === "Real") broken.add(2);
    if (type === "Real" && e.verdict === "Scam") { falseAlarms++; broken.add(4); }
    for (const r of new Set([...tested, ...broken])) tally.get(r)![broken.has(r) ? "broken" : "kept"]++;
  }
  const rules = [...tally].map(([rule, t]) => ({ rule, ...t }));
  // Most broken first; ties go to the rule least practised, then the lowest number.
  const weakest = [...rules].sort((a, b) => (b.broken - a.broken) || ((a.broken + a.kept) - (b.broken + b.kept)) || (a.rule - b.rule))[0]!.rule;
  return { drills: history.length, rules, false_alarms: falseAlarms, weakest_rule: weakest, recent: history.slice(-3).map(e => `${e.kind}:${e.id}`) };
}

/** Every drill the planner may pick, with the rules it tests. Call types stay out of what the model sees. */
export function listDrills() {
  return {
    scenarios: SCENARIOS.map(s => ({ id: s.id, caller: s.caller, org: s.org, theme: s.theme, direction: s.direction, rules: SCENARIO_RULES[s.id] })),
    rules: RULES,
  };
}

const FALSE_ALARM_REASON = "Last time you turned a caller away before checking. Practise checking through a source you already have, then deciding.";
const CALL_TYPE_WORDS = /\b(scam\w*|real|legit\w*|genuine|hijack\w*|fake|fraudster|imposter|impostor|trust(ed|worthy)?)\b/i;

function drillOf(kind: string, id: string) {
  if (kind === "scenario" && isScenarioId(id)) { const s = SCENARIOS.find(x => x.id === id)!; return { kind: "scenario" as const, id, caller: s.caller, org: s.org, rules: SCENARIO_RULES[id] }; }
  return null;
}

function defaultReason(rule: Rule, summary: HistorySummary, news: NewsItem | null) {
  const title = RULES[rule - 1]!.text;
  const why = summary.drills === 0 ? "A first drill to warm up on" : summary.rules[rule - 1]!.broken ? "You slipped on this rule in recent drills, so this one practises" : "Next up, practise";
  return `${why} rule ${rule}: ${title}${news ? ` It matches a current FTC alert: “${news.title}”.` : ""}`;
}

type Choice = { kind?: unknown; id?: unknown; target_rule?: unknown; reason?: unknown; news_link?: unknown };

type Checked =
  | { error: string }
  | { drill: Plan["drill"]; target_rule: Rule; reason: string; reason_source: "nemotron" | "template"; news: NewsItem | null };

/** Checks a proposed drill. Returns the plan pieces, or an error the model can fix. */
export function checkChoice(choice: Choice, summary: HistorySummary, news: NewsItem[]): Checked {
  const drill = drillOf(String(choice.kind ?? ""), String(choice.id ?? ""));
  if (!drill) return { error: `unknown drill ${String(choice.kind)}:${String(choice.id)}; pick one from list_drills` };
  const rule = Number(choice.target_rule) as Rule;
  if (!drill.rules.includes(rule)) return { error: `${drill.id} tests rules ${drill.rules.join(", ")}, not rule ${String(choice.target_rule)}` };
  const item = typeof choice.news_link === "string" && choice.news_link ? news.find(n => n.link === choice.news_link) : undefined;
  if (typeof choice.news_link === "string" && choice.news_link && !item) return { error: "news_link must be a link returned by get_current_threats" };
  // An alert headline names a scam, so it stays off the practice call.
  if (item) return { error: "an alert headline stays off the practice call" };
  let reason = typeof choice.reason === "string" ? choice.reason.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  let reasonSource: "nemotron" | "template" = "nemotron";
  // The reason shows before the call, so it must not tell the player who the caller really is.
  if (!reason || CALL_TYPE_WORDS.test(reason)) { reason = defaultReason(rule, summary, item ?? null); reasonSource = "template"; }
  const { rules: _rules, ...publicDrill } = drill;
  return { drill: publicDrill, target_rule: rule, reason, reason_source: reasonSource, news: item ?? null };
}

/** After a false alarm on rule 4, the next drill is a real caller to check. Code decides this, since only code knows which callers are real. */
function realCallerFor(summary: HistorySummary): ScenarioId | null {
  if (!(summary.false_alarms > 0 && summary.weakest_rule === 4)) return null;
  return summary.recent.includes("scenario:recruiter") ? "bank_callback" : "recruiter";
}

/** The fixed plan: weakest rule, and a real caller after a false alarm. */
export function fixedChoice(summary: HistorySummary): Choice {
  const recent = new Set(summary.recent);
  const realCaller = realCallerFor(summary);
  if (realCaller) return { kind: "scenario", id: realCaller, target_rule: 4, reason: FALSE_ALARM_REASON };
  const rule = summary.weakest_rule;
  const candidates = SCENARIOS.filter(s => SCENARIO_RULES[s.id].includes(rule) && callTypeOf(s.id) !== "Real");
  const scenario = candidates.find(s => !recent.has(`scenario:${s.id}`)) ?? candidates[0];
  return { kind: "scenario", id: scenario?.id ?? "onboarding", target_rule: rule };
}

// ---------- the agent ----------

const TOOL_DEFS = [
  { name: "get_player_history", description: "The player's practice history: per rule, how often it was broken or kept, false alarms on real callers, and the last few drills." },
  { name: "get_current_threats", description: "Current FTC consumer alerts. Headlines stay off the practice call." },
  { name: "list_drills", description: "Every scenario you may choose, with the rules each one tests." },
].map(t => ({ type: "function", function: { ...t, parameters: { type: "object", properties: {} } } }));

const CHOOSE = {
  type: "function",
  function: {
    name: "choose_drill",
    description: "Finish: the next drill, the rule it targets, and one short reason shown to the player before the call.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["scenario"] },
        id: { type: "string" },
        target_rule: { type: "integer", enum: [1, 2, 3, 4] },
        reason: { type: "string", description: "Second person, at most 30 words. Never say whether the caller is real, a scam or hijacked." },
        news_link: { type: "string", description: "Optional: the link of the FTC alert this drill matches." },
      },
      required: ["kind", "id", "target_rule", "reason"],
    },
  },
};

const SYSTEM = [
  "You are the Drill Planner for Tell, where people practise telling real phone calls from scams. All details are fictional.",
  "Plan ONE next practice drill. Call get_player_history, get_current_threats and list_drills (in one reply: they are independent), then call choose_drill.",
  "Target the rule the player breaks most. After a false alarm (a real caller turned away), code picks a real caller to check, so Tell never teaches paranoia.",
  "Choose a scenario that tests the target rule. Avoid repeating the last drill. Leave news_link unset: an alert headline names a scam.",
  "The reason is shown before the call: kind, specific, at most 30 words, and it must never reveal whether the caller is real, a scam or hijacked.",
].join("\n");

// Model-supplied ids are echoed in errors and step summaries the player sees, so they are capped.
const cap = (value: unknown, max = 40) => (typeof value === "string" ? value.slice(0, max) : value);

function asObject(raw: unknown): Choice {
  let parsed: Choice = {};
  if (raw && typeof raw === "object") parsed = raw as Choice;
  else { try { parsed = JSON.parse(String(raw ?? "{}")) ?? {}; } catch { parsed = {}; } }
  return { ...parsed, kind: cap(parsed.kind), id: cap(parsed.id), news_link: cap(parsed.news_link, 300) };
}

export async function planDrill({ history, llm = null, threats, timeoutMs = PLAN_TIMEOUT_MS, maxToolCalls = PLAN_MAX_TOOL_CALLS }: {
  history: HistoryEntry[];
  llm?: LlmClient | null;
  /** Today's FTC alerts. Throwing is fine: the tool reports the feed as unavailable. */
  threats: () => Promise<NewsItem[]>;
  timeoutMs?: number;
  maxToolCalls?: number;
}): Promise<Plan> {
  const summary = summarizeHistory(history);
  let news: NewsItem[] = [];
  let newsPromise: Promise<NewsItem[]> | null = null;
  // One fetch, shared: a fixed plan after a timeout waits for the agent's fetch instead of seeing nothing.
  const loadNews = () => (newsPromise ??= threats().catch(() => [] as NewsItem[]).then(items => (news = items)));

  const runTool = async (name: string, steps: PlanStep[], by: PlanStep["by"]) => {
    const started = Date.now();
    let result: unknown;
    let input = "";
    let out = "";
    if (name === "get_player_history") {
      result = summary; input = `${history.length} past drills`;
      out = summary.drills ? `weakest rule ${summary.weakest_rule}; ${summary.rules.map(r => `R${r.rule} ${r.broken}✗/${r.kept}✓`).join(", ")}; ${summary.false_alarms} false alarms` : "new player: no drills yet";
    } else if (name === "get_current_threats") {
      const items = await loadNews();
      result = items.length ? items.map(i => ({ title: i.title, link: i.link })) : { error: "FTC feed unavailable" };
      input = "FTC consumer alerts"; out = items.length ? `${items.length} alerts` : "feed unavailable";
    } else {
      const drills = listDrills();
      result = drills; input = "catalog"; out = `${drills.scenarios.length} scenarios`;
    }
    steps.push({ n: steps.length + 1, tool: name, input_summary: input, result_summary: out, ms: Date.now() - started, by });
    return result;
  };

  const finish = (path: Plan["path"], model: string | null, reason: string | null, steps: PlanStep[], choice: Checked, rejected: Plan["rejected"]): Plan => {
    if ("error" in choice) throw new Error(choice.error);
    return { version: 1, path, model, fallback_reason: reason, drill: choice.drill, target_rule: choice.target_rule, reason: choice.reason, news: choice.news, history: summary, steps, rejected };
  };

  const fixed = async (reason: string, steps: PlanStep[] = [], rejected: Plan["rejected"] = []) => {
    for (const name of ["get_player_history", "get_current_threats", "list_drills"]) await runTool(name, steps, "fixed");
    const choice = checkChoice(fixedChoice(summary), summary, news);
    steps.push({ n: steps.length + 1, tool: "choose_drill", input_summary: "fixed plan", result_summary: "error" in choice ? choice.error : `${choice.drill.kind}:${choice.drill.id} for rule ${choice.target_rule}`, ms: 0, by: "fixed" });
    return finish("fixed", null, reason, steps, choice, rejected);
  };

  if (!llm) return fixed("no Nemotron client (NVIDIA_API_KEY not set)");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
  const steps: PlanStep[] = [];
  const rejected: Plan["rejected"] = [];
  try {
    const timeout = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
    const agent = async (): Promise<Plan> => {
      const messages: any[] = [{ role: "system", content: SYSTEM }, { role: "user", content: `Plan the next drill for a player with ${history.length} past drills.` }];
      const tools = [...TOOL_DEFS, CHOOSE];
      let model = llm.model ?? null;
      let toolCalls = 0;
      let nudged = false;
      while (true) {
        if (controller.signal.aborted) throw controller.signal.reason;
        const { message, model: used } = await llm.chat({ messages, tools, signal: controller.signal });
        model = used ?? model;
        const calls = (message.tool_calls ?? []) as Array<{ id: string; function?: { name?: string; arguments?: string } }>;
        messages.push({ role: "assistant", content: message.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
        if (!calls.length) {
          if (nudged) throw new Error("model never chose a drill");
          nudged = true;
          messages.push({ role: "user", content: "Call choose_drill now." });
          continue;
        }
        for (const call of calls) {
          const name = call.function?.name ?? "";
          if (name === "choose_drill") {
            const raw = asObject(call.function?.arguments);
            if (raw.news_link) await loadNews();
            const choice = checkChoice(raw, summary, news);
            steps.push({ n: steps.length + 1, tool: "choose_drill", input_summary: `${String(raw.kind)}:${String(raw.id)} for rule ${String(raw.target_rule)}`, result_summary: "error" in choice ? `rejected: ${choice.error}` : `accepted${choice.reason_source === "template" ? " (reason rewritten by code)" : ""}`, ms: 0, by: "nemotron" });
            if (!("error" in choice)) {
              const realCaller = realCallerFor(summary);
              if (realCaller && !(choice.drill.kind === "scenario" && choice.drill.id === realCaller)) {
                const forced = checkChoice({ kind: "scenario", id: realCaller, target_rule: 4, reason: FALSE_ALARM_REASON }, summary, news);
                steps.push({ n: steps.length + 1, tool: "code_override", input_summary: `${choice.drill.kind}:${choice.drill.id}`, result_summary: `false alarm last time: scenario:${realCaller} for rule 4`, ms: 0, by: "fixed" });
                return finish("agent", model, null, steps, forced, rejected);
              }
              return finish("agent", model, null, steps, choice, rejected);
            }
            // The rejected reason never leaves the server: only code-checked reasons reach the player.
            rejected.push({ choice: { kind: raw.kind, id: raw.id, target_rule: raw.target_rule, news_link: raw.news_link }, error: choice.error });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: choice.error }) });
            continue;
          }
          if (!TOOL_DEFS.some(t => t.function.name === name) || toolCalls >= maxToolCalls) {
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: toolCalls >= maxToolCalls ? "step limit reached; call choose_drill now" : `unknown tool ${name}` }) });
            continue;
          }
          toolCalls++;
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(await runTool(name, steps, "nemotron")) });
        }
        if (rejected.length >= 3) throw new Error("three invalid choices");
      }
    };
    return await Promise.race([agent(), timeout]);
  } catch (err) {
    // Upstream error bodies stay on the server: the player sees the status or a short message only.
    const status = (err as { status?: unknown })?.status;
    const detail = typeof status === "number" ? `HTTP ${status}` : (err instanceof Error ? err.message : String(err)).slice(0, 80);
    const why = `agent ${controller.signal.aborted ? "timed out" : "failed"}: ${detail}`;
    return fixed(why, [...steps, { n: steps.length + 1, tool: "fallback", input_summary: `${steps.length} agent steps`, result_summary: why, ms: 0, by: "fixed" }], rejected);
  } finally {
    clearTimeout(timer);
  }
}
