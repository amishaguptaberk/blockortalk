import { createCallFinisher, type CallToFinish, type CallResult, type FinishStore } from '../../blokbuks/finish';
import { createScorekeeperModel } from '../../blokbuks/scorekeeper';
import type { FinishCall } from './service';
import type { CallRecord, Transaction } from './store';

class SeasonClosed extends Error {}

/** A persistence adapter on the engine's locked transaction; never opens or commits a client. */
function transactionFinishStore(tx: Transaction, record: CallRecord): FinishStore {
  async function seasonOpen(id: string) {
    return Boolean((await tx.query('SELECT 1 FROM seasons WHERE id=$1 AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp()', [id])).rowCount);
  }
  return {
    async finished(id) {
      if (id !== record.id) throw new Error('Unexpected call');
      // The engine owns the row lock and keeps the exact committed result in state.
      return record.result ? record.result as unknown as CallResult : null;
    },
    seasonOpen,
    async finish(call, result) {
      // Labeling may have crossed the deadline: repeat through the shared finisher
      // as practice before any write, rather than duplicating its scoring rules.
      if (call.scored && (!call.seasonId || !await seasonOpen(call.seasonId))) throw new SeasonClosed();
      const updated = await tx.query(`UPDATE calls SET verdict=$2,moments=$3,"right"=$4,wrong=$5,
        blokbuks_delta=$6,scored_by=$7,outcome=$8,scored=$9
        WHERE id=$1 AND player_id=$10 AND blokbuks_delta IS NULL`,
      [call.id, call.verdict, JSON.stringify(result.moments), result.right, result.wrong, result.delta, result.scoredBy, result.outcome, call.scored, call.playerId]);
      if (!updated.rowCount) throw new Error('The call result is unavailable');
      let total: number | null = null;
      if (call.scored && call.seasonId) {
        // SQL persistence mirrors the shared finish store; all judgment comes
        // from createCallFinisher. Migration 011 guards statement and commit time.
        const score = await tx.query<{ blokbuks: number }>(`INSERT INTO season_scores(season_id,player_id,blokbuks,"right",wrong,reached_at)
          VALUES($1,$2,GREATEST(0,$3::int),$4,$5,clock_timestamp())
          ON CONFLICT(season_id,player_id) DO UPDATE SET
            blokbuks=GREATEST(0,season_scores.blokbuks+$3::int),
            "right"=season_scores."right"+$4,wrong=season_scores.wrong+$5,
            reached_at=CASE WHEN GREATEST(0,season_scores.blokbuks+$3::int)<>season_scores.blokbuks
              THEN clock_timestamp() ELSE season_scores.reached_at END
          RETURNING blokbuks`, [call.seasonId, call.playerId, result.delta, result.right, result.wrong]);
        total = score.rows[0]!.blokbuks;
      }
      record.scored = call.scored;
      if (!call.scored && !await seasonOpen(record.seasonId)) record.callsLeft = 0;
      return { callId: call.id, ...result, total };
    },
  };
}

export function createTransactionalFinalizer(env = process.env): FinishCall {
  const model = createScorekeeperModel(env);
  return async (tx, record) => {
    if (!record.verdict) throw new Error('A Verdict is required');
    const call: CallToFinish = {
      id: record.id, playerId: record.playerId, seasonId: record.seasonId, scenarioId: record.scenario.id,
      version: record.version, scored: record.scored, verdict: record.verdict,
      verifiedViaOwnApp: record.verifyEvents.length > 0, secrets: record.scenario.secrets,
      replies: record.replies.map(reply => {
        if (![1, 2, 3, 4].includes(reply.step)) throw new Error('Invalid reply step');
        const step = reply.step as 1 | 2 | 3 | 4;
        return { step, text: reply.text, callerLine: record.lines[step - 1]! };
      }),
    };
    const finish = createCallFinisher({ model, store: transactionFinishStore(tx, record) });
    let result: CallResult;
    try { result = await finish(call); }
    catch (error) {
      if (!(error instanceof SeasonClosed)) throw error;
      result = await finish({ ...call, scored: false });
    }
    return { ...result };
  };
}
