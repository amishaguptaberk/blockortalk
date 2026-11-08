export type Verdict = 'Real' | 'Scam' | 'Unverified';
export type CallerId = 'recruiter' | 'onboarding' | 'fraud_team';
/** `leaked` lists the fake secrets first said on this player turn (kept even when the text is redacted). */
export type Turn = { role: 'system' | 'assistant' | 'user'; text: string; at: string; source?: 'script' | 'nemotron'; leaked?: string[] };
export type VerifyRecord = { type: 'Verify'; surface: 'portal' | 'bank' | 'callback'; at: string };
export type CallResult = {
  callerId: CallerId;
  verdict: Verdict;
  turns: Turn[];
  cost: number;
  leaked: string[];
  /** Saved from the reveal on. Older saved days lack them; the reveal falls back to the first turn. */
  startedAt?: string;
  endedAt?: string;
  endReason?: 'disconnect' | 'stop' | 'reply_cap' | 'time_cap';
};
export type VoiceTurnInput = { role: 'assistant' | 'user'; text: string };
export type Challenge = {
  /** Server-only detection queue and presenter capability. Excluded from player responses. */
  risk?: import('./risk.ts').RiskState;
  id: string;
  balance: number;
  interview: 'OPEN' | 'BOOKED';
  bank: 'OPEN' | 'RESOLVED' | 'FAILED';
  callerId: CallerId;
  phase: 'call' | 'verdict' | 'between' | 'complete';
  startedAt: string;
  endedAt?: string;
  endReason?: CallResult['endReason'];
  replies: number;
  verdict?: Verdict;
  turns: Turn[];
  calls: CallResult[];
  leaked: string[];
  codeVisible: boolean;
  callbackStep: 0 | 1 | 2 | 3;
  events: VerifyRecord[];
  /** Set once this call's spoken transcript has been saved, so it can't be appended twice. */
  voiceSaved?: boolean;
  /** Number of raw cumulative voice messages already ingested; retries cannot append them twice. */
  voiceReceived?: number;
  /** New browser connections get a fresh stream cursor; stale uploads cannot rejoin it. */
  voiceSession?: string;
  /** The detective reveal, cached after the day completes. Not sent with day responses. */
  reveal?: import('./reveal.ts').RevealPayload;
  /** The presenter's stage fallback switch (lib/stage/plan.ts). Holds no call type, so the player view keeps it. */
  stagePlan?: import('../stage/plan.ts').StagePlanState;
  /** The day's one rewind, once started. It is scored on its own and never changes the official day. */
  rewind?: Rewind;
};
export type EndReason = NonNullable<Challenge['endReason']>;
/**
 * A text replay of one finished call, from a chosen turn, with the same persona and beats.
 * `turns[0..prefix)` are copied from the original call; everything after is the replay.
 * It keeps its own leaks and Verify records: nothing here may reach `balance`, the tasks, `calls` or `events`.
 */
export type Rewind = {
  callIndex: number;
  callerId: CallerId;
  /** The 1-based turn the player chose, numbered like the reveal's transcript. */
  fromTurn: number;
  prefix: number;
  /** call → verdict (call ended, awaiting a verdict) → done (scored). Verify steps still count after done. */
  phase: 'call' | 'verdict' | 'done';
  turns: Turn[];
  replies: number;
  leaked: string[];
  codeVisible: boolean;
  startedAt: string;
  endedAt?: string;
  endReason?: EndReason;
  verdict?: Verdict;
  events: VerifyRecord[];
  callbackStep: 0 | 1 | 2 | 3;
  /** Set once the replay has a verdict. Kept current by later Verify steps, like the bank callback on the day. */
  outcome?: import('./scoring.ts').CallOutcome;
};
export type RewindAction =
  | { type: 'rewind_start'; callIndex: number; turn: number }
  | { type: 'rewind_reply'; text: string }
  | { type: 'rewind_end' | 'rewind_portal' | 'rewind_bank' | 'rewind_callback_start' | 'rewind_callback_next' }
  | { type: 'rewind_verdict'; verdict: Verdict };
type VoiceSessionInput = { sessionId: string; callerId: CallerId; startedAt: string };
export type Action = { type: 'reply'; text: string } | { type: 'end' | 'next' | 'portal' | 'bank' | 'callback_start' | 'callback_next' } | { type: 'verdict'; verdict: Verdict } | { type: 'voice_turns'; sessionId?: string; turns: VoiceTurnInput[] } | ({ type: 'voice_start' } & VoiceSessionInput) | ({ type: 'voice_live'; turns: VoiceTurnInput[] } & VoiceSessionInput) | RewindAction;
export type ReplyRequest = { turns: Turn[]; options: readonly string[] };
export type Reply = (request: ReplyRequest) => Promise<string>;
