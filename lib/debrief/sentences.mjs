// One plain-language sentence per decision, used on the fixed path and whenever the agent
// leaves a decision without a sentence. Second person, kind, never shaming (SPEC story 29).

import { secretLabel, VERIFY_LABELS } from '../policy/rules.mjs';

const list = (keys) => {
  const labels = keys.map(secretLabel);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0];
};

export function templateSentence(decision, persona) {
  const name = persona.persona_name;
  const legit = persona.call_type === 'legit';
  switch (decision.kind) {
    case 'leak': {
      const what = list(decision.secrets);
      if (decision.cost.money) {
        const task = decision.cost.task === 'failed' ? ' and the task' : '';
        return `Reading your ${what} to ${name} cost you $${decision.cost.money}${task}; no real company asks for that on a call.`;
      }
      return `You gave ${name} your ${what}; identity details are worth protecting even when nothing is charged yet.`;
    }
    case 'protect':
      return `You refused to hand anything over when ${name} asked, which is exactly the move.`;
    case 'disconnect':
      return decision.cost.task === 'open'
        ? `Hanging up was a fair instinct, but ${name} was real; checking the portal afterwards would have saved your task.`
        : `You hung up instead of arguing, which ends the pressure on your terms.`;
    case 'verify':
      return `You ${VERIFY_LABELS[decision.event] ?? 'checked'}, a source you already trust, and that settled it.`;
    case 'verdict': {
      if (!decision.cost.misjudged && !decision.cost.task) {
        return decision.verdict === 'unverified'
          ? `Calling it Unverified and checking for yourself was the safe call.`
          : `You read ${name} correctly as ${decision.verdict}.`;
      }
      if (legit) return `${name} was a real caller; when unsure, say Unverified and check, rather than writing it off.`;
      return `${name} wasn't who they claimed to be, even though the call sounded right.`;
    }
    default:
      return `Turn ${decision.turn}: ${decision.kind}.`;
  }
}
