// Browser-safe source identities. Saved sessions keep the source they actually used.
export const KAGGLE_SOURCE = 'teeconnie/scam-and-non-scam-call-conversation-dataset';
export function practiceSourceUrl(source: string): string | undefined {
  if (source === KAGGLE_SOURCE) return `https://www.kaggle.com/datasets/${KAGGLE_SOURCE}`;
  if (source === 'BothBosu/scam-dialogue') return 'https://huggingface.co/datasets/BothBosu/scam-dialogue';
}
