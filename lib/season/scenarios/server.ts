import pg from 'pg';
import { scenarioCatalog } from './catalog.ts';
import type { Scenario } from './types.ts';

const tactics: Record<string, Scenario['tactic']> = {
  bank: 'Details as proof', delivery: 'Urgency', holiday: 'Reward', business: 'Authority', phishing: 'Urgency',
  support: 'Fear', government: 'Authority', prize: 'Reward', investment: 'Reward', carrier: 'Details as proof',
  refund: 'Reward', insurance: 'Fear', sales: 'Reward', 'wrong-number': 'Details as proof',
};
export const scenarios: Scenario[] = scenarioCatalog.map((publicRow) => {
  const tactic = tactics[publicRow.id];
  if (!tactic) throw new Error(`Missing tactic for ${publicRow.id}`);
  const next_step = `End this call and check the notice through your own ${publicRow.org} app using its saved contact.`;
  const ask_line = 'Please read me your fictional Practice protection code to complete this request.';
  const detail = publicRow.card.facts[0]!;
  return { ...publicRow, tactic, versions: {
    real: { steps: [`Introduce ${publicRow.org} and explain the practice notice.`, detail, 'Explain why the notice matters without asking for a secret.', next_step], next_step },
    scam: { steps: [`Claim to represent ${publicRow.org} about the practice notice.`, detail, publicRow.id === 'phishing' ? 'Send the caller link to the look-alike sheet and urge immediate renewal.' : `Apply ${tactic} to push for immediate cooperation.`, ask_line], ask_line,
      ...(publicRow.id === 'phishing' ? { link: { href: 'https://cloudpetal-check.invalid/renew', sheet: { title: 'Cloudpetal renewal check', facts: ['Caller-sent page requesting your practice protection code.'] } } } : {}),
    },
  } };
});

export function createScenarioStore(connectionString: string) {
  async function query<T>(work: (client: pg.Client) => Promise<T>) {
    if (!connectionString) throw new Error('The scenario database is not configured.');
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await work(client); } finally { await client.end(); }
  }
  return {
    async get(id: string): Promise<Scenario | null> {
      return query(async client => (await client.query('SELECT id,category,tactic,org,card,secrets,versions FROM call_scenarios WHERE id=$1', [id])).rows[0] ?? null);
    },
    async catalog() {
      return query(async client => (await client.query('SELECT id,category,org,card,secrets FROM call_scenarios ORDER BY id')).rows);
    },
    async seed() {
      return query(async client => {
        await client.query('BEGIN');
        try {
          for (const row of scenarios) await client.query(`INSERT INTO call_scenarios(id,category,tactic,org,card,secrets,versions) VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(id) DO UPDATE SET category=excluded.category,tactic=excluded.tactic,org=excluded.org,card=excluded.card,secrets=excluded.secrets,versions=excluded.versions`,
          [row.id, row.category, row.tactic, row.org, JSON.stringify(row.card), JSON.stringify(row.secrets), JSON.stringify(row.versions)]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
      });
    },
  };
}
