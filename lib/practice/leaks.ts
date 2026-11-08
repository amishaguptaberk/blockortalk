import { mentionsSecret } from "../policy/normalize.mjs";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "March 14, 1991" → "1991-03-14", the form the leak check matches spoken dates against. */
function isoDate(value: string): string | undefined {
  const m = value.toLowerCase().match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  const month = m ? MONTHS.indexOf(m[1]!) + 1 : 0;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : undefined;
}

/**
 * Which of these fictional secrets appear in what the player said. Same normalized
 * check as the Challenge (spoken digits, spacing and punctuation all count).
 */
export function leakedSecrets(text: string, secrets: readonly { label: string; value: string }[]): string[] {
  return secrets
    .filter(({ label, value }) => {
      const l = label.toLowerCase();
      if (l.includes("birth")) return mentionsSecret(text, "date_of_birth", isoDate(value) ?? value);
      if (l.includes("address")) return mentionsSecret(text, "home_address", value.split(",")[0]!.trim());
      return mentionsSecret(text, "secret", value);
    })
    .map(({ label }) => label);
}

/** The player reached a safe action: refused, chose to verify through a known number, or hung up. */
export function soundsSafe(text: string): boolean {
  return /\b(call (you |them |it |the bank |nimbus |corvanta |shopnest |parcelkite )?back|hang(ing)? up|i'?m hanging|number (on|in|from) (my|the) (app|card|statement|bill|website|account)|check (it )?(in|on|through) (my|the) (app|account|portal)|(don'?t|do not|won'?t|will not|never) (share|give|read|send|pay|move)|not (going to|gonna) (share|give|read|pay)|i'?ll (check|call|verify)|verify (this|it|that) myself|no thanks?)\b/i.test(text);
}
