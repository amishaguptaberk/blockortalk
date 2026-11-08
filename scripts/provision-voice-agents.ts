/**
 * Creates or updates the four Challenge agents in ElevenLabs and records their
 * IDs (not secrets) in config/voice-agents.json. Safe to re-run: an agent is
 * found again by its stored ID, else by its exact name, and updated in place.
 *
 *   npm run voice:provision
 *
 * Optional env:
 *   TELL_PUBLIC_URL        public https origin; attaches the report_beat tool
 *   TELL_TOOL_SECRET_ID    ElevenLabs workspace-secret ID holding the beat-tool secret
 *   TELL_VOICE_LLM         override the live-call model
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { buildAgentConfig, type AgentConfigOptions } from "../lib/voice/agentConfig";
import type { AgentIds } from "../lib/voice/adapter";
import { createPracticeCorpus } from "../lib/practice/corpus.ts";
import { elevenLabs } from "../lib/voice/client";
import { CHALLENGE_CALLER_IDS, PERSONAS } from "../lib/voice/personas";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../config/voice-agents.json");

function loadIds(): Partial<AgentIds> {
  return existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
}

async function main() {
  const client = elevenLabs();
  const { TELL_PUBLIC_URL, TELL_TOOL_SECRET_ID, TELL_VOICE_LLM } = process.env;

  const opts: AgentConfigOptions = {};
  const withDataset = process.argv.includes('--with-dataset');
  if (withDataset) {
    if (!TELL_PUBLIC_URL || !TELL_TOOL_SECRET_ID || !process.env.TELL_TOOL_SECRET || !process.env.DATABASE_URL) {
      throw new Error('Dataset connection requires TELL_PUBLIC_URL, TELL_TOOL_SECRET_ID, TELL_TOOL_SECRET and DATABASE_URL');
    }
    const corpus = createPracticeCorpus(process.env.DATABASE_URL);
    // Check every caller before updating any hosted agent.
    for (const id of CHALLENGE_CALLER_IDS) await corpus.forCaller(id);
    opts.datasetTool = { publicUrl: TELL_PUBLIC_URL, toolSecretId: TELL_TOOL_SECRET_ID };
  }
  if (TELL_VOICE_LLM) opts.llm = TELL_VOICE_LLM as ElevenLabs.Llm;
  if (TELL_PUBLIC_URL && TELL_TOOL_SECRET_ID) {
    opts.beatTool = { publicUrl: TELL_PUBLIC_URL, toolSecretId: TELL_TOOL_SECRET_ID };
  } else {
    console.warn("No TELL_PUBLIC_URL + TELL_TOOL_SECRET_ID: agents get no live report_beat tool yet.");
  }

  const ids = loadIds();
  for (const id of CHALLENGE_CALLER_IDS) {
    const body = buildAgentConfig(id, opts);
    let agentId = ids[id];
    if (!agentId) {
      const found = await client.conversationalAi.agents.list({ search: PERSONAS[id].agentName });
      agentId = found.agents.find((a) => a.name === PERSONAS[id].agentName)?.agentId;
    }
    if (agentId) {
      await client.conversationalAi.agents.update(agentId, body);
      console.log(`updated ${id.padEnd(14)} ${agentId}  ${PERSONAS[id].agentName}`);
    } else {
      agentId = (await client.conversationalAi.agents.create(body)).agentId;
      console.log(`created ${id.padEnd(14)} ${agentId}  ${PERSONAS[id].agentName}`);
    }
    ids[id] = agentId;
    // Written after every agent so a failure part-way never orphans a created agent.
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(ids, null, 2)}\n`);
  }
  console.log(`agent IDs → ${OUT}`);
}

main().catch((err) => {
  console.error(err?.body ?? err);
  process.exit(1);
});
