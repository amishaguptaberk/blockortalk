/**
 * Ticket #2 telephony spike: rings ONE team member's phone with one Challenge agent.
 * It refuses any number that isn't listed in TELL_TEAM_PHONES, and it only dials
 * when --yes is passed, so it can't place a call by accident.
 *
 *   node --env-file=.env.local --import tsx scripts/spike-call.ts \
 *     --to +14155550123 --caller fraud_team --name Sam --yes
 *
 * Env: ELEVENLABS_API_KEY, ELEVENLABS_PHONE_NUMBER_ID (from import-sip-line.ts),
 *      TELL_TEAM_PHONES (comma-separated E.164 numbers of team members who agreed to test calls).
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ElevenLabsVoiceAdapter, type AgentIds } from "../lib/voice/adapter";
import { elevenLabs } from "../lib/voice/client";
import { CHALLENGE_CALLER_IDS, PERSONAS, type ChallengeCallerId } from "../lib/voice/personas";

const { values } = parseArgs({
  options: {
    to: { type: "string" },
    caller: { type: "string", default: "fraud_team" },
    name: { type: "string" },
    yes: { type: "boolean", default: false },
  },
});

async function main() {
  const to = values.to ?? "";
  const team = (process.env.TELL_TEAM_PHONES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!team.includes(to)) {
    throw new Error("--to must be one of TELL_TEAM_PHONES (team phones only, per ticket #2)");
  }
  const caller = values.caller as ChallengeCallerId;
  if (!CHALLENGE_CALLER_IDS.includes(caller)) {
    throw new Error(`--caller must be one of: ${CHALLENGE_CALLER_IDS.join(", ")}`);
  }

  const variables = { ...PERSONAS[caller].variables };
  if (values.name) variables.player_name = values.name;

  console.log(`Will call ${to} as ${PERSONAS[caller].displayName} (${PERSONAS[caller].claimedOrg}).`);
  if (!values.yes) {
    console.log("Dry run. Re-run with --yes to place the call.");
    return;
  }

  const agentIds = JSON.parse(readFileSync("config/voice-agents.json", "utf8")) as AgentIds;
  const voice = new ElevenLabsVoiceAdapter(elevenLabs(), agentIds, process.env.ELEVENLABS_PHONE_NUMBER_ID);
  const started = performance.now();
  // A listed team phone counts as verified for the spike; the app uses SMS verification (#11).
  const { conversationId } = await voice.placeCall({ callerId: caller, toNumber: to, phoneVerified: true, variables });
  console.log(`API accepted the call in ${Math.round(performance.now() - started)} ms: ${conversationId}`);
  console.log("Note by hand how long until the phone rings, and record it on issue #2.");
}

main().catch((err) => {
  console.error(err?.body ?? String(err?.message ?? err));
  process.exit(1);
});
