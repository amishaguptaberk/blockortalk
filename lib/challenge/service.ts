import pg from 'pg';
import type { Action, Challenge, EndReason, Reply, Rewind, RewindAction, Turn } from './types.ts';
import { DISCLOSURE } from './recruiter.ts';
import { CALLERS, CALL_ORDER, CODE_REQUEST_LINES, FAKE_SECRETS } from './scenarios.ts';
import { bankResolves, callCost, interviewBooked, replayOutcome } from './scoring.ts';
import { revealReady } from './reveal.ts';
import { mentionsSecret } from '../policy/normalize.mjs';
import { queueRisk } from './risk.ts';
import { redact } from '../policy/redact.ts';

export class ChallengeError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

// Reject likely personal data before it reaches the model or stored transcript.
export function safeText(text: string) {
  if (/\b(?:(?:my|the)\s+)?(?:pin|password|passcode|code|social security number|ssn|date of birth|birthday|address|phone number)\s*(?:is|:|=)\s*\S+/i.test(text)) return '[personal details removed]';
  return text.replace(/\b(?:\d[ -]?){7,}\b/g, '[details removed]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[details removed]')
    .replace(/\b(?:\d{1,2}[/-]){2}\d{2,4}\b/g, '[details removed]')
    .replace(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}\b/gi, '[details removed]')
    .replace(/\b\d+\s+(?:[a-z]+\s+){1,5}(?:street|st|road|rd|drive|dr|avenue|ave|lane|ln|court|ct)\b/gi, '[details removed]');
}

/** A call in progress: the day's current call, or the rewind replay. Both play and score the same way. */
type LiveCall = Pick<Challenge, 'callerId' | 'turns' | 'replies' | 'leaked' | 'codeVisible' | 'startedAt' | 'endedAt' | 'endReason'> & { phase: string };

const CALL_LIMIT_MS = 180000;
const REPLY_CAP = 12;
const VERDICTS = ['Real', 'Scam', 'Unverified'];

/** Adds newly said fake secrets to `call.leaked` and returns them. Scores the original text, before redaction. */
function scanLeaks(call: LiveCall, raw: string) {
  const added: string[] = [];
  for (const [key, value] of Object.entries(FAKE_SECRETS)) {
    if (key === 'live_code' && !call.codeVisible) continue;
    if (mentionsSecret(raw, key, value) && !call.leaked.includes(key)) { call.leaked.push(key); added.push(key); }
  }
  return added;
}

/** Kai's one-time code appears when he asks for it: his scripted request line, or a spoken line about the code. */
function showsCode(call: Pick<LiveCall, 'callerId'>, turn: Turn) {
  return call.callerId === 'fraud_team' && turn.role === 'assistant' && ((CODE_REQUEST_LINES as readonly string[]).includes(turn.text) || /\bcode\b/i.test(turn.text));
}

export interface ChallengeStore {
  create(day: Challenge): Promise<void>;
  update(id: string, work: (day: Challenge) => Promise<Challenge>): Promise<Challenge>;
  saveReveal(id: string, reveal: NonNullable<Challenge['reveal']>): Promise<void>;
  /** The stage plan only (lib/stage/plan.ts), read without a lock. Only the saved Postgres day has one. */
  readStagePlan?(id: string): Promise<Challenge['stagePlan']>;
}

function postgresStore(connectionString: string): ChallengeStore {
  async function withClient<T>(work: (client: pg.Client) => Promise<T>) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await work(client); } finally { await client.end(); }
  }
  return {
    async create(day) { await withClient(client => client.query('INSERT INTO tell_challenges (id, state) VALUES ($1, $2)', [day.id, JSON.stringify(day)])); },
    async update(id, work) {
      return withClient(async client => {
        await client.query('BEGIN');
        try {
          const result = await client.query('SELECT state FROM tell_challenges WHERE id = $1 FOR UPDATE', [id]);
          if (!result.rowCount) throw new ChallengeError('This day was not found. Start a new challenge.', 404);
          const day = await work(result.rows[0].state as Challenge);
          await client.query('UPDATE tell_challenges SET state = $2, updated_at = now() WHERE id = $1', [id, JSON.stringify(day)]);
          await client.query('COMMIT');
          return day;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
      });
    },
    async saveReveal(id, reveal) { await withClient(client => client.query(`UPDATE tell_challenges SET state = jsonb_set(state, '{reveal}', $2::jsonb), updated_at = now() WHERE id = $1`, [id, JSON.stringify(reveal)])); },
    async readStagePlan(id) {
      const result = await withClient(client => client.query(`SELECT state->'stagePlan' AS stage_plan FROM tell_challenges WHERE id = $1`, [id]));
      if (!result.rowCount) throw new ChallengeError('This day was not found. Start a new challenge.', 404);
      return result.rows[0].stage_plan ?? undefined;
    },
  };
}

export function createChallengeService({ connectionString = '', store = postgresStore(connectionString), reply, now = Date.now, scheduleRisk, trackRisk = true }: { trackRisk?: boolean; connectionString?: string; store?: ChallengeStore; reply: Reply; now?: () => number; scheduleRisk?: (id: string) => void }) {
  function end(call: LiveCall, reason: EndReason) {
    call.phase = 'verdict';
    call.endedAt = new Date(now()).toISOString();
    call.endReason = reason;
  }
  function expire(call: LiveCall) {
    if (call.phase === 'call' && now() - Date.parse(call.startedAt) >= CALL_LIMIT_MS) end(call, 'time_cap');
  }

  /** One typed player reply and the caller's scripted answer, with the 12-reply and 3-minute caps. */
  async function playReply(call: LiveCall, input: string) {
    const raw = input.trim();
    if (!raw || raw.length > 1000) throw new ChallengeError('Use a reply from 1 to 1,000 characters.', 400);
    // Score the original text before personal-data redaction. Only user turns count.
    const leakedNow = scanLeaks(call, raw);
    const text = safeText(raw);
    const at = new Date(now()).toISOString();
    call.turns.push({ role: 'user', text, at, ...(leakedNow.length ? { leaked: leakedNow } : {}) });
    call.replies += 1;
    if (/\bstop\s+drill\b/i.test(raw)) return end(call, 'stop');
    if (call.replies >= REPLY_CAP) return end(call, 'reply_cap');
    const beats = CALLERS[call.callerId].beats;
    const options = beats[Math.min(call.replies - 1, beats.length - 1)];
    let answer: string = options[0];
    let source: Turn['source'] = 'script';
    if (text !== raw) answer = 'Quick pause: this is a practice call. Please do not use real personal details. Use only the fictional details on your scenario card.';
    else {
      try {
        const generated = await reply({ turns: call.turns, options });
        if (options.some(option => option === generated)) { answer = generated; source = 'nemotron'; }
      } catch (error) {
        console.warn('Challenge used a scripted reply:', error instanceof Error ? error.message : 'LLM unavailable');
      }
    }
    if (now() - Date.parse(call.startedAt) >= CALL_LIMIT_MS) return end(call, 'time_cap');
    call.turns.push({ role: 'assistant', text: answer, at: new Date(now()).toISOString(), source });
    if (call.callerId === 'fraud_team' && CODE_REQUEST_LINES.some(line => line === answer)) call.codeVisible = true;
  }

  /**
   * Starts the day's one rewind: a text replay of call `callIndex` from turn `turn` (numbered like the reveal).
   * A player turn is replayed from just before it, so the player answers that moment again. Any other turn
   * (a verdict, hang-up or Verify decision sits on a caller line) is replayed from just after it.
   */
  function startRewind(day: Challenge, callIndex: unknown, turn: unknown): Rewind {
    if (!revealReady(day)) throw new ChallengeError('The rewind opens after the reveal.');
    if (day.rewind) throw new ChallengeError('You already used today’s rewind.');
    const call = Number.isInteger(callIndex) ? day.calls[callIndex as number] : undefined;
    if (!call) throw new ChallengeError('Choose one of the three calls to rewind.', 400);
    if (!Number.isInteger(turn) || (turn as number) < 1 || (turn as number) > call.turns.length) throw new ChallengeError('Choose a turn from that call.', 400);
    const from = turn as number;
    const cut = call.turns[from - 1].role === 'user' ? from - 1 : from;
    // Always keep the disclosure and the opening line.
    const prefix = Math.max(cut, Math.min(2, call.turns.length));
    const rewind: Rewind = {
      callIndex: callIndex as number, callerId: call.callerId, fromTurn: from, prefix, phase: 'call',
      turns: call.turns.slice(0, prefix).map(t => ({ ...t, ...(t.leaked ? { leaked: [...t.leaked] } : {}) })),
      replies: 0, leaked: [], codeVisible: false, startedAt: new Date(now()).toISOString(), events: [], callbackStep: 0,
    };
    // Rebuild the replay's leaks and code popup from the kept turns, in order, as the call scored them.
    for (const t of rewind.turns) {
      if (showsCode(rewind, t)) rewind.codeVisible = true;
      if (t.role !== 'user') continue;
      rewind.replies += 1;
      for (const key of [...(t.leaked ?? []), ...scanLeaks(rewind, t.text)]) if (!rewind.leaked.includes(key)) rewind.leaked.push(key);
    }
    if (rewind.replies >= REPLY_CAP) end(rewind, 'reply_cap');
    return rewind;
  }

  /** Rewind actions touch only `day.rewind`: never the balance, tasks, calls or the day's Verify events. */
  async function rewindStep(day: Challenge, action: RewindAction) {
    if (action.type === 'rewind_start') { day.rewind = startRewind(day, action.callIndex, action.turn); return; }
    const r = day.rewind;
    if (!r) throw new ChallengeError('Start a rewind first.');
    const at = new Date(now()).toISOString();
    if (action.type === 'rewind_reply') {
      if (r.phase === 'call') await playReply(r, action.text);
      else if (r.phase === 'done') throw new ChallengeError('This replay has ended.');
    } else if (action.type === 'rewind_end') {
      if (r.phase === 'call') end(r, 'disconnect');
    } else if (action.type === 'rewind_verdict') {
      if (r.phase !== 'verdict') throw new ChallengeError(r.phase === 'call' ? 'End the replay call before you give a verdict.' : 'This replay already has a verdict.');
      if (!VERDICTS.includes(action.verdict)) throw new ChallengeError('Choose Real, Scam or Unverified.', 400);
      r.verdict = action.verdict;
      r.endedAt ??= at;
      r.phase = 'done';
    } else if (action.type === 'rewind_portal') {
      r.events.push({ type: 'Verify', surface: 'portal', at });
    } else if (action.type === 'rewind_bank') {
      r.events.push({ type: 'Verify', surface: 'bank', at });
    } else if (action.type === 'rewind_callback_start') {
      if (r.callerId !== 'fraud_team' || r.phase === 'call') throw new ChallengeError('End the bank call before you call Corvanta.');
      if (!r.events.some(event => event.surface === 'bank')) throw new ChallengeError('Open your bank app first.');
      if (!r.callbackStep) r.callbackStep = 1;
    } else if (action.type === 'rewind_callback_next') {
      if (!r.callbackStep) throw new ChallengeError('Call Corvanta first.');
      if (r.callbackStep < 3) {
        r.callbackStep = (r.callbackStep + 1) as Rewind['callbackStep'];
        if (r.callbackStep === 3) r.events.push({ type: 'Verify', surface: 'callback', at });
      }
    }
    if (r.phase === 'done') r.outcome = replayOutcome(r);
  }

  async function update(id: string, action?: Action) {
    const updated = await store.update(id, async day => {
        // Upgrade saved issue-5 days without losing their verdict or transcript.
        day.calls ??= day.verdict ? [{ callerId: 'recruiter', verdict: day.verdict, turns: day.turns, cost: 0, leaked: [] }] : [];
        day.leaked ??= [];
        day.codeVisible ??= false;
        day.callbackStep ??= 0;
        if (day.phase === 'complete' && day.callerId === 'recruiter') day.phase = 'between';
        expire(day);
        if (day.rewind) expire(day.rewind);
        if (action?.type.startsWith('rewind_')) {
          await rewindStep(day, action as RewindAction);
        } else if (action?.type === 'reply' && day.phase === 'call') {
          await playReply(day, action.text);
        } else if (action?.type === 'reply' && day.phase !== 'verdict') {
          throw new ChallengeError('This call has ended.');
        } else if (action?.type === 'end' && day.phase === 'call') end(day, 'disconnect');
        else if (action?.type === 'verdict') {
          if (day.phase !== 'verdict') throw new ChallengeError('End the call before you give a verdict.');
          if (!VERDICTS.includes(action.verdict)) throw new ChallengeError('Choose Real, Scam or Unverified.', 400);
          day.verdict = action.verdict;
          const cost = callCost(day.callerId, day.leaked);
          day.balance -= cost;
          if (day.callerId === 'fraud_team' && cost) day.bank = 'FAILED';
          if (day.callerId === 'recruiter' && interviewBooked(day.verdict, day.events.some(event => event.surface === 'portal'))) day.interview = 'BOOKED';
          day.calls.push({ callerId: day.callerId, verdict: day.verdict, turns: day.turns, cost, leaked: day.leaked, startedAt: day.startedAt, endedAt: day.endedAt, endReason: day.endReason });
          day.phase = day.callerId === 'fraud_team' ? 'complete' : 'between';
        } else if (action?.type === 'voice_start') {
          if (day.phase !== 'call' || action.callerId !== day.callerId || action.startedAt !== day.startedAt) throw new ChallengeError('That transcript belongs to a different call.');
          if (day.voiceSession !== action.sessionId) { day.voiceSession = action.sessionId; day.voiceReceived = 0; day.voiceSaved = false; }
        } else if (action?.type === 'voice_turns' || action?.type === 'voice_live') {
          const live = action.type === 'voice_live';
          if (live && (action.callerId !== day.callerId || action.startedAt !== day.startedAt)) throw new ChallengeError('That transcript belongs to a different call.');
          if ((day.voiceSession || action.sessionId || live) && action.sessionId !== day.voiceSession) throw new ChallengeError('That transcript belongs to a different voice session.');
          // Live snapshots grow cumulatively. Retries, out-of-order snapshots and the final save
          // only append messages not previously accepted; scoring still sees the original text.
          if (day.voiceSaved) return day;
          if (day.phase !== 'verdict' && !(live && day.phase === 'call')) throw new ChallengeError('This call has no voice transcript to save.');
          if (!Array.isArray(action.turns) || action.turns.length > 40) throw new ChallengeError('That voice transcript is too long.', 400);
          // A call can start in text and switch to voice: spoken turns come after the typed ones.
          const start = Date.parse(day.turns.at(-1)?.at ?? day.startedAt);
          const span = Math.max(0, Date.parse(day.endedAt ?? day.startedAt) - start);
          const spoken = action.turns.slice(day.voiceReceived ?? 0).filter(turn => (turn.role === 'assistant' || turn.role === 'user') && typeof turn.text === 'string' && turn.text.trim());
          // The disclosure and opening line are already in day.turns; drop spoken repeats of them.
          const opening = `This is ${CALLERS[day.callerId].name} from`;
          const fresh = spoken.filter(turn => !(turn.role === 'assistant' && (turn.text.includes(DISCLOSURE) || turn.text.includes('Tell practice call') || turn.text.includes(opening))));
          fresh.forEach((turn, i) => {
            const raw = turn.text.trim().slice(0, 1000);
            const at = live ? new Date(now()).toISOString() : new Date(start + Math.round(span * (i + 1) / (fresh.length + 1))).toISOString();
            if (turn.role === 'assistant') {
              // Kai's one-time code appears when he brings it up; only after that does reading it count.
              if (day.callerId === 'fraud_team' && /\bcode\b/i.test(raw)) day.codeVisible = true;
              day.turns.push({ role: 'assistant', text: redact(raw), at, source: 'script' });
              return;
            }
            // Same 12-reply cap as text: a spoken reply past it is neither stored nor scored.
            if (day.replies >= REPLY_CAP) return;
            const leaked = scanLeaks(day, raw);
            day.turns.push({ role: 'user', text: safeText(raw), at, ...(leaked.length ? { leaked } : {}) });
            day.replies += 1;
            if (live && /\bstop\s+drill\b/i.test(raw)) end(day, 'stop');
            else if (live && day.replies >= 12) end(day, 'reply_cap');
          });
          day.voiceReceived = Math.max(day.voiceReceived ?? 0, action.turns.length);
          if (!live) day.voiceSaved = true;
        } else if (action?.type === 'portal') {
          day.events.push({ type: 'Verify', surface: 'portal', at: new Date(now()).toISOString() });
          if (day.calls.some(call => call.callerId === 'recruiter' && interviewBooked(call.verdict, true))) day.interview = 'BOOKED';
        } else if (action?.type === 'next') {
          if (day.phase !== 'between') throw new ChallengeError('Give this caller a verdict before the next call.');
          const callerId = CALL_ORDER[CALL_ORDER.indexOf(day.callerId) + 1];
          const at = new Date(now()).toISOString();
          Object.assign(day, { callerId, phase: 'call', startedAt: at, endedAt: undefined, endReason: undefined, replies: 0, verdict: undefined, leaked: [], codeVisible: false, voiceSaved: false, voiceReceived: 0, voiceSession: undefined,
            turns: [{ role: 'system', text: DISCLOSURE, at }, { role: 'assistant', text: CALLERS[callerId].opening, at, source: 'script' }] });
        } else if (action?.type === 'bank') {
          day.events.push({ type: 'Verify', surface: 'bank', at: new Date(now()).toISOString() });
        } else if (action?.type === 'callback_start') {
          if (day.callerId !== 'fraud_team' || day.phase === 'call') throw new ChallengeError('End the bank call before you call Corvanta.');
          if (!day.events.some(event => event.surface === 'bank')) throw new ChallengeError('Open your bank app first.');
          if (!day.callbackStep) day.callbackStep = 1;
        } else if (action?.type === 'callback_next') {
          if (!day.callbackStep) throw new ChallengeError('Call Corvanta first.');
          if (day.callbackStep < 3) {
            day.callbackStep += 1;
            if (day.callbackStep === 3) {
              day.events.push({ type: 'Verify', surface: 'callback', at: new Date(now()).toISOString() });
              if (day.bank !== 'FAILED' && bankResolves(day.leaked, true)) day.bank = 'RESOLVED';
            }
          }
        }
        if (trackRisk) queueRisk(day);
        return day;
    });
    scheduleRisk?.(id);
    return updated;
  }
  return {
    async start(): Promise<Challenge> {
      const startedAt = new Date(now()).toISOString();
      const day: Challenge = { id: crypto.randomUUID(), balance: 1000, interview: 'OPEN', bank: 'OPEN', callerId: 'recruiter', phase: 'call', startedAt, replies: 0,
        turns: [{ role: 'system', text: DISCLOSURE, at: startedAt }, { role: 'assistant', text: CALLERS.recruiter.opening, at: startedAt, source: 'script' }], events: [], calls: [], leaked: [], codeVisible: false, callbackStep: 0 };
      if (trackRisk) queueRisk(day);
      await store.create(day);
      scheduleRisk?.(day.id);
      return day;
    },
    get: (id: string) => update(id),
    /** The stage board's once-a-second poll: a plain read that takes no lock and writes nothing. */
    async stagePlan(id: string): Promise<Challenge['stagePlan']> {
      return store.readStagePlan?.(id);
    },
    /** Caches the reveal in the saved day. A concurrent action may overwrite it; the next request recomputes. */
    saveReveal: store.saveReveal,
    act: (id: string, action: Action) => update(id, action),
  };
}
