import { build } from 'esbuild';
import { expect, test } from 'vitest';

test('browser call client ships no outlines, hidden identities, server code or prompt context', async () => {
  const output = await build({ entryPoints: ['lib/season/calls/client.ts'], bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent' });
  const js = output.outputFiles[0]!.text;
  for (const token of ['versions', 'tactic', 'outlines', 'ask_line', 'next_step', 'reference_dialogues', 'NVIDIA_API_KEY', 'DATABASE_URL', 'Please read me your fictional']) expect(js).not.toContain(token);
  expect(Object.keys(output.metafile!.inputs)).toEqual(['lib/season/calls/client.ts']);
  expect(js).toContain('/api/play/calls');
});
