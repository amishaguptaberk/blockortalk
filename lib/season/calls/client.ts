import type { PublicCall, CallAction } from './types';
export type { PublicCall, CallAction, Verdict } from './types';

export function createCallClient(fetchImpl: typeof fetch = fetch) {
  const base = '/api/play/calls';
  async function checked(response: Response) {
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || 'The call is unavailable. Please try again.');
    }
    return response;
  }
  async function post(id: string | null, action: unknown): Promise<PublicCall> {
    const response = await checked(await fetchImpl(id ? `${base}/${encodeURIComponent(id)}` : base, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action),
    }));
    return (await response.json() as { call: PublicCall }).call;
  }
  return {
    start: (scenarioId: string) => post(null, { type: 'start', scenarioId }),
    act: (id: string, action: CallAction) => post(id, action),
    async get(id: string) {
      const response = await checked(await fetchImpl(`${base}/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' }));
      return (await response.json() as { call: PublicCall }).call;
    },
    async speak(id: string) {
      return (await checked(await fetchImpl(`${base}/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'speech' }) }))).blob();
    },
    async transcribe(id: string, audio: File) {
      const form = new FormData(); form.set('audio', audio);
      const response = await checked(await fetchImpl(`${base}/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', body: form }));
      return (await response.json() as { text: string }).text;
    },
  };
}
