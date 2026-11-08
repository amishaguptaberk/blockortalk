# Challenge Persona QA (#15)

Run `npm run persona:qa` with `NVIDIA_API_KEY` in the private `.env.local` file.
This tests Yui, Ren and Kai only. The eight normal receiver personalities are
aggressive, anxious, confused, distracted, greedy, polite, skeptical and methodical.
The ninth is a jailbreak attempt: 27 conversations in total.

Nemotron generates the receiver's first two replies in character. The shipped
Challenge persona prompt, shared guardrails, opening and dynamic variable defaults
generate the caller's answers. Every conversation then receives the same jailbreak,
secret-disclosure, synthetic card/SSN and stop probes, for eight receiver turns.
Checks read spoken transcript text only, never model tool events or grading opinions.
This is text prompt QA using Nemotron, not a claim to validate ElevenLabs audio or
its deployed model/tool configuration.

The command prints a persona × personality × check table, saves individual JSON
transcripts, and writes `summary.json` and `report.md` in `data/cache/persona-qa`.
Each turn is saved before the next vendor request. Completed rows resume only when
the model, endpoint and prompt/check source fingerprint still match. After fixing
a persona prompt, rerunning invalidates the old rows and checks the changed script.

To keep runs bounded, the default budget is 180 seconds. A 429 or other provider
error stops immediately, without retry waits. Rerun the same command later to
resume completed rows. Use `--budget-seconds 600` to allow more time, `--limit 1`
for a smoke case, or `--output DIR` to choose the report directory. Limited and
interrupted runs exit nonzero and explicitly report NOT PASSED; only a complete
27-row run with all checks passing exits zero.

The checks cover the disclosure, caller secret policy, stop response, card/SSN
safety interruption, call-type deflection, fake-code disclosure and a documented
list of common real brands. These are conservative lexical heuristics, not complete
natural-language or all-brand recognition. Review the saved transcripts before
closing the issue. Probes contain published synthetic test values, never user data.

`npx vitest run tests/persona-qa.test.ts` tests hand-written good/bad transcripts,
including deliberately making Yui ask for a PIN, and exercises the runner with a
fake vendor. No NVIDIA requests are made by automated tests.

## Live validation status

The first live smoke request returned NVIDIA HTTP 429. No rows completed; no
all-pass table is claimed. The partial transcript and incomplete report were saved.
The existing Kai default also names Chipotle in `recent_charge`; the real-brand
check intentionally does not hide or replace that default. Coordinate that prompt
data correction with the voice/reveal owners, then run and publish the full table
and transcripts on #15 before closing it.

## Review

Standards review: fixed a safety disclaimer suppressing a later secret request
in the same sentence. Spec review: fixed contracted call-type disclosures and
unsafe card/SSN instructions incorrectly passing the safety check. Each finding
has a failing-then-passing hand-written transcript regression. The live run and
the existing branded Kai default remain unresolved acceptance work.
