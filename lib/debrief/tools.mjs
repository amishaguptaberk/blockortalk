// Deterministic tools the Debrief agent calls. Code decides leaks, money, tasks and rule statuses
// (SPEC: Agent and voice decisions); the agent only explains them and picks the rewind point.
// Every tool is a pure function of the loaded call, memoized on the context, so the agent can call
// them in any order and a fixed sequence of the same calls gives the same answers.

import { RULES, VERIFY_EVENTS, VERIFY_LABELS, secretLabel } from '../policy/rules.mjs';
import { findLeaks } from '../policy/leaks.mjs';
import { mentionsDetail } from '../policy/normalize.mjs';

// ---------- context ----------

export function createContext(persona, transcript) {
  const turns = [...transcript.turns].sort((a, b) => a.turn - b.turn);
  return {
    persona,
    transcript,
    turns,
    events: transcript.events ?? [],
    lastTurn: turns.length ? turns[turns.length - 1].turn : 0,
    cache: new Map(),
  };
}

function memo(ctx, name, fn) {
  if (!ctx.cache.has(name)) ctx.cache.set(name, fn());
  return ctx.cache.get(name);
}

const isDisclosure = (turn) => turn.beat === 'disclosure' || /^this is a tell practice call/i.test(turn.text) || /^it'?s recorded for your report/i.test(turn.text);
const callerTurns = (ctx) => ctx.turns.filter((t) => t.speaker === 'caller' && !isDisclosure(t));
const playerTurns = (ctx) => ctx.turns.filter((t) => t.speaker === 'player');
const turnAt = (ctx, n) => ctx.turns.find((t) => t.turn === n);
const excerpt = (text, max = 90) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// ---------- patterns ----------

const ASK = /\b(read|tell|confirm|give|need|provide|what'?s|repeat|share|verify|send me|say)\b/i;
const SECRET_ASKS = {
  date_of_birth: /\b(date of birth|birth ?date|birthday|dob|born)\b/i,
  home_address: /\b(home address|address|where (do )?you live)\b/i,
  account_pin: /\bpin\b/i,
  card_ending: /\b(card number|full card|last (four|4)( digits)?|security code|cvv)\b/i,
  gift_card_code: /\b(gift ?card|code on the back)\b/i,
  live_code: /\b(one-?time code|verification code|six digits|the code|read it back|text(ed)? you a code)\b/i,
};

const TACTIC_PATTERNS = {
  authority: /\b(fraud (team|department)|security team|supervisor|compliance|case (number|id)|reference number|official)\b/gi,
  urgency: /\b(right now|immediately|quickly|hurry|asap|as soon as possible|releases?|expires?|deadline|last chance|still pending|goes through|in the next (two|few|\d+) minutes|don'?t lose your spot)\b/gi,
  fear: /\b(locked|frozen|suspended|compromised|stolen|fraudulent|blocked)\b/gi,
  reward: /\b(bonus|prize|reward|free|starter kit|swag|reimburs\w*|first paycheck|comes right back)\b/gi,
  'details-as-proof': /\b(i can see|on file|our records|already (have|know) your)\b/gi,
};
const ODD_PAYMENT = /\b(gift ?card|wire transfer|crypto|bitcoin|zelle|cash app)\b/i;
const SECRECY = /\b(don'?t tell|keep (this|it) (between|quiet|to yourself)|don'?t call (the|your) bank)\b/i;

const REFUSAL = /\b(i (don'?t|do not|won'?t|will not) (share|give|read|say)|not (going|gonna) to (give|share|read)|i'?m not (giving|sharing|reading|comfortable)|i'?d rather not|no way|i'?ll (call|check)|call (you|them|it) back|call the number)\b/i;

// ---------- tools ----------

export function readTranscript(ctx) {
  return memo(ctx, 'read_transcript', () => {
    const p = ctx.persona;
    const hangup = ctx.events.find((e) => e.type === 'hangup');
    return {
      transcript_id: ctx.transcript.id,
      persona: { id: p.id, name: p.persona_name, claimed_org: p.claimed_org, call_type: p.call_type },
      verdict: ctx.transcript.verdict ?? null,
      turns: ctx.turns.length,
      caller_turns: callerTurns(ctx).length,
      player_replies: playerTurns(ctx).length,
      ended_by: hangup?.by ?? (ctx.events.some((e) => e.type === 'cap_reached') ? 'cap' : 'unknown'),
      events: ctx.events.map((e) => `${e.type}${e.by ? `:${e.by}` : ''}@${e.after_turn}`),
      fake_secrets: Object.keys(p.fake_secrets ?? {}),
      lines: ctx.turns.map((t) => `${t.turn} ${t.speaker}: ${t.text}`),
    };
  });
}

export function findSecretRequests(ctx) {
  return memo(ctx, 'find_secret_requests', () => {
    const secrets = Object.keys(ctx.persona.fake_secrets ?? {});
    const beats = new Map((ctx.persona.script_beats ?? []).map((b) => [b.id, b]));
    const requests = [];
    const detailsCited = [];
    for (const turn of callerTurns(ctx)) {
      const asked = new Set();
      let source = 'keywords';
      const beat = turn.beat && beats.get(turn.beat);
      if (beat?.asks_for?.length) {
        beat.asks_for.filter((s) => secrets.includes(s)).forEach((s) => asked.add(s));
        source = 'beat';
      }
      if (ASK.test(turn.text)) {
        for (const s of secrets) if (SECRET_ASKS[s]?.test(turn.text)) asked.add(s);
      }
      if (asked.size) requests.push({ turn: turn.turn, secrets: [...asked], source, text: turn.text });
      const details = (ctx.persona.caller_knows ?? []).filter((d) => mentionsDetail(turn.text, d));
      if (details.length) detailsCited.push({ turn: turn.turn, details });
    }
    return { requests, details_cited: detailsCited };
  });
}

export function checkLeaks(ctx) {
  return memo(ctx, 'check_leaks', () => {
    const leaks = ctx.transcript.recorded_leaks ?? findLeaks(ctx.turns, ctx.persona.fake_secrets);
    const costSecrets = new Set(ctx.persona.stakes?.cost_secrets ?? []);
    return {
      leaks: leaks.map((l) => ({ ...l, label: secretLabel(l.secret), costs_money: costSecrets.has(l.secret) })),
      checked: Object.keys(ctx.persona.fake_secrets ?? {}),
    };
  });
}

export function getVerifyEvents(ctx) {
  return memo(ctx, 'get_verify_events', () => {
    const verify = ctx.events
      .filter((e) => VERIFY_EVENTS.includes(e.type))
      .map((e) => ({ type: e.type, after_turn: e.after_turn, t: e.t ?? null, label: VERIFY_LABELS[e.type] }));
    const hangup = ctx.events.find((e) => e.type === 'hangup') ?? null;
    return {
      verify,
      hangup: hangup ? { by: hangup.by, after_turn: hangup.after_turn, t: hangup.t ?? null } : null,
      code_popup: ctx.events.find((e) => e.type === 'code_popup')?.after_turn ?? null,
    };
  });
}

/**
 * Stand-in for the production detector (ticket 7): keyword and persona-detail tagging over caller
 * turns, returning the detector's shape (label, scam_type, tactic-tagged spans, confidence) so the
 * real detector can replace it behind the same call.
 */
export function runDetector(ctx) {
  return memo(ctx, 'run_detector', () => {
    const redFlags = [];
    const pressure = [];
    const { requests } = findSecretRequests(ctx);
    const requestTurns = new Map(requests.map((r) => [r.turn, r.secrets]));
    const span = (m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] });
    for (const turn of callerTurns(ctx)) {
      for (const [tactic, re] of Object.entries(TACTIC_PATTERNS)) {
        for (const m of turn.text.matchAll(re)) redFlags.push({ turn: turn.turn, tactic, span: span(m) });
      }
      const pay = turn.text.match(ODD_PAYMENT);
      if (pay) redFlags.push({ turn: turn.turn, tactic: 'odd-payment', span: span(pay) });
      for (const s of requestTurns.get(turn.turn) ?? []) {
        const m = turn.text.match(SECRET_ASKS[s] ?? /$^/);
        if (m && !redFlags.some((f) => f.turn === turn.turn && f.span.start === m.index)) {
          redFlags.push({ turn: turn.turn, tactic: 'asks-for-secret', span: span(m) });
        }
      }
      // Knowing your details is only a red flag on a call that also asks for a secret;
      // a recruiter confirming your interview slot is not a tell.
      for (const d of requests.length ? ctx.persona.caller_knows ?? [] : []) {
        if (!mentionsDetail(turn.text, d)) continue;
        const i = turn.text.toLowerCase().indexOf(String(d).toLowerCase());
        redFlags.push({
          turn: turn.turn,
          tactic: 'details-as-proof',
          span: i >= 0 ? { start: i, end: i + String(d).length, text: turn.text.slice(i, i + String(d).length) } : { start: 0, end: 0, text: String(d) },
        });
      }
      const kinds = new Set(redFlags
        .filter((f) => f.turn === turn.turn && (f.tactic === 'urgency' || f.tactic === 'fear'))
        .map((f) => f.tactic));
      if (ODD_PAYMENT.test(turn.text)) kinds.add('odd_payment');
      if (SECRECY.test(turn.text)) kinds.add('secrecy');
      if (kinds.size) pressure.push({ turn: turn.turn, kinds: [...kinds] });
    }
    if (ctx.transcript.detection) return { ...ctx.transcript.detection, pressure };
    redFlags.sort((a, b) => a.turn - b.turn || a.span.start - b.span.start);
    const suspicious = requests.length > 0;
    return {
      source: 'keyword-stub',
      label: suspicious ? 'scam' : 'legit',
      scam_type: null,
      confidence: suspicious ? (pressure.length ? 0.75 : 0.6) : 0.6,
      red_flags: redFlags,
      pressure,
    };
  });
}

function tagMoves(ctx) {
  const { requests } = findSecretRequests(ctx);
  const { leaks } = checkLeaks(ctx);
  const { verify, hangup } = getVerifyEvents(ctx);
  const firstRequest = requests[0]?.turn ?? Infinity;
  const leakTurns = new Set(leaks.map((l) => l.turn));
  const moves = [];
  for (const turn of playerTurns(ctx)) {
    if (turn.turn > firstRequest && !leakTurns.has(turn.turn) && REFUSAL.test(turn.text)) {
      moves.push({ move: 'protect', turn: turn.turn, t: turn.t ?? null, text: turn.text });
    }
    if (turn.text.includes('?')) moves.push({ move: 'probe', turn: turn.turn, t: turn.t ?? null, text: turn.text });
  }
  if (hangup?.by === 'player') {
    moves.push({ move: 'disconnect', turn: hangup.after_turn, t: hangup.t, text: 'Hung up.' });
  }
  for (const v of verify) moves.push({ move: 'verify', turn: v.after_turn, t: v.t, text: `${v.label[0].toUpperCase()}${v.label.slice(1)}.`, event: v.type });
  const order = { probe: 0, protect: 1, disconnect: 2, verify: 3 };
  return moves.sort((a, b) => a.turn - b.turn || order[a.move] - order[b.move] || (a.t ?? 0) - (b.t ?? 0));
}

function scoreOutcome(ctx) {
  const p = ctx.persona;
  const stakes = p.stakes ?? { cost: 0, cost_secrets: [], task_done_when: [] };
  const { leaks } = checkLeaks(ctx);
  const costLeak = leaks.find((l) => (stakes.cost_secrets ?? []).includes(l.secret)) ?? null;
  const moneyLost = costLeak ? stakes.cost : 0;
  let task = null;
  if (p.task) {
    const types = new Set(ctx.events.map((e) => e.type));
    const verdict = ctx.transcript.verdict;
    const done = (stakes.task_done_when ?? []).some((c) =>
      (!c.verdict || c.verdict.includes(verdict)) && (!c.event || types.has(c.event)));
    const status = costLeak && stakes.fail_task_on_cost ? 'failed' : done ? 'done' : 'open';
    task = { id: p.task.id, label: p.task.label, status };
  }
  return { money_lost: moneyLost, balance_change: -moneyLost, task, leaked: leaks.map((l) => l.secret), cost_leak_turn: costLeak?.turn ?? null };
}

function judgeRules(ctx, moves, outcome) {
  const { requests, details_cited: details } = findSecretRequests(ctx);
  const { leaks } = checkLeaks(ctx);
  const { verify, hangup } = getVerifyEvents(ctx);
  const { pressure } = runDetector(ctx);
  const firstLeak = leaks[0] ?? null;
  const firstAfter = (turn, kinds) => moves.find((m) => m.turn > turn && kinds.includes(m.move)) ?? null;
  const labels = (keys) => keys.map(secretLabel).join(' and ');
  const rule = (n, status, turn, evidence) => ({ rule: n, title: RULES[n - 1].title, status, turn, evidence });

  // Rule 1: never share secrets.
  let r1;
  if (firstLeak) {
    r1 = rule(1, 'broken', firstLeak.turn, `You said your ${firstLeak.label} at turn ${firstLeak.turn}.`);
  } else if (requests.length) {
    const asked = [...new Set(requests.flatMap((r) => r.secrets))];
    const kept = firstAfter(requests[0].turn, ['protect', 'disconnect']);
    r1 = rule(1, 'kept', kept?.turn ?? requests[0].turn, `The caller asked for your ${labels(asked)}; you never gave them.`);
  } else {
    r1 = rule(1, 'not_tested', null, 'The caller never asked for a secret.');
  }

  // Rule 2: pressure is the tell.
  let r2;
  if (!pressure.length) {
    r2 = rule(2, 'not_tested', null, 'No urgency, secrecy or odd payment request on this call.');
  } else {
    const p0 = pressure[0];
    const kinds = [...new Set(pressure.flatMap((p) => p.kinds))].map((k) => k.replace('_', ' ')).join(', ');
    const leakAfter = leaks.find((l) => l.turn > p0.turn);
    if (leakAfter) {
      r2 = rule(2, 'broken', leakAfter.turn, `Under pressure (${kinds}) from turn ${p0.turn}, you gave your ${leakAfter.label} at turn ${leakAfter.turn}.`);
    } else {
      const kept = firstAfter(p0.turn, ['protect', 'disconnect']);
      r2 = rule(2, 'kept', kept?.turn ?? p0.turn, `The caller pushed (${kinds}) and you didn't give in.`);
    }
  }

  // Rule 3: knowing your details doesn't prove who's calling.
  let r3;
  const d0 = details[0] ?? null;
  const reqAfterDetails = d0 ? requests.find((r) => r.turn >= d0.turn) : null;
  if (!d0 || !reqAfterDetails) {
    r3 = rule(3, 'not_tested', null, d0 ? 'The caller knew your details but asked for nothing secret.' : 'The caller never used your details as proof.');
  } else {
    const leakAfter = leaks.find((l) => l.turn > d0.turn);
    const cited = d0.details.join(', ');
    if (leakAfter) {
      r3 = rule(3, 'broken', leakAfter.turn, `The caller knew your details (${cited}) at turn ${d0.turn}, and you gave your ${leakAfter.label} at turn ${leakAfter.turn}.`);
    } else {
      const kept = firstAfter(reqAfterDetails.turn, ['protect', 'disconnect']);
      r3 = rule(3, 'kept', kept?.turn ?? reqAfterDetails.turn, `The caller knew your details (${cited}), and you still didn't treat that as proof.`);
    }
  }

  // Rule 4: hang up and call back on a number you already have.
  let r4;
  const firstVerify = verify[0] ?? null;
  if (firstLeak && (!firstVerify || firstLeak.turn <= firstVerify.after_turn)) {
    r4 = rule(4, 'broken', firstLeak.turn, `You gave your ${firstLeak.label} before checking through a number you already have.`);
  } else if (firstVerify) {
    r4 = rule(4, 'kept', firstVerify.after_turn, `You ${firstVerify.label}.`);
  } else if (outcome.task?.status === 'open') {
    const at = hangup?.by === 'player' ? hangup.after_turn : ctx.lastTurn;
    r4 = rule(4, 'broken', at, `You ${hangup?.by === 'player' ? 'hung up' : 'ended the call'} without checking through a number you already have, so the task stayed open.`);
  } else if (hangup?.by === 'player') {
    r4 = rule(4, 'kept', hangup.after_turn, 'You hung up instead of handing anything over.');
  } else {
    r4 = rule(4, 'not_tested', null, 'Nothing on this call needed a call-back.');
  }
  return [r1, r2, r3, r4];
}

const TASK_WEIGHT = { failed: 300, open: 200 };

function buildDecisions(ctx, moves, rules, outcome) {
  const p = ctx.persona;
  const { leaks } = checkLeaks(ctx);
  const verdict = ctx.transcript.verdict ?? null;
  const decisions = [];
  const add = (d) => decisions.push({
    cost: { money: 0, task: null, rules_broken: [], misjudged: false },
    ...d,
  });

  // Leaks, grouped by turn.
  const byTurn = new Map();
  for (const l of leaks) byTurn.set(l.turn, [...(byTurn.get(l.turn) ?? []), l]);
  for (const [turn, ls] of byTurn) {
    const costly = turn === outcome.cost_leak_turn;
    add({
      id: `d${turn}-leak`, turn, kind: 'leak', result: 'cost_you', secrets: ls.map((l) => l.secret),
      text: turnAt(ctx, turn)?.text ?? '',
      cost: {
        money: costly ? outcome.money_lost : 0,
        task: costly && outcome.task?.status === 'failed' ? 'failed' : null,
        rules_broken: [], misjudged: false,
      },
    });
  }
  for (const m of moves) {
    if (m.move === 'probe') continue;
    if (m.move === 'disconnect') {
      add({ id: `d${m.turn}-disconnect`, turn: m.turn, kind: 'disconnect', result: 'worked', text: m.text });
    } else if (m.move === 'verify') {
      add({ id: `d${m.turn}-verify-${m.event}`, turn: m.turn, kind: 'verify', result: 'worked', event: m.event, text: m.text });
    } else {
      add({ id: `d${m.turn}-protect`, turn: m.turn, kind: 'protect', result: 'worked', text: m.text });
    }
  }
  if (verdict) {
    const misjudged = p.call_type === 'legit' ? verdict === 'scam' : verdict === 'real';
    add({
      id: 'verdict', turn: ctx.lastTurn, kind: 'verdict', result: misjudged ? 'cost_you' : 'worked', verdict, text: `You said ${verdict}.`,
      cost: { money: 0, task: null, rules_broken: [], misjudged },
    });
  }

  // An open task is blamed on the hang-up if there was one, otherwise on the verdict.
  if (outcome.task?.status === 'open') {
    const target = decisions.find((d) => d.kind === 'disconnect') ?? decisions.find((d) => d.kind === 'verdict');
    if (target) { target.cost.task = 'open'; target.result = 'cost_you'; }
  }
  // Each broken rule is attached to the decision at its turn: a leak first, then a hang-up, then the verdict.
  for (const r of rules.filter((x) => x.status === 'broken')) {
    const at = decisions.filter((d) => d.turn === r.turn);
    const target = at.find((d) => d.kind === 'leak') ?? at.find((d) => d.kind === 'disconnect') ?? at.find((d) => d.kind === 'verdict');
    if (target) { target.cost.rules_broken.push(r.rule); target.result = 'cost_you'; }
  }
  for (const d of decisions) {
    d.cost_score = d.cost.money + (TASK_WEIGHT[d.cost.task] ?? 0) + 50 * d.cost.rules_broken.length + (d.cost.misjudged ? 10 : 0);
  }
  return decisions.sort((a, b) => a.turn - b.turn || (a.kind === 'verdict') - (b.kind === 'verdict'));
}

export function mapMovesToRules(ctx) {
  return memo(ctx, 'map_moves_to_rules', () => {
    const moves = tagMoves(ctx);
    const outcome = scoreOutcome(ctx);
    const rules = judgeRules(ctx, moves, outcome);
    const decisions = buildDecisions(ctx, moves, rules, outcome);
    const { cost_leak_turn: _ignored, ...publicOutcome } = outcome;
    return { moves, rules, decisions, outcome: publicOutcome };
  });
}

export function chooseRewindPoint(ctx) {
  return memo(ctx, 'choose_rewind_point', () => {
    const { decisions } = mapMovesToRules(ctx);
    const { requests } = findSecretRequests(ctx);
    const costly = decisions.filter((d) => d.result === 'cost_you').sort((a, b) => b.cost_score - a.cost_score || a.turn - b.turn);
    if (costly.length) {
      const d = costly[0];
      return { rewind: { decision_id: d.id, turn: d.turn, cost_score: d.cost_score, cost_you: true, reason: `Costliest decision on this call (${describeCost(d)}).` } };
    }
    // Nothing cost anything: offer the moment with the most pressure instead.
    const costSecrets = ctx.persona.stakes?.cost_secrets ?? [];
    const keyRequest = requests.find((r) => r.secrets.some((s) => costSecrets.includes(s))) ?? requests[0] ?? null;
    const inCall = decisions.filter((d) => d.kind !== 'verdict');
    const d = (keyRequest && inCall.find((x) => x.turn >= keyRequest.turn)) ?? inCall[0] ?? decisions[0] ?? null;
    if (!d) return { rewind: null };
    return { rewind: { decision_id: d.id, turn: d.turn, cost_score: 0, cost_you: false, reason: 'Nothing cost you on this call; this is the moment with the most pressure, if you want to practice it.' } };
  });
}

export function describeCost(d) {
  const parts = [];
  if (d.cost.money) parts.push(`$${d.cost.money}`);
  if (d.cost.task === 'failed') parts.push('task failed');
  if (d.cost.task === 'open') parts.push('task left open');
  if (d.cost.rules_broken.length) parts.push(`rule${d.cost.rules_broken.length > 1 ? 's' : ''} ${d.cost.rules_broken.join(', ')} broken`);
  if (d.cost.misjudged) parts.push('wrong call on who it was');
  return parts.join(', ') || 'no cost';
}

// ---------- registry: what the agent sees ----------

export const TOOLS = {
  read_transcript: {
    run: readTranscript,
    description: 'Read the call: persona, verdict, numbered turns, events (hang-up, code pop-up, verify actions).',
    input: (ctx) => `${ctx.transcript.id}: ${ctx.turns.length} turns, persona ${ctx.persona.persona_name}`,
    summary: (r) => `${r.turns} turns (${r.player_replies} player replies), ended by ${r.ended_by}, verdict ${r.verdict}`,
  },
  find_secret_requests: {
    run: findSecretRequests,
    description: 'Find caller turns that ask for a fake secret, and turns where the caller cites details they know about the player.',
    input: (ctx) => `${callerTurns(ctx).length} caller turns vs ${Object.keys(ctx.persona.fake_secrets ?? {}).length} fake secrets`,
    summary: (r) => (r.requests.length
      ? r.requests.map((q) => `turn ${q.turn} asks for ${q.secrets.map(secretLabel).join(' + ')}`).join('; ')
      : 'no secret requests') + (r.details_cited.length ? `; details cited at turn ${r.details_cited.map((d) => d.turn).join(', ')}` : ''),
  },
  check_leaks: {
    run: checkLeaks,
    description: 'Normalized leak check: did the player say any fake secret (spoken digits, dates and addresses included)?',
    input: (ctx) => `${playerTurns(ctx).length} player turns vs ${Object.keys(ctx.persona.fake_secrets ?? {}).length} fake secrets (normalized)`,
    summary: (r) => (r.leaks.length ? r.leaks.map((l) => `${l.label} leaked at turn ${l.turn}${l.costs_money ? ' (costs money)' : ''}`).join('; ') : 'no leaks'),
  },
  get_verify_events: {
    run: getVerifyEvents,
    description: 'Verify actions (portal opened, bank app opened, call-back completed), the hang-up and the code pop-up.',
    input: (ctx) => `${ctx.events.length} call events`,
    summary: (r) => [
      r.verify.length ? r.verify.map((v) => `${v.type} after turn ${v.after_turn}`).join(', ') : 'no verify events',
      r.hangup ? `hung up by ${r.hangup.by} after turn ${r.hangup.after_turn}` : 'no hang-up',
    ].join('; '),
  },
  run_detector: {
    run: runDetector,
    description: 'Run the scam detector over the caller turns: tactic-tagged red-flag spans and pressure moments.',
    input: (ctx) => `${callerTurns(ctx).length} caller turns · ${ctx.transcript.detection?.source ?? 'keyword-stub'} detector`,
    summary: (r) => `${r.label} (${Math.round(r.confidence * 100)}%), ${r.red_flags.length} red flags [${[...new Set(r.red_flags.map((f) => f.tactic))].join(', ')}], pressure at turn ${r.pressure.map((p) => p.turn).join(', ') || 'none'}`,
  },
  map_moves_to_rules: {
    run: mapMovesToRules,
    description: 'Tag the player moves (Probe, Protect, Verify, Disconnect), score money and task, mark each of the four rules kept / broken / not tested with its turn, and list the key decisions with ids and costs.',
    input: () => 'requests, leaks, verify events, red flags',
    summary: (r) => `${r.rules.map((x) => `R${x.rule} ${x.status}${x.turn ? `@${x.turn}` : ''}`).join(', ')}; ${r.moves.length} moves; ${r.decisions.length} decisions; $${r.outcome.money_lost} lost${r.outcome.task ? `, task ${r.outcome.task.status}` : ''}`,
  },
  choose_rewind_point: {
    run: chooseRewindPoint,
    description: 'Rank the decisions by cost (money, then task, then rules broken) and return the single costliest one as the rewind point.',
    input: (ctx) => `${mapMovesToRules(ctx).decisions.length} decisions`,
    summary: (r) => (r.rewind ? `${r.rewind.decision_id} at turn ${r.rewind.turn} — ${r.rewind.reason}` : 'no decisions to rewind'),
  },
};

export const TOOL_ORDER = Object.keys(TOOLS);

// Agent-facing view of a tool result: drop bulky fields the model doesn't need.
export function forModel(name, result) {
  if (name === 'read_transcript') return result;
  if (name === 'run_detector') return { ...result, red_flags: result.red_flags.map((f) => ({ turn: f.turn, tactic: f.tactic, text: f.span.text })) };
  if (name === 'map_moves_to_rules') {
    return {
      ...result,
      moves: result.moves.map((m) => ({ move: m.move, turn: m.turn, text: excerpt(m.text) })),
      decisions: result.decisions.map((d) => ({ id: d.id, turn: d.turn, kind: d.kind, result: d.result, cost: describeCost(d), text: excerpt(d.text ?? '') })),
    };
  }
  return result;
}
