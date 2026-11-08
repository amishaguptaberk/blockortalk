// Types for the Debrief agent. DebriefResult is the contract the detective reveal (ticket 9) renders.

export type CallType = 'legit' | 'scam' | 'hijacked';
export type Verdict = 'real' | 'scam' | 'unverified';
export type RuleNumber = 1 | 2 | 3 | 4;
export type RuleStatus = 'kept' | 'broken' | 'not_tested';
export type Move = 'probe' | 'protect' | 'verify' | 'disconnect';
export type Tactic = 'authority' | 'urgency' | 'details-as-proof' | 'reward' | 'fear';
export type RedFlagKind = Tactic | 'odd-payment' | 'asks-for-secret';
export type VerifyEvent = 'portal_opened' | 'bank_app_opened' | 'callback_completed';

export interface ScriptBeat { id: string; line: string; asks_for?: string[]; event?: string }

export interface PersonaCard {
  id: string;
  persona_name: string;
  claimed_org: string;
  theme: string;
  call_type: CallType;
  challenge_order?: number;
  demeanor: string;
  player_first_name?: string;
  scenario_card?: { what_happened: string; task: string; protecting: string[] };
  fake_secrets: Record<string, string>;
  /** Details the caller knows and uses as proof (card ending, a recent charge, the role applied for). */
  caller_knows: string[];
  quirk: string;
  script_beats: ScriptBeat[];
  red_flags: string[];
  rules_tested: RuleNumber[];
  task: { id: string; label: string } | null;
  stakes: {
    cost: number;
    cost_secrets: string[];
    fail_task_on_cost: boolean;
    task_done_when: Array<{ verdict?: Verdict[]; event?: string }>;
  };
}

export interface TranscriptTurn { turn: number; t?: number | null; speaker: 'caller' | 'player'; text: string; beat?: string }
export interface CallEvent {
  type: 'hangup' | 'code_popup' | 'cap_reached' | VerifyEvent;
  by?: 'player' | 'caller';
  after_turn: number;
  t?: number | null;
}
export interface Transcript {
  id: string;
  persona_id: string;
  mode?: 'text' | 'voice' | 'phone';
  verdict: Verdict | null;
  turns: TranscriptTurn[];
  events: CallEvent[];
  recorded_leaks?: Array<{ turn: number; secret: string; text: string }>;
  detection?: Detection;
}
export interface Detection {
  source: string; label: 'scam' | 'legit' | null; scam_type: string | null; confidence: number;
  red_flags: RedFlag[];
}

export interface RuleResult { rule: RuleNumber; title: string; status: RuleStatus; turn: number | null; evidence: string }
export interface MoveResult { move: Move; turn: number; t: number | null; text: string; event?: VerifyEvent }
export interface RedFlag { turn: number; tactic: RedFlagKind; span: { start: number; end: number; text: string } }
export interface DecisionCost { money: number; task: 'failed' | 'open' | null; rules_broken: RuleNumber[]; misjudged: boolean }
export interface Decision {
  id: string;
  turn: number;
  kind: 'leak' | 'protect' | 'disconnect' | 'verify' | 'verdict';
  result: 'worked' | 'cost_you';
  cost: DecisionCost;
  cost_score: number;
  cost_label: string;
  sentence: string;
  sentence_source: 'nemotron' | 'template';
}
export interface Rewind { decision_id: string; turn: number; cost_score: number; cost_you: boolean; reason: string }
export interface Step {
  n: number;
  tool: string;
  input_summary: string;
  result_summary: string;
  result: unknown;
  ms: number;
  by: 'nemotron' | 'fixed';
}

export interface DebriefResult {
  version: 1;
  transcript_id: string;
  persona: { id: string; name: string; claimed_org: string; call_type: CallType };
  verdict: Verdict | null;
  /** Which path ran: the Nemotron tool loop, or the fixed sequence of the same tools. */
  path: 'agent' | 'fixed';
  model: string | null;
  fallback_reason: string | null;
  outcome: {
    money_lost: number;
    balance_change: number;
    task: { id: string; label: string; status: 'done' | 'open' | 'failed' } | null;
    leaked: string[];
  };
  rules: [RuleResult, RuleResult, RuleResult, RuleResult];
  moves: MoveResult[];
  red_flags: RedFlag[];
  detector: { source: string; label: 'scam' | 'legit' | null; scam_type: string | null; confidence: number };
  decisions: Decision[];
  rewind: Rewind | null;
  steps: Step[];
  /** Where the model disagreed with code; code's answer is what's shown. */
  mismatches: Array<{ field: string; agent: string; code: string }>;
  /** Present when the agent was abandoned for the fixed path. */
  abandoned_steps?: Array<Omit<Step, 'result'>>;
}

export interface LlmClient {
  readonly model?: string;
  chat(req: { messages: unknown[]; tools: unknown[]; signal: AbortSignal }): Promise<{ message: { content?: string | null; tool_calls?: unknown[] }; model?: string }>;
}

export function runDebrief(opts: {
  persona: PersonaCard;
  transcript: Transcript;
  llm?: LlmClient | null;
  mode?: 'auto' | 'fixed';
  timeoutMs?: number;
  maxToolCalls?: number;
  onStep?: (step: Step) => void;
}): Promise<DebriefResult>;

export function pickDayRewind(results: DebriefResult[]): (Rewind & { call: number; transcript_id: string; persona: DebriefResult['persona'] }) | null;
export function createNemotronClient(env: Record<string, string | undefined>, opts?: { fetchImpl?: typeof fetch }): LlmClient | null;
export function toolDefinitions(): unknown[];
export function assertPersona(p: unknown): PersonaCard;
export function assertTranscript(t: unknown): Transcript;
export function assertDebriefResult(r: unknown): DebriefResult;
export function transcriptFromElevenLabs(payload: unknown, opts: { persona_id: string; verdict?: Verdict | null; events?: CallEvent[] }): Transcript;
export const DEFAULT_TIMEOUT_MS: number;
export const DEFAULT_MAX_TOOL_CALLS: number;
export const RULES: ReadonlyArray<{ rule: RuleNumber; title: string }>;
export const MOVES: ReadonlyArray<Move>;
export const TACTICS: ReadonlyArray<Tactic>;
