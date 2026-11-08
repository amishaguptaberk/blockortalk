#!/usr/bin/env node
// Standalone Debrief run (ticket 4). Examples:
//   node scripts/debrief.mjs --transcript data/transcripts/james-slip.json
//   node scripts/debrief.mjs --persona data/personas/james.json --transcript my-call.json --json
//   node scripts/debrief.mjs --all            # every sample, checked against its `expected` block
//   node scripts/debrief.mjs --all --fixed    # same, without calling Nemotron
// Reads NVIDIA_API_KEY (and NVIDIA_BASE_URL, NEMOTRON_AGENT_MODEL, NEMOTRON_AGENT_FALLBACK_MODEL)
// from the environment or .env.local. Without a key it runs the fixed path.

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  runDebrief, createNemotronClient, assertPersona, assertTranscript, assertDebriefResult, pickDayRewind, DEFAULT_TIMEOUT_MS,
} from '../lib/debrief/index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    persona: { type: 'string' },
    transcript: { type: 'string' },
    all: { type: 'boolean', default: false },
    fixed: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    out: { type: 'string' },
    'out-dir': { type: 'string' },
    timeout: { type: 'string' },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help || (!args.all && !args.transcript)) {
  console.log(`Usage:
  node scripts/debrief.mjs --transcript <file> [--persona <file>] [--fixed] [--json] [--out <file>] [--timeout <ms>]
  node scripts/debrief.mjs --all [--fixed] [--out-dir <dir>] [--timeout <ms>]

  --persona   persona card; defaults to data/personas/<transcript.persona_id>.json
  --fixed     skip Nemotron and run the fixed sequence of the same tools
  --json      print the DebriefResult JSON instead of the readable report
  --timeout   agent time limit in ms (default ${DEFAULT_TIMEOUT_MS}, per the spec)`);
  process.exit(args.help ? 0 : 1);
}

const envFile = join(root, '.env.local');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envFile); } catch { /* fall back to the plain environment */ }
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const llm = args.fixed ? null : createNemotronClient(process.env);
const timeoutMs = args.timeout ? Number(args.timeout) : DEFAULT_TIMEOUT_MS;

const c = process.stdout.isTTY && !process.env.NO_COLOR
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m` }
  : { dim: (s) => s, bold: (s) => s, red: (s) => s, green: (s) => s };

function loadCall(transcriptPath, personaPath) {
  const transcript = assertTranscript(readJson(transcriptPath), transcriptPath);
  const pPath = personaPath ?? join(root, 'data', 'personas', `${transcript.persona_id}.json`);
  const persona = assertPersona(readJson(pPath), pPath);
  return { persona, transcript };
}

function printStep(step) {
  if (args.json || args.quiet) return;
  if (step.tool === 'fallback') {
    console.log(c.red(`   ↯ ${step.result_summary} → running the fixed sequence`));
    return;
  }
  const who = step.by === 'nemotron' ? 'nemotron' : 'fixed';
  console.log(`  ${String(step.n).padStart(2)} · ${c.bold(step.tool)} ${c.dim(`[${who}, ${step.ms} ms]`)}`);
  console.log(c.dim(`       in:  ${step.input_summary}`));
  console.log(`       out: ${step.result_summary}`);
}

function printReport(r) {
  const status = { kept: c.green('kept'), broken: c.red('broken'), not_tested: c.dim('not tested') };
  console.log(`\n${c.bold('Rules')}`);
  for (const x of r.rules) console.log(`  ${x.rule}. ${status[x.status].padEnd(12)} ${x.turn ? `turn ${x.turn}` : '      '}  ${c.dim(x.evidence)}`);
  console.log(`\n${c.bold('Moves')}  ${r.moves.map((m) => `${m.move}@${m.turn}`).join('  ') || 'none'}`);
  console.log(`\n${c.bold('Decisions')}`);
  for (const d of r.decisions) {
    const mark = d.result === 'worked' ? c.green('worked ') : c.red('cost you');
    console.log(`  turn ${String(d.turn).padStart(2)}  ${mark}  ${d.sentence} ${c.dim(`(${d.cost_label}; ${d.sentence_source})`)}`);
  }
  const task = r.outcome.task ? `, task "${r.outcome.task.label}" ${r.outcome.task.status}` : '';
  console.log(`\n${c.bold('Outcome')}  $${r.outcome.money_lost} lost${task}`);
  if (r.rewind) console.log(`${c.bold('Rewind')}   turn ${r.rewind.turn} (${r.rewind.decision_id}) — ${r.rewind.reason}`);
  console.log(`${c.bold('Path')}     ${r.path}${r.model ? ` (${r.model})` : ''}${r.fallback_reason ? c.dim(` — ${r.fallback_reason}`) : ''}`);
  if (r.mismatches.length) console.log(c.red(`Mismatches (code wins): ${r.mismatches.map((m) => `${m.field}: agent ${m.agent} vs code ${m.code}`).join('; ')}`));
}

function compare(r, expected) {
  if (!expected) return [];
  const problems = [];
  for (const [n, e] of Object.entries(expected.rules ?? {})) {
    const got = r.rules[Number(n) - 1];
    if (got.status !== e.status || (e.turn !== undefined && got.turn !== e.turn)) {
      problems.push(`rule ${n}: got ${got.status}@${got.turn}, expected ${e.status}@${e.turn ?? '-'}`);
    }
  }
  if (expected.money_lost !== undefined && r.outcome.money_lost !== expected.money_lost) problems.push(`money ${r.outcome.money_lost} != ${expected.money_lost}`);
  if (expected.task !== undefined && (r.outcome.task?.status ?? null) !== expected.task) problems.push(`task ${r.outcome.task?.status} != ${expected.task}`);
  if (expected.leaked && [...r.outcome.leaked].sort().join() !== [...expected.leaked].sort().join()) problems.push(`leaked ${r.outcome.leaked} != ${expected.leaked}`);
  if (expected.moves && r.moves.map((m) => `${m.move}@${m.turn}`).sort().join() !== [...expected.moves].sort().join()) problems.push('moves differ');
  if (expected.rewind_turn !== undefined && r.rewind?.turn !== expected.rewind_turn) problems.push(`rewind turn ${r.rewind?.turn} != ${expected.rewind_turn}`);
  return problems;
}

async function debriefOne(transcriptPath, personaPath) {
  const { persona, transcript } = loadCall(transcriptPath, personaPath);
  if (!args.json && !args.quiet) {
    console.log(`\n${c.bold(`Debrief: ${transcript.id}`)} — ${persona.persona_name}, ${persona.claimed_org} · verdict ${transcript.verdict}`);
    console.log(c.dim(`  ${llm ? `Nemotron agent (${llm.model}), ${timeoutMs} ms limit` : 'fixed path'}`));
  }
  const result = assertDebriefResult(await runDebrief({ persona, transcript, llm, mode: args.fixed ? 'fixed' : 'auto', timeoutMs, onStep: printStep }));
  return { result, expected: transcript.expected };
}

if (args.all) {
  const dir = join(root, 'data', 'transcripts');
  const rows = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const { result, expected } = await debriefOne(join(dir, file));
    if (!args.json && !args.quiet) printReport(result);
    rows.push({ file, result, problems: compare(result, expected) });
    if (args['out-dir']) {
      mkdirSync(args['out-dir'], { recursive: true });
      writeFileSync(join(args['out-dir'], file), `${JSON.stringify(result, null, 2)}\n`);
    }
  }
  if (args.json) {
    console.log(JSON.stringify(rows.map((r) => r.result), null, 2));
  } else {
    console.log(`\n${c.bold('Summary')}`);
    for (const { file, result: r, problems } of rows) {
      const rules = r.rules.map((x) => `R${x.rule}:${x.status === 'not_tested' ? '-' : `${x.status[0]}${x.turn}`}`).join(' ');
      console.log(`  ${problems.length ? c.red('FAIL') : c.green('ok  ')}  ${basename(file, '.json').padEnd(16)} ${rules.padEnd(26)} $${String(r.outcome.money_lost).padEnd(4)} rewind@${r.rewind?.turn ?? '-'}  ${r.path}${problems.length ? `\n        ${problems.join('\n        ')}` : ''}`);
    }
    const day = ['nina', 'marcus', 'james'].map((p) => rows.find((x) => x.result.persona.id === p && x.file.includes('slip'))?.result).filter(Boolean);
    const dayRewind = pickDayRewind(day);
    if (dayRewind) console.log(c.dim(`\n  Day rewind if all three slips happened: ${dayRewind.persona.name}, turn ${dayRewind.turn} (${dayRewind.decision_id})`));
  }
  process.exit(rows.some((r) => r.problems.length) ? 1 : 0);
} else {
  const { result, expected } = await debriefOne(args.transcript, args.persona);
  if (args.out) writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    printReport(result);
    const problems = compare(result, expected);
    if (expected) console.log(problems.length ? c.red(`\nExpected-check FAILED:\n  ${problems.join('\n  ')}`) : c.green('\nMatches the transcript\'s expected block.'));
  }
}
