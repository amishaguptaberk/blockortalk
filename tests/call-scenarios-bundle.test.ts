import { build } from 'esbuild';
import { expect, test } from 'vitest';

test('browser catalog bundle contains no server outlines, tactics or Version data', async () => {
  const result = await build({ entryPoints: ['lib/season/scenarios/catalog.ts'], bundle: true, platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent' });
  const js = result.outputFiles[0]!.text;
  expect(js).toContain('Bank fraud alert');
  for (const forbidden of ['ask_line', 'next_step', 'versions', 'steps', 'tactic', 'Apply Details as proof', 'Please read me', 'cloudpetal-check.invalid']) expect(js).not.toContain(forbidden);
  expect(Object.keys(result.metafile!.inputs).some(path => /server|corpus/.test(path))).toBe(false);
});
