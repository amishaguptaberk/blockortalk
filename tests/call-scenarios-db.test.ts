import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { createScenarioStore } from '../lib/season/scenarios/server';
import { createScenarioCorpus } from '../lib/season/scenarios/corpus';

const database = process.env.TEST_DATABASE_URL;
test.skipIf(!database)('seed is repeatable and retrieval uses only same-label prompt examples across both sources', async () => {
  const schema = 'scenarios_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(new URL('../migrations/010_call_scenarios.sql', import.meta.url), 'utf8'));
    const store = createScenarioStore(url.toString());
    await store.seed(); await store.seed();
    expect(await store.catalog()).toHaveLength(14);
    expect(Object.keys((await store.catalog())[0]).sort()).toEqual(['card', 'category', 'id', 'org', 'secrets']);
    expect((await store.get('bank'))?.versions.scam.steps).toHaveLength(4);
    expect(await store.get('missing')).toBeNull();
    await db.query(`CREATE TABLE practice_datasets(pool_id text PRIMARY KEY,source text,created_at timestamptz DEFAULT now(),retrieval_method text);
      CREATE TABLE practice_examples(pool_id text,id text,dialogue text,label integer,topic text,split text,source text,content_hash text)`);
    const kaggle = 'teeconnie/scam-and-non-scam-call-conversation-dataset';
    const bosu = 'BothBosu/scam-dialogue';
    await db.query("INSERT INTO practice_datasets(pool_id,source,retrieval_method) VALUES ('k',$1,'lexical'),('b',$2,'vector'),('x','unsupported','lexical')", [kaggle, bosu]);
    for (const label of [0, 1]) for (let i = 0; i < 5; i++) {
      const source = i < 2 ? kaggle : bosu;
      await db.query('INSERT INTO practice_examples VALUES($1,$2,$3,$4,$5,$6,$7,$2)', [i < 2 ? 'k' : 'b', `${label}-${i}`, i === 0 ? 'bank fraud account security code' : 'parcel travel office', label, i === 0 ? 'bank' : 'other', 'prompt', source]);
    }
    await db.query("INSERT INTO practice_examples VALUES ('k','held','bank bank bank fraud',1,'bank','held_out',$1,'held'),('x','foreign','bank bank fraud',1,'bank','prompt','unsupported','foreign')", [kaggle]);
    const corpus = createScenarioCorpus(url.toString());
    for (const version of ['real', 'scam'] as const) {
      const examples = await corpus.examples('Bank fraud alert', version);
      expect(examples).toHaveLength(5);
      expect(examples[0].id).toBe(version === 'real' ? '0-0' : '1-0');
      expect(examples.every(row => row.label === (version === 'real' ? 0 : 1))).toBe(true);
      expect(new Set(examples.map(row => row.source))).toEqual(new Set([kaggle, bosu]));
      expect(examples.map(row => row.id)).not.toContain('held');
      expect(examples.map(row => row.id)).not.toContain('foreign');
    }
    expect(await corpus.examples('Prize or sweepstakes', 'real')).toHaveLength(5);
    await db.query(`INSERT INTO practice_examples VALUES
      ('b','refund-prompt','unrelated picnic',1,'refund','prompt',$2,'refund-prompt'),
      ('k','refund-held','refund refund billing charge credit',1,'refund','held_out',$1,'refund-held'),
      ('b','ins-prompt','picnic basket',0,'insurance','prompt',$2,'ins-prompt'),
      ('k','ins-held','insurance policy coverage premium',0,'insurance','held_out',$1,'ins-held'),
      ('b','ins-scam','insurance policy',1,'insurance','prompt',$2,'ins-scam')`, [kaggle, bosu]);
    const refund = await corpus.examples('Refund or billing error', 'scam');
    expect(refund).toHaveLength(5);
    expect(refund[0].id).toBe('refund-prompt');
    expect(refund.map(row => row.id)).not.toContain('refund-held');
    expect(refund.every(row => row.label === 1)).toBe(true);
    const insurance = await corpus.examples('Insurance policy check', 'real');
    expect(insurance[0].id).toBe('ins-prompt');
    expect(insurance.map(row => row.id)).not.toContain('ins-held');
    expect(insurance.map(row => row.id)).not.toContain('ins-scam');
    expect(insurance.every(row => row.label === 0)).toBe(true);
    await db.query("DELETE FROM practice_examples WHERE id IN ('1-4','refund-prompt','ins-prompt','ins-scam')");
    await expect(corpus.examples('Bank fraud alert', 'scam')).rejects.toThrow('five');
  } finally {
    await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
