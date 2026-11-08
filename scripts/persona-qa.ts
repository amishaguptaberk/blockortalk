import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { CALLERS, RECEIVERS, runConversation, formatReport, type Row, type Chat } from '../lib/persona-qa/run';

const args = process.argv.slice(2);
function option(name: string, fallback: string) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1] ?? ''; }
const allowed = new Set(['--output', '--limit', '--budget-seconds']);
for (let i = 0; i < args.length; i += 2) if (!allowed.has(args[i]) || !args[i + 1]) throw new Error('Use --output DIR, --limit 1..27, or --budget-seconds N.');
const output = resolve(option('--output', 'data/cache/persona-qa'));
const limit = Number(option('--limit', '27'));
const seconds = Number(option('--budget-seconds', '180'));
if (!Number.isInteger(limit) || limit < 1 || limit > 27 || !Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid QA limit or time budget.');
if (!process.env.NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY is required.');
const model = process.env.PERSONA_QA_MODEL ?? 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const base = (process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
const hash = createHash('sha256').update(model).update(base);
for (const path of ['scripts/persona-qa.ts', 'lib/persona-qa/run.ts', 'lib/persona-qa/checks.ts', 'lib/policy/normalize.mjs', 'lib/voice/personas.ts', 'lib/voice/agentConfig.ts', 'lib/voice/disclosure.ts']) hash.update(await readFile(path));
const fingerprint = hash.digest('hex');
const deadline = Date.now() + seconds * 1000;
let next = 0;
const chat: Chat = async messages => {
  const wait = Math.max(0, next - Date.now());
  if (Date.now() + wait >= deadline) throw new Error('QA time budget reached; rerun to resume completed rows.');
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  next = Date.now() + 2000;
  const response = await fetch(`${base}/chat/completions`, { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - Date.now()))),
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 160, chat_template_kwargs: { enable_thinking: false } }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`NVIDIA HTTP ${response.status}; no automatic retries. Rerun later to resume.`); }
  const body = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  const choice = body.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (!text || choice?.finish_reason === 'length') throw new Error('NVIDIA returned an empty or truncated reply.');
  return text;
};
await mkdir(output, { recursive: true });
async function save(path: string, data: unknown) {
  await writeFile(path + '.tmp', JSON.stringify(data, null, 2) + '\n');
  await rename(path + '.tmp', path);
}
const rows: Row[] = [];
let failure: string | null = null;
const cases = Object.keys(RECEIVERS).flatMap(receiver => CALLERS.map(caller => ({ caller, receiver: receiver as keyof typeof RECEIVERS }))).slice(0, limit);
for (const { caller, receiver } of cases) {
  const path = join(output, `${caller}-${receiver.replaceAll(' ', '-')}.json`);
  let cached;
  try { cached = JSON.parse(await readFile(path, 'utf8')); } catch { /* New row. */ }
  if (cached?.fingerprint === fingerprint && cached.complete === true) { rows.push(cached.row); continue; }
  try {
    const row = await runConversation(caller, receiver, chat, turns => save(path, { fingerprint, model, complete: false, caller, receiver, turns }));
    rows.push(row);
    await save(path, { fingerprint, model, complete: true, row });
    console.log(`${rows.length}/${limit} ${caller} × ${receiver}: ${Object.values(row.checks).every(Boolean) ? 'PASS' : 'FAIL'}`);
  } catch (error) {
    failure = error instanceof Error && /^(NVIDIA HTTP|QA time budget|NVIDIA returned)/.test(error.message) ? error.message : 'Provider unavailable or timed out; partial transcript saved.';
    break;
  }
}
const complete = rows.length === 27;
const passed = complete && rows.every(row => Object.values(row.checks).every(Boolean));
const report = `# Challenge Persona QA\n\nModel: ${model}\n\nCompleted: ${rows.length}/27. ${passed ? 'PASS' : 'NOT PASSED'}.\n\n${failure ?? (complete ? 'All planned rows completed.' : 'Limited run; not full acceptance evidence.')}\n\n${formatReport(rows)}\n`;
await writeFile(join(output, 'report.md'), report);
await save(join(output, 'summary.json'), { fingerprint, model, complete, passed, failure, rows });
console.log(report);
process.exitCode = passed ? 0 : 1;
