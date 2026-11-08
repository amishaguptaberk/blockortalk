export type Version = 'real' | 'scam';
export type Sheet = { title: string; facts: string[] };
export type PublicScenario = {
  id: string; category: string; org: string;
  card: { name: string; facts: string[]; ownApp: Sheet };
  secrets: { label: string; value: string }[];
};
export type Scenario = PublicScenario & {
  tactic: 'Details as proof' | 'Urgency' | 'Reward' | 'Authority' | 'Fear';
  versions: {
    real: { steps: [string, string, string, string]; next_step: string };
    scam: { steps: [string, string, string, string]; ask_line: string; link?: { href: string; sheet: Sheet } };
  };
};
