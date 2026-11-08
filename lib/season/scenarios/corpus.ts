import pg from 'pg';
import { KAGGLE_SOURCE } from '../../practice/sources';
import type { Version } from './types';

/** BothBosu training types and the Version they belong to. Evaluation splits are not types we retrieve. */
export const TRAIN_TOPIC_LABEL = {
  ssn: 'scam', refund: 'scam', support: 'scam', reward: 'scam',
  delivery: 'real', insurance: 'real', telemarketing: 'real', wrong: 'real',
} as const satisfies Record<string, Version>;

export type ScenarioSource = { keywords: string; topic: Partial<Record<Version, string>> };

// Keywords rank prompt examples. `topic` prefers the matching training type for that Version only.
export const scenarioSources: Record<string, ScenarioSource> = {
  'Bank fraud alert': { keywords: 'bank fraud account transaction security code', topic: {} },
  'Delivery or customs fee': { keywords: 'delivery parcel customs shipping fee', topic: { real: 'delivery' } },
  'Holiday gift card or travel deal': { keywords: 'holiday gift card travel deal vacation', topic: { scam: 'reward' } },
  'Business invoice or CEO wire': { keywords: 'business invoice executive wire payment', topic: {} },
  'Phishing link texted mid-call': { keywords: 'link text message verify account', topic: {} },
  'Tech support': { keywords: 'technical support computer virus device', topic: { scam: 'support' } },
  'Government (IRS or SSN)': { keywords: 'government tax social security notice', topic: { scam: 'ssn' } },
  'Prize or sweepstakes': { keywords: 'prize sweepstakes lottery winner reward', topic: { scam: 'reward' } },
  'Crypto or investment': { keywords: 'crypto investment trading profit', topic: {} },
  'Phone carrier port-out': { keywords: 'phone mobile carrier transfer port account', topic: {} },
  'Refund or billing error': { keywords: 'refund billing charge credit', topic: { scam: 'refund' } },
  'Insurance policy check': { keywords: 'insurance policy coverage premium', topic: { real: 'insurance' } },
  'Subscription or sales call': { keywords: 'telemarketing subscription offer promotion', topic: { real: 'telemarketing' } },
  'Wrong number': { keywords: 'wrong number misdial mistaken', topic: { real: 'wrong' } },
};
export type ScenarioExample = { id: string; dialogue: string; label: 0 | 1; source: string };

export function createScenarioCorpus(connectionString: string) {
  return {
    async examples(category: string, version: Version): Promise<ScenarioExample[]> {
      const source = scenarioSources[category];
      if (!source || !['real', 'scam'].includes(version)) throw new Error('Unknown scenario Category or Version.');
      const topic = source.topic[version] ?? null;
      if (topic && TRAIN_TOPIC_LABEL[topic as keyof typeof TRAIN_TOPIC_LABEL] !== version) throw new Error('Example topic does not match this Version.');
      if (!connectionString) throw new Error('The example database is not configured.');
      const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
      await client.connect();
      try {
        // Rank prompt rows only. A matching training topic leads; same-label prompt rows fill a thin Category.
        // Held-out rows stay out even when their text matches the keywords.
        const result = await client.query(`WITH pools AS (
          SELECT DISTINCT ON (source) pool_id,source FROM practice_datasets
          WHERE source=ANY($1::text[])
          ORDER BY source,created_at DESC,pool_id
        ) SELECT e.id,e.dialogue,e.label,e.source FROM practice_examples e
          JOIN pools p ON p.pool_id=e.pool_id AND p.source=e.source
          WHERE e.split='prompt' AND e.label=$2
          ORDER BY CASE WHEN $4::text IS NOT NULL AND e.topic = $4 THEN 0 ELSE 1 END,
            ts_rank_cd(to_tsvector('english',e.dialogue),to_tsquery('english',$3)) DESC,e.source,e.id
          LIMIT 5`, [[KAGGLE_SOURCE, 'BothBosu/scam-dialogue'], version === 'real' ? 0 : 1, source.keywords.split(' ').join(' | '), topic]);
        if (result.rows.length !== 5) throw new Error('The supported prompt pools need at least five examples for this Version.');
        return result.rows as ScenarioExample[];
      } finally { await client.end(); }
    },
  };
}
