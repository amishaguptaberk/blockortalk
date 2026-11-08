import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const evaluation = process.argv.includes('--evaluate');
const archive = 'data/cache/kaggle-scam-calls.zip';
if (!evaluation && !existsSync(archive)) {
  const response = await fetch('https://www.kaggle.com/api/v1/datasets/download/teeconnie/scam-and-non-scam-call-conversation-dataset', { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Kaggle download returned HTTP ${response.status}`);
  await mkdir('data/cache', { recursive: true });
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
}
const python = process.env.PYTHON || (existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
const result = spawnSync(python, ['-m', evaluation ? 'detection.practice_evaluate' : 'detection.practice_index', ...(evaluation ? process.argv.slice(2).filter(arg => arg !== '--evaluate') : [])], { env: process.env, stdio: 'inherit' });
if (result.error) console.error('Python could not start. Install requirements.txt and set PYTHON if needed.');
process.exit(result.status ?? 1);
