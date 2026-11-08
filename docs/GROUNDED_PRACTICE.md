# Dataset-based practice

The source is the [Kaggle Scam and Non-Scam Call Conversation Dataset](https://www.kaggle.com/datasets/teeconnie/scam-and-non-scam-call-conversation-dataset) requested for this work. `English_Scam.txt` supplies label 1; `English_NonScam.txt` supplies label 0. Source labels are kept, not inferred by Nemotron. The source lists CC BY-NC-ND 4.0 and academic, research and educational use terms; retain its attribution and check those terms before distributing the data or using it beyond that scope. No dataset text is committed to Git.

## Split and import

The archive contains 400 scam and 400 non-scam entries. Six duplicate scam entries are removed. Each class is sorted by a seeded content hash; approximately 20% is held out. The seed is `tell-kaggle-80-20-v1`.

| Group | Non-scam | Scam | Total |
| --- | ---: | ---: | ---: |
| Prompt examples | 320 | 315 | 635 |
| Held-out evaluation | 80 | 79 | 159 |

Content hashes are unique across both groups. A conversation with conflicting labels fails the import. The pool ID fingerprints the source, seed and split membership. Repeated imports verify the same rows. The older Hugging Face detector data remains separate; generated practice explicitly selects the Kaggle source and cannot silently choose the older dataset.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run practice:index
```

The command downloads the archive to ignored `data/cache/`, applies the additive migrations with `DATABASE_URL_DIRECT`, imports the rows and publishes the manifest after checking every row. It chooses `.venv/bin/python`; set `PYTHON` for another interpreter. It does not require NVIDIA or change model weights.

`practice_examples` stores dialogue, source label, split and content hash. BothBosu rows also store the training file's `type` as `topic` (ssn, refund, support, reward, delivery, insurance, telemarketing, wrong). That type is read from the training file only. `practice_datasets` records the source and counts. Native Postgres full-text retrieval ranks prompt examples, with a matching training topic first when a Category asks for one. Held-out, real-call and hard-negative dialogues are never stored as topics or used as scenario material. This Kaggle path does not require additional embeddings or add evaluation rows to the existing Hugging Face pgvector index.

## Existing ElevenLabs agents

Every registered agent can be provisioned with a `get_training_examples` server tool: Yui (`recruiter`), Ren (`onboarding`), Kai (`fraud_team`) and Aki (`bank_callback`).

The tool calls `/api/voice/examples/<callerId>` on the Cloudflare Worker. It requires the same `X-Tell-Tool-Secret` authentication as the existing beat tool. The browser cannot read source labels through this route. Caller-to-label mapping stays on the server. Every query selects only five Kaggle prompt examples. Held-out rows are excluded by SQL.

The agent calls the tool silently before its first script question. Examples are untrusted references for conversational patterns. The caller keeps its assigned identity, fictional facts, script beats and safety rules; it must not announce labels or repeat source examples. Thus the fixed Challenge day stays comparable while its agents have access to the source patterns.

To activate the connection after deploying the Worker route:

1. Configure `TELL_TOOL_SECRET` as a Worker secret.
2. Put the same value in an ElevenLabs workspace secret and set its ID as `TELL_TOOL_SECRET_ID` locally.
3. Set `TELL_PUBLIC_URL` to the production HTTPS origin and supply a usable `ELEVENLABS_API_KEY`.
4. Run `npm run voice:connect-data`.

The command checks the pool for all callers before updating any agent. It attaches the tool to every registered caller. These are hosted-agent configuration changes: a Git merge alone does not apply them. Missing configuration stops the command. Existing `voice:provision` without the dataset flag retains its prior behavior.

## Generated scenarios

Open `/practice`. `/api/practice/generated` selects five eligible examples for finance or seasonal packages and asks Nemotron to create a four-turn script. A scam plan ends with an explicit approved request for the fictional code. The planner sees the same fictional card as the player. Only the current transcript and source counts reach the browser before the verdict.

ElevenLabs TTS speaks the lines; STT transcribes recorded replies. This separate path uses recorded turns, not a live ElevenLabs Agents conversation. Replies advance a generated script. After the verdict, the planned label, explanation and source IDs appear. Original source labels are ground truth for those original examples; the new scenario has a planned label, not a measured held-out prediction.

A call ends after four replies, three minutes, End call or `stop drill`. Audio replies stop after 20 seconds. Tell stores redacted text and session state, not audio; ElevenLabs retention still applies. Speech errors leave text mode available. No real phone call is placed.

## Held-out evaluation

`npm run practice:evaluate` reads only the 159 held-out rows as targets. For each target it retrieves five prompt examples, without filtering them by the target's answer, and compares Nemotron's prediction with the original label. The target label is never sent to the classifier. `npm run practice:evaluate -- --limit 5` is a partial smoke sample; the report marks it incomplete. The older `detection.evaluate` remains the separate Hugging Face comparison.

No full Kaggle accuracy is claimed until that live command completes. Vendor errors stop evaluation rather than fabricate a complete result. Importing examples into a prompt pool does not train Nemotron weights.

## Cloudflare and verification limits

The routes run in the existing `tell-health` Worker. Generated calls require `DATABASE_URL`, `NVIDIA_API_KEY` and `ELEVENLABS_API_KEY`; the agent retrieval tool also requires `TELL_TOOL_SECRET`. Cloudflare previews have no secrets under the repository policy. A passing preview confirms the build, not live database or voice behavior.

During this work, the local ElevenLabs value was rejected as an API key ID. Hosted agents cannot be updated or verified with that value. A usable API secret and the tool settings above remain necessary for activation. Do not claim hosted-agent access is live until provisioning and an authenticated tool call have been observed.
