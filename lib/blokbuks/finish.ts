// Finishing a call (BS-07): label → score → store, once. This is the finish-call adapter the
// call engine (BS-06) hands every call to after its Verdict.
import pg from "pg";
import { outcomeOf, type Outcome } from "../season/analysis.ts";
import { scoreCall, type MomentResult, type ScoredBy, type Verdict, type Version } from "./rules.ts";
import { labelReplies, type ReplyToLabel, type ScorekeeperModel } from "./scorekeeper.ts";

export interface CallToFinish {
  id: string;
  playerId: string;
  /** Null when the call belongs to no Season; it then earns nothing. */
  seasonId: string | null;
  scenarioId: string;
  version: Version;
  /** What the call engine decided at start (five-a-day cap). */
  scored: boolean;
  verdict: Verdict;
  verifiedViaOwnApp: boolean;
  replies: readonly ReplyToLabel[];
  secrets: readonly { label: string; value: string }[];
}

export type StoredMoment = MomentResult & { quote?: string; by?: ScoredBy };

export interface CallResult {
  callId: string;
  moments: StoredMoment[];
  right: number;
  wrong: number;
  delta: number;
  scoredBy: ScoredBy;
  outcome: Outcome;
  /** The Player's Season Blokbuks after this call, or null for a practice call. */
  total: number | null;
}

export type FinishWrite = Pick<CallToFinish, "id" | "playerId" | "seasonId" | "scored" | "verdict">;

export interface FinishStore {
  /** The stored result if this call was already finished. */
  finished(callId: string): Promise<CallResult | null>;
  seasonOpen(seasonId: string, now: Date): Promise<boolean>;
  /** Write the result and the Season score in one transaction. A finished call is returned unchanged. */
  finish(call: FinishWrite, result: Omit<CallResult, "callId" | "total">): Promise<CallResult>;
}

export interface FinisherDeps {
  model: ScorekeeperModel | null;
  store: FinishStore;
  now?: () => Date;
  /** Runs after the write, e.g. to refresh the Player analysis (BS-08). Failures never fail the call. */
  onFinished?: (event: { callId: string; playerId: string }) => Promise<void>;
}

export function createCallFinisher({ model, store, now = () => new Date(), onFinished }: FinisherDeps) {
  return async function finishCall(call: CallToFinish): Promise<CallResult> {
    const done = await store.finished(call.id);
    if (done) return done;

    // Scoring stops when the Season ends, even for a call that started before.
    const scored = call.scored && call.seasonId !== null && await store.seasonOpen(call.seasonId, now());
    const { labels, scoredBy } = await labelReplies(model, call.replies, call.secrets);
    const score = scoreCall({
      version: call.version,
      scored,
      replies: labels.map(label => ({ step: label.step, move: label.move })),
      verdict: call.verdict,
      verifiedViaOwnApp: call.verifiedViaOwnApp,
      scoredBy,
    });
    // scoreCall keeps reply moments in reply order, so they line up with the same labels.
    const kept = labels.filter(label => label.step >= 2 || label.move === "Leak");
    const moments: StoredMoment[] = score.moments.map(moment => {
      if (moment.kind !== "reply") return moment;
      const label = kept[moment.n - 1]!;
      return { ...moment, quote: label.quote, by: label.by };
    });

    const saved = await store.finish(
      { id: call.id, playerId: call.playerId, seasonId: call.seasonId, scored, verdict: call.verdict },
      {
        moments,
        right: score.right,
        wrong: score.wrong,
        delta: score.delta,
        scoredBy: score.scoredBy,
        outcome: outcomeOf(call.version, call.verdict, labels.some(label => label.move === "Leak")),
      },
    );
    try {
      await onFinished?.({ callId: call.id, playerId: call.playerId });
    } catch (error) {
      console.error("after-call hook failed", call.id, error);
    }
    return saved;
  };
}

type Row = {
  id: string; moments: StoredMoment[]; right: number; wrong: number; blokbuks_delta: number;
  scored_by: ScoredBy; outcome: Outcome; scored: boolean; season_id: string | null; total: number | null;
};

function fromRow(row: Row): CallResult {
  return {
    callId: row.id,
    moments: row.moments,
    right: row.right,
    wrong: row.wrong,
    delta: row.blokbuks_delta,
    scoredBy: row.scored_by,
    outcome: row.outcome,
    total: row.scored && row.season_id ? row.total ?? 0 : null,
  };
}

/** Postgres store over migration 009's `calls`, `seasons` and `season_scores`. */
export function createFinishStore(connectionString: string): FinishStore {
  async function withClient<T>(work: (client: pg.Client) => Promise<T>) {
    if (!connectionString) throw new Error("The database is not configured.");
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await work(client); } finally { await client.end(); }
  }
  const read = (client: pg.Client, id: string) => client.query<Row>(
    `SELECT c.id, c.moments, c."right", c.wrong, c.blokbuks_delta, c.scored_by, c.outcome, c.scored, c.season_id, s.blokbuks AS total
       FROM calls c LEFT JOIN season_scores s ON s.season_id = c.season_id AND s.player_id = c.player_id
      WHERE c.id = $1 AND c.blokbuks_delta IS NOT NULL`, [id]);

  return {
    finished: id => withClient(async client => {
      const row = (await read(client, id)).rows[0];
      return row ? fromRow(row) : null;
    }),
    seasonOpen: (seasonId, now) => withClient(async client =>
      ((await client.query("SELECT 1 FROM seasons WHERE id = $1 AND starts_at <= $2 AND ends_at > $2", [seasonId, now])).rowCount ?? 0) > 0),
    finish: (call, result) => withClient(async client => {
      await client.query("BEGIN");
      try {
        // The IS NULL guard makes a second or concurrent finish a no-op.
        const updated = await client.query(
          `UPDATE calls SET verdict = $2, moments = $3, "right" = $4, wrong = $5, blokbuks_delta = $6, scored_by = $7,
                  outcome = $8, scored = $9, ended_at = now()
            WHERE id = $1 AND blokbuks_delta IS NULL`,
          [call.id, call.verdict, JSON.stringify(result.moments), result.right, result.wrong, result.delta, result.scoredBy, result.outcome, call.scored]);
        if (!updated.rowCount) {
          await client.query("ROLLBACK");
          const row = (await read(client, call.id)).rows[0];
          if (!row) throw new Error(`Unknown call ${call.id}.`);
          return fromRow(row);
        }
        let total: number | null = null;
        if (call.scored && call.seasonId) {
          // Same floor as applyChange: totals never drop below 0. reached_at moves only when the total does.
          const score = await client.query<{ blokbuks: number }>(
            `INSERT INTO season_scores (season_id, player_id, blokbuks, "right", wrong, reached_at)
             VALUES ($1, $2, GREATEST(0, $3::int), $4, $5, now())
             ON CONFLICT (season_id, player_id) DO UPDATE SET
               blokbuks = GREATEST(0, season_scores.blokbuks + $3::int),
               "right" = season_scores."right" + $4,
               wrong = season_scores.wrong + $5,
               reached_at = CASE WHEN GREATEST(0, season_scores.blokbuks + $3::int) <> season_scores.blokbuks
                                 THEN now() ELSE season_scores.reached_at END
             RETURNING blokbuks`,
            [call.seasonId, call.playerId, result.delta, result.right, result.wrong]);
          total = score.rows[0]!.blokbuks;
        }
        await client.query("COMMIT");
        return { callId: call.id, ...result, total };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }),
  };
}
