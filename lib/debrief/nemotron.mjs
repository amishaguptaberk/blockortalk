// LLM adapter: Nemotron through NVIDIA's OpenAI-compatible chat API, using fetch only so it runs
// on the Workers runtime as well as Node. The API key stays on the server.

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
// Verified 2026-11-07 on the team key: both return tool calls. (nemotron-3-super-120b-a12b is listed
// but 404s for this account; llama-3.3-nemotron-super-49b-v1.5 reached end of life on 2026-08-26.)
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const DEFAULT_FALLBACK_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

export function createNemotronClient(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey) return null;
  const baseUrl = (env.NVIDIA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const models = [env.NEMOTRON_AGENT_MODEL || DEFAULT_MODEL, env.NEMOTRON_AGENT_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL];
  // Nemotron 3.x reasons before answering by default, which costs ~8x the tokens. The tools already
  // settle the facts, so reasoning is off unless NEMOTRON_AGENT_THINKING=on.
  const thinking = /^(on|true|1)$/i.test(env.NEMOTRON_AGENT_THINKING ?? '');
  let active = 0;

  async function call(model, { messages, tools, signal }) {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 1500,
        chat_template_kwargs: { enable_thinking: thinking },
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`Nemotron ${model} HTTP ${res.status}: ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error(`Nemotron ${model} returned no message`);
    return { message, model };
  }

  return {
    get model() { return models[active]; },
    async chat(req) {
      try {
        return await call(models[active], req);
      } catch (err) {
        // Model missing or unavailable: switch to the backup model once and stay on it.
        if (active === 0 && [404, 410, 422, 503].includes(err.status)) {
          active = 1;
          return call(models[active], req);
        }
        throw err;
      }
    },
  };
}
