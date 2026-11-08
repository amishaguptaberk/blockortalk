export const THEMES = ['finance', 'seasonal_packages'] as const;
export type Theme = typeof THEMES[number];
export type Label = 'scam' | 'legit';
export type Example = { id: string; dialogue: string; label: number; source: string };
export type Dataset = { pool_id: string; source: string; embedding_model: string | null; retrieval_method: 'vector' | 'lexical'; prompt_count: number; held_out_count: number };
export type Practice = {
  id: string;
  theme: Theme;
  label: Label;
  dataset: Dataset;
  examples: Omit<Example, 'dialogue'>[];
  questions: string[];
  explanation: string;
  turns: { role: 'assistant' | 'user'; text: string }[];
  phase: 'call' | 'verdict' | 'complete';
  startedAt: string;
  replies: number;
  leaked: string[];
  verdict?: Label | 'unverified';
};
export type PracticeView = Pick<Practice, 'id' | 'theme' | 'turns' | 'phase' | 'replies' | 'startedAt'> & {
  dataset: Pick<Dataset, 'source' | 'prompt_count' | 'held_out_count'>;
  result?: Pick<Practice, 'label' | 'verdict' | 'explanation' | 'leaked' | 'examples'> & { correct: boolean | null };
};
export type Action = { type: 'reply'; text: string } | { type: 'end' } | { type: 'verdict'; verdict: Label | 'unverified' };
