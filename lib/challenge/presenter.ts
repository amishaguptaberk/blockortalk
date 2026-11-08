import type { Challenge } from './types.ts';
import type { createRiskService } from './risk.ts';
import { json, session } from './routes.ts';
import { isStagePlan } from '../stage/plan.ts';

type Deps = {
  service: () => { get(id: string): Promise<Pick<Challenge, 'id' | 'risk'>> };
  risk: () => Pick<ReturnType<typeof createRiskService>, 'read' | 'setPlan'>;
  scheduleRisk: (id: string) => void;
};
/** The presenter capability travels only in the Authorization header: `Bearer <day id>.<token>`. */
function proofOf(request: Request) {
  const proof = request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\.([0-9a-f]{64})$/i);
  return proof ? { id: proof[1], token: proof[2] } : null;
}
export function createPresenterHandlers(deps: Deps) {
  return {
    async POST(request: Request) {
      if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Open the presenter page to connect a day.' }, 403);
      const id = session(request);
      if (!id) return json({ error: 'Start a Challenge day in this browser first.' }, 401);
      try {
        const day = await deps.service().get(id);
        if (!day.risk) return json({ error: 'This day is not ready to present.' }, 409);
        return json({ path: `/presenter#${id}.${day.risk.token}` });
      } catch { return json({ error: 'The presenter could not connect. Try again.' }, 503); }
    },
    async GET(request: Request) {
      const proof = proofOf(request);
      if (!proof) return json({ error: 'Use a presenter share link.' }, 401);
      try {
        const snapshot = await deps.risk().read(proof.id, proof.token);
        if (!snapshot) return json({ error: 'This presenter link is invalid.' }, 401);
        deps.scheduleRisk(proof.id);
        return json({ snapshot });
      } catch { return json({ error: 'The presenter could not refresh. Trying again.' }, 503); }
    },
    /** The stage fallback switch: Plan A phone, B browser voice, C text. The board follows within a second. */
    async PUT(request: Request) {
      const proof = proofOf(request);
      if (!proof) return json({ error: 'Use a presenter share link.' }, 401);
      if (Number(request.headers.get('content-length') ?? 0) > 200) return json({ error: 'Choose Plan A, B or C.' }, 400);
      const raw = await request.text();
      let body: { plan?: unknown; seq?: unknown } | undefined;
      try { body = raw.length <= 200 ? JSON.parse(raw) : undefined; } catch { body = undefined; }
      const plan = body?.plan; const seq = body?.seq;
      if (!isStagePlan(plan) || !Number.isInteger(seq) || (seq as number) < 0) return json({ error: 'Choose Plan A, B or C.' }, 400);
      try {
        const result = await deps.risk().setPlan(proof.id, proof.token, plan, seq as number);
        if (!result) return json({ error: 'This presenter link is invalid.' }, 401);
        if (!result.applied) return json({ error: 'The plan changed since this screen last updated. Check it and tap again.', stagePlan: result.stagePlan }, 409);
        return json({ stagePlan: result.stagePlan });
      } catch { return json({ error: 'The plan did not switch. Tap again.' }, 503); }
    },
  };
}
