# Issue #7 evaluation status

Measured November 7, 2026 (America/Chicago).

**The full three-way evaluation is incomplete.** NVIDIA repeatedly returned HTTP
429, including with one worker and 30-second rate-limit backoff. The interrupted
run was stopped with its completed-item checkpoint preserved. No aggregate
Nemotron accuracy, F1, real-call detection rate, false-alarm rate or median latency
is claimed from that partial run. Implementation PR #31 was merged by a teammate while final validation was being
recorded. Issue #7 remains open for the full comparison.

All 1,278 checked training dialogues were embedded in pgvector using
`nvidia/nemotron-3.5-embed-1b` at 1,024 dimensions. The detector uses
`nvidia/nemotron-3.5-super-vl-120b-a12b`. Real-call scoring comprises 20 public
YouTube transcripts and 839 FTC robocall transcripts. Hard negatives comprise
34 team-written alerts and ten talkmap support calls.

## Complete baseline result

This is the confidence-gated `detect` operating point required by #7. It differs
from #3's ungated binary `predict` result. Abstentions remain in denominators;
a zero false-alarm rate does not mean all legitimate calls were classified.

```text
detector: tfidf-logistic-regression
train: 1278
synthetic_test: 320
real_calls: 859
hard_negatives: 44
median_detection_seconds: 0.0007

Synthetic test
accuracy: 1.0000
precision: 1.0000
recall: 1.0000
f1: 1.0000
confusion_matrix: [[160, 0], [0, 160]]

Real calls
detection_rate: 0.0489
n: 859

Hard negatives
false_alarm_rate: 0.0000
n: 44

synthetic_test_abstentions: 0/320
real_calls_abstentions: 320/859
hard_negatives_abstentions: 16/44
```

## Live production-retrieval hand checks

| Input | Result | Confidence | Evidence |
| --- | --- | --- | --- |
| obvious_scam | scam | 0.95 | authority, urgency, fear |
| urgent_legit_hard_negative | legit | 0.90 | no scam flags |
| ambiguous | uncertain | 0.50 | exact verify-by-callback message |

Every returned span exactly matches its input substring. The legitimate case is
an item from the hard-negative scoring pool. These three hand checks do not
replace the full held-out comparison.

## Automated validation

- Typecheck passed.
- Node tests: 67 passed, no skips.
- Voice tests: 80 passed.
- Python tests: 18 passed, including real-pgvector retrieval in a temporary schema.
- GitHub CI, dedicated Detection CI, and Workers preview passed for the reviewed code.
- Standards and Spec reviews have no unresolved code findings.

## Remaining acceptance step

Resume the full run after endpoint capacity permits:

```text
python -m detection.evaluate --workers 1 --output data/cache/issue-7-comparison.json
```

The neighboring JSONL checkpoint is ignored locally. Same-code/model/corpus
results resume automatically; changing code or data invalidates stale entries.
Set server environment variables as described in [the detection guide](DETECTION.md).
Post all three complete reports and median times on #7 before marking it done.
Public YouTube transcripts may have appeared in Nemotron pretraining. The
synthetic split is template-heavy; its perfect baseline F1 is not evidence of
real-world accuracy.
