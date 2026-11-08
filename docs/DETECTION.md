# Retrieval detector (issue #7)

The detection lane exposes `detect(text)` on `TfidfBaseline` and `NemotronDetector`.
`NemotronDetector(client)` is zero-shot; `NemotronDetector(client, pool)` uses the
five nearest labeled training dialogues from pgvector. `open_detectors(corpus)`
constructs all three with the same corpus. Call it once per server process/session,
then reuse the detectors. Vendor calls run on the server; no key goes to the browser.
This ticket does not attach the detector to the game, Debrief stub, or risk meter.

## Set up and run

Install Python 3.12 and `pip install -r requirements.txt`. Export `NVIDIA_API_KEY`,
`DATABASE_URL` (pooled runtime connection) and `DATABASE_URL_DIRECT` (index load).
The commands below assume those environment variables are set. From this repo,
Node 24 can instead pass the ignored `.env.local` values to Python without printing
them:

```powershell
node --env-file=.env.local -e "const r=require('node:child_process').spawnSync('python',['-m','detection.index'],{stdio:'inherit',env:process.env}); process.exit(r.status ?? 1)"
```

With exported variables, the equivalent commands are:

```text
python -m detection.index
python -m detection.evaluate --workers 1 --output data/cache/comparison.json
python -m detection.evaluate --detectors baseline
python -m detection.evaluate --limit 5 --output data/cache/smoke.json
python -m detection.detect < transcript.txt
```

The index command applies the additive `007_detection_examples.sql` migration
(also supported by `npm run migrate`) and embeds the full checked training split.
It resumes missing rows after interruption. It never inserts held-out transcripts.
Each successful training embedding commits immediately; a later failure cannot
discard earlier completed rows. Embedding work stops on the first terminal failure.
The migration creates a 1,024-dimension vector column and HNSW cosine index.
Retrieval uses exact cosine ordering for this small pool, avoiding approximate
index filtering that can return fewer than five examples when corpus versions coexist.
The pool ID fingerprints training membership, labels, sources, and embedding model.
Every retrieved row is checked against the current training manifest, including its text.

The default comparison uses one worker and scores all held-out items with all three detectors. `--limit`
is a reproducible smoke sample per split (seed 7), explicitly labeled as such. The
full corpus is leakage-checked before sampling. Historical issue #3 fixture commands
without `--detectors` retain their canned binary report; use `--detectors all` to
exercise the new confidence-aware comparison. Neither path trains Nemotron.
With `--output`, completed items are appended to a neighboring `.jsonl` checkpoint.
Rerun the same command to resume after a transport failure. `--checkpoint` sets a
different location. Checkpoints are keyed by code, models, training corpus and
scoring-item identity; changed code or data cannot silently reuse older predictions.
Median times include the original measured calls for resumed items.

The live detector model defaults to `nvidia/nemotron-3.5-super-vl-120b-a12b`;
`NEMOTRON_DETECTOR_MODEL` overrides it. Embeddings use
`nvidia/nemotron-3.5-embed-1b` at 1,024 dimensions with `passage` for training and
`query` for retrieval. Older E5 and Llama embedding hosted endpoints returned
HTTP 410 during verification on November 7, 2026. The 3.5 endpoint returned
HTTP 500 for multi-input requests; the adapter queues single-input requests and
preserves order.
See [NVIDIA's embedding API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-embed-1b)
and [pgvector's index documentation](https://github.com/pgvector/pgvector#hnsw).

## Request limits and recovery

`NVIDIA_DETECTOR_RPM` defaults to **30 requests per minute**, leaving headroom below
the team's displayed account ceiling of up to 40/minute. Chat calls, embedding calls,
and retries to the same endpoint share one queue across detector clients in this
Python process. Increasing `--workers` cannot bypass that queue. Only one request
is in flight at a time, and fast responses cannot trigger a burst.

Set a lower positive `NVIDIA_DETECTOR_RPM` when other team processes use the same
NVIDIA account. This queue cannot govern the Debrief agent, another machine, or
other programs; their calls may consume the same account capacity. The displayed
limit is a ceiling, not a guarantee of sustained model capacity.

HTTP 429 applies a shared cooldown. Both numeric and HTTP-date `Retry-After`
headers are honored in full, without the former 30-second cap. Missing or invalid
headers use exponential waits (30, 60, 120, 240, then 300 seconds) with added jitter.
The adapter makes at most six attempts and retains the final cooldown for other
clients in this process. Transient 5xx and transport failures also back off;
authentication and other permanent HTTP errors fail immediately. Safe stderr
messages show endpoint path, HTTP status, cooldown and attempt, never keys or bodies.

With `--output`, the report is saved atomically after each completed detector.
It contains `complete: false` until every selected detector finishes; a partial
baseline report must not be represented as a full three-way result. Item-level
JSONL checkpoints continue to preserve completed work within an interrupted detector.
Source changes invalidate old checkpoints deliberately, so transport fixes do not
silently import predictions from an older code version.

The full scoring corpus requires approximately 3,669 hosted requests before retries:
1,223 zero-shot calls plus 1,223 query embeddings and 1,223 retrieval-model calls.
At 30 total requests/minute, allow at least about two hours, plus cooldowns and
model latency. Existing indexed training embeddings are reused.

## Result and scoring

```json
{
  "label": "scam",
  "scam_type": "impersonation",
  "red_flags": [{"tactic": "urgency", "span": {"start": 0, "end": 9, "text": "right now"}}],
  "confidence": 0.9,
  "message": null
}
```

Tactics are restricted to authority, urgency, details-as-proof, reward, and fear.
Spans use Unicode code-point offsets, end exclusive, in the original transcript;
JavaScript consumers must convert to UTF-16 offsets before slicing emoji-containing
strings. Every span is anchored to an exact quote. The model never supplies offsets.
At confidence below 0.6, or with malformed/unsupported output, the detector emits
`label: null`, `scam_type: null`, no red flags and the exact message:
`Can't tell — verify by calling back on a number you already have`.
Transport failures fail the command with a nonzero exit code rather than inventing
a result. No vendor body or database exception is printed.

The baseline's confidence comes from binary logistic regression. A second logistic
classifier learns scam types (`ssn`, `refund`, `support`, `reward`) from the training
CSV's type annotations. A fixture without type annotations reports `unknown` for a
scam. Its tactic spans are explicit keyword explanations, not learned tactic predictions.
Baseline spans preserve regex match offsets. A model quote occurring multiple times
is rejected rather than guessing a speaker; the prompt requests unique surrounding words.

Reports include synthetic accuracy, precision, recall, F1 and confusion matrix;
real-call detection rate; hard-negative false-alarm rate; median detection seconds
including query embedding/retrieval; and abstention counts for every split.
Abstentions never count as correct and remain in rate denominators. When present,
the confusion matrix adds an uncertain column (rows legit/scam; columns legit/scam/uncertain).
A low false-alarm rate must be read beside coverage: abstaining on everything is
not evidence of a useful detector. Saved JSON contains source, transcript hash,
actual label, result and duration for each scored item; no keys or full input text.
Real-call data is all scams, so no real-call F1 is claimed. Public YouTube material
may have appeared in Nemotron pretraining.

## Verification

```text
python -m unittest tests.test_detection tests.test_detectors tests.test_nvidia_transport
npm run typecheck
npm test
```

Set `TEST_DATABASE_URL` to a Postgres instance with pgvector installed (for example
`pgvector/pgvector:pg17`). Retrieval tests create and remove their own schema. No
live NVIDIA calls run in automated tests; they fake only vendor boundaries. The
dedicated detection workflow runs the real pgvector test in CI.
Before closing #7, run the full comparison and check the production detector on
an obvious scam, an urgent legitimate alert, and an ambiguous one-line message.
Publish the measured report and median times on the issue, including abstentions.
