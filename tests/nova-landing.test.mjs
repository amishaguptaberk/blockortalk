import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/nova.html'), 'utf8');

test('nova landing keeps one sprite instead of a robot per section', () => {
  assert.equal(html.includes('three.module.js'), false);
  assert.equal(html.includes('three/addons'), false);
  assert.equal((html.match(/id="actor"/g) || []).length, 1);
  assert.match(html, /\/sprites\/purple\//);
  assert.match(html, /talk_standard/);
  assert.doesNotMatch(html, /\/sprites\/red\//);
  assert.doesNotMatch(html, /\/sprites\/green\//);
});

test('the page is Block or Talk, with four moves and no product catalog', () => {
  for (const id of ['intro', 'product', 'reviews']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /BLOCK OR TALK/);
  assert.match(html, /Every scam/);
  assert.match(html, /const moves = \["Probe", "Protect", "Verify", "Disconnect"\]/);
  assert.doesNotMatch(html, /labels\.concat/);
  assert.doesNotMatch(html, /NOVA AGENT|LAUNCH NOVA|NFT Generator|\$NOVA|Web3/);
  assert.match(html, /Ilan Brooks/);
  assert.match(html, /Rhea Okafor/);
  assert.match(html, /Mara Elling/);
  assert.match(html, /href="\/challenge"/);
  assert.match(html, /@font-face/);
  assert.match(html, /Schibsted Grotesk/);
  assert.match(html, /IBM Plex Mono/);
});
