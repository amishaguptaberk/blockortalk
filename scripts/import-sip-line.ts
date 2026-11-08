/**
 * Ticket #2: imports the Photon Spectrum Voice line into ElevenLabs as a SIP-trunk
 * number (docs/SPEC.md, "Telephony configuration"): TLS to Photon's SIP server on
 * port 5061, digest auth, media encryption disabled, outbound only.
 *
 *   node --env-file=.env.local --import tsx scripts/import-sip-line.ts
 *
 * Reads from the environment (never pass these on the command line, never commit them):
 *   PHOTON_SIP_ADDRESS    Photon's SIP server host, e.g. sip.example.net (port 5061 is added)
 *   PHOTON_SIP_USERNAME   digest-auth username (the Photon project ID)
 *   PHOTON_SIP_PASSWORD   digest-auth password (the Photon project secret)
 *   PHOTON_LINE_NUMBER    the Photon line in E.164, e.g. +14155550123
 *
 * Prints the ElevenLabs phone-number ID to put in ELEVENLABS_PHONE_NUMBER_ID.
 */
import { elevenLabs } from "../lib/voice/client";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function main() {
  const host = required("PHOTON_SIP_ADDRESS").replace(/^sips?:/, "");
  const phoneNumber = required("PHOTON_LINE_NUMBER");
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) throw new Error("PHOTON_LINE_NUMBER must be E.164");

  const client = elevenLabs();
  const existing = await client.conversationalAi.phoneNumbers.list();
  const already = existing.find((p) => p.phoneNumber === phoneNumber);
  if (already) {
    console.log(`Already imported: ELEVENLABS_PHONE_NUMBER_ID=${already.phoneNumberId}`);
    return;
  }

  const res = await client.conversationalAi.phoneNumbers.create({
    provider: "sip_trunk",
    phoneNumber,
    label: "Tell · Photon Spectrum Voice",
    supportsInbound: false,
    supportsOutbound: true,
    outboundTrunkConfig: {
      address: host.includes(":") ? host : `${host}:5061`,
      transport: "tls",
      mediaEncryption: "disabled",
      credentials: {
        username: required("PHOTON_SIP_USERNAME"),
        password: required("PHOTON_SIP_PASSWORD"),
      },
    },
  });
  console.log(`Imported: ELEVENLABS_PHONE_NUMBER_ID=${res.phoneNumberId}`);
}

main().catch((err) => {
  // Print only the API's error body; never the request, which carries the SIP password.
  console.error(err?.body ?? String(err?.message ?? err));
  process.exit(1);
});
