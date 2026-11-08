---
title: "Tell — scam-call drills that teach you to hear the tell"
labels: [ready-for-agent]
event: HackUTD 2026 "Zero Day" (24 h, due Sun Nov 8, 12:00 PM CT — confirm)
tracks: T-Mobile Safe Signal, NVIDIA "Use Nemotron Beyond a Chatbot"
---

# Tell — scam-call drills that teach you to hear the tell

## Problem Statement

Phone scams work because they happen live, under pressure, and often sound right: the caller knows your name, your bank, even your last purchase. People can recite "never share your PIN," yet still read a one-time code to a calm, convincing caller who already knows their details. Reading tips or watching a training video doesn't build that reflex. Large studies of embedded phishing training show almost no effect, mostly because people never engage with the material. People also overcorrect: someone who hangs up on everything misses real calls from their bank, carrier or delivery service. Nobody gives ordinary people a safe way to practice telling a real call from a scam, on their own phone, before the real thing happens.

## Solution

Tell is a web app that runs practice phone calls. The user picks themes (banking, shopping/delivery, phone provider) and a difficulty. Each drill starts with a scenario card: a recent event ("Yesterday you spent $23.40 at Chipotle") and fake secrets to protect (a date of birth, a home address, a card ending, a PIN, sometimes a one-time code that appears mid-call). Then the user's real phone rings. The AI caller is a scammer, a legitimate caller, or a "hijacked" caller who knows the real details but asks for a secret anyway. After hang-up the user answers "Could you tell?" (real or scam, plus confidence) and gets an after-call report. The report grades them against four portable rules, not against the specific scam:

1. Never share codes, PINs, passwords, SSN or identity details like your date of birth — whoever is calling.
2. Pressure is the tell — urgency, secrecy, or an odd payment method.
3. Knowing your details doesn't prove who's calling.
4. The move: hang up and call back on a number you already have.

A Nemotron Drill Planner agent chooses each drill, targeting the rule the user breaks most, and builds the persona. A Nemotron Debrief agent scores the call. A Today screen turns current FTC scam alerts into one-tap practice drills. A detector (TF-IDF baseline vs Nemotron) labels scam type and red flags, both in debriefs and in a paste-a-message Guardian screen. Tell tracks hit rate and false-alarm rate over time, so it can show learning without teaching paranoia.

The headline experience is **Challenge mode: "Three calls. Two stories. Who gets your trust?"** You start a fictional day with $1,000 and two tasks: book a job interview and sort out a bank alert. Three calls come in on your real phone: a real recruiter, a fake "recruiter" who wants an equipment deposit, and a bank caller who knows your details. You win by keeping your $1,000 *and* finishing both tasks, so hanging up on everyone loses too. After each call you say Real, Scam or Unverified (you don't have to guess), then a detective reveal flips each caller to show who they really were, and one rewind lets you replay the decision that cost you the most. Challenge rounds are scripted so every player faces the same day; adaptive drills are practice mode.

## User Stories

### Onboarding and settings
1. As a new user, I want to sign up with only my first name and phone number, so that I can start practicing in under a minute.
2. As a new user, I want to verify my phone number before any call is placed, so that Tell never calls someone who didn't opt in.
3. As a new user, I want to pick which themes I practice (banking, shopping/delivery, phone provider), so that drills match the scams I worry about.
4. As a new user, I want to choose a difficulty (obvious, moderate, convincing), so that drills match my skill.
5. As a new user, I want to see the four rules once during onboarding, so that I know what I'm being graded on.
6. As a user, I want to change themes, difficulty and preferred voice later, so that practice stays relevant.
7. As a user, I want a clear explanation that every secret in Tell is fake and I must never say real details, so that I feel safe taking calls.
8. As a user, I want to turn on surprise mode with a time window, so that drills arrive when I'm not expecting them, like real scams.

### Starting a drill
9. As a user, I want a single "Start drill" button, so that practice takes one tap.
10. As a user, I want to see a scenario card before the call (theme, what happened, what I'm protecting), so that I have the context a real person would have.
11. As a user, I want the scenario card to look identical for scam, legit and hijacked calls, so that the card never gives the answer away.
12. As a user, I want the fake secrets on the card to be fresh for every drill, so that I can't memorize them.
13. As a user, I want my phone to ring within seconds of starting, so that the drill feels real.
14. As a user, I want calls to always come from the same Tell number, so that I recognize practice calls in my call log.

### During the call
15. As a user, I want the caller to sound like a real person with a consistent persona and company, so that practice transfers to real calls.
16. As a user, I want some callers to be genuinely legitimate, so that I learn when it's safe to engage, not just to hang up.
17. As a user, I want hijacked callers who know my real (card) details and still ask for a secret, so that I learn that knowing my details is not proof.
18. As a user, I want a one-time code to pop up in the app mid-call on hijacked drills, so that I practice the exact moment scammers exploit.
19. As a user, I want to see the claimed caller, a timer, the voice orb and the four rules on screen during the call, so that I stay oriented.
20. As a user, I want to say "stop drill" at any time to end the call immediately, so that I'm always in control.
21. As a user, I want the caller to break character if I start saying something that sounds like real personal data, so that I never leak anything real.
22. As a user, I want an End drill button in the app, so that I can stop without speaking.
23. As a user, I want scammers with believable, funny quirks, so that drills are fun enough to keep doing.

### Verdict and debrief
24. As a user, I want to answer "Could you tell?" (Real or Scam) and how sure I am after hang-up, so that my judgment is measured, not just my behavior.
25. As a user, I want an after-call report within seconds of hang-up, so that feedback arrives while the call is fresh.
26. As a user, I want to see which rules I kept or broke, with the moment in the call, so that I know exactly what to change.
27. As a user, I want the red flags the caller used marked on the transcript, so that I learn to hear them.
28. As a user, I want to learn who the caller really was (persona and call type) only after my verdict, so that the reveal teaches something.
29. As a user, I want a gentle, non-shaming explanation when I hang up on a legit call, including how I could have checked, so that I don't become afraid of every call.
30. As a user, I want the report to recommend my next drill based on my weakest rule, so that practice adapts to me.
31. As a user, I want to see the agent's steps (what it planned and why), so that I can trust the system isn't random.

### Progress
32. As a user, I want a progress view of scams caught over time, so that I can see myself improving.
33. As a user, I want my false-alarm rate (legit calls I rejected) shown beside it, so that I know I'm not just becoming paranoid.
34. As a user, I want to see which rules I keep breaking, so that I know what to focus on.
35. As a user, I want a gallery of personas I've faced, marked caught or missed, so that practice feels like progress.

### Today threats (news)
36. As a user, I want a Today screen with 3–4 current scams from official FTC alerts, so that I know what's going around.
37. As a user, I want each threat tagged with its theme and its red flags in a few bullets, so that I can understand it at a glance.
38. As a user, I want a "Practice this" button on each threat, so that I can drill against a scam that's in the news today.
39. As a user, I want a banner when a trending scam matches my themes, so that I'm warned about what affects me.

### Guardian
40. As a user, I want to paste a suspicious text or call transcript and get a verdict with honest confidence and next steps, so that Tell helps outside drills too.
41. As a user, I want the Guardian verdict to use the same four rules as my drills, so that advice is consistent everywhere.

### Safety and privacy
42. As a user, I want Tell to never ask me for, or store, real personal or financial data, so that using it carries no risk.
43. As a user, I want transcripts redacted before they're stored, so that an accidental slip isn't kept.
44. As a user, I want every persona to use fictional company names, so that Tell never impersonates a real business.

### Team, judges and evaluation
45. As a judge, I want to watch the scripted Challenge day on a real phone, so that I can see the product work end to end.
46. As a judge, I want to see the Debrief agent's multi-step tool use live on the reveal screen (and the Planner's in practice mode), so that I can tell Nemotron is more than a chatbot.
47. As a judge, I want detection accuracy for a baseline and for Nemotron, on held-out data and real scam calls, so that I can judge accuracy honestly.
48. As a judge, I want pilot results reported honestly as a small feasibility check (n, hit rate, false-alarm rate on themes participants never practiced), so that I can see the measurement works without overclaiming.
49. As a team member, I want the demo sequence to be reproducible on demand, so that the stage demo doesn't depend on randomness.
50. As a team member, I want to swap in T-Mobile's synthetic data if it becomes available, so that we use the official set without rework.
51. As a team member, I want every persona checked against 8 receiver personalities before demo day, so that no persona breaks the rules on stage.

### Detection
60. As a judge, I want accuracy for a baseline and for Nemotron on real scam calls, not just synthetic data, so that I can trust the detection claim.
61. As a judge, I want to watch the risk meter rise during a live call, so that I can see detection happening in real time.
62. As a user, I want the detector to say "can't tell" when it's unsure, so that it never gives me false confidence.
63. As a user, I want my real bank's urgent calls not flagged as scams, so that I keep trusting legitimate callers.

### Try it without signing up
64. As a judge or first-time visitor, I want to try a drill in my browser with no signup and no phone number, by voice or by text, so that I can start one in under 30 seconds.
65. As a visitor, I want a one-line intro before the try-it drill ("What would you say to Kai?") and a clear "AI practice caller" label, so that I know it's a safe simulation.
66. As a user, I want every drill capped in length (a set number of my replies or minutes, whichever comes first), so that a drill never drags and costs stay predictable.
67. As a visitor, I want the landing page to show real pilot results (n, hit rate, false-alarm rate before and after), so that I believe it works.

### Challenge mode
68. As a player, I want to start a fictional day with $1,000 and two tasks, so that every call has stakes I can feel.
69. As a player, I want hanging up on a real caller to cost me a task, so that I learn caution isn't the same as safety.
70. As a player, I want to answer Unverified when I can't tell, so that verifying through a number I already have counts as a good move instead of a guess.
71. As a player, I want to check a fictional company portal and my fictional bank app during the day, so that I can verify a caller the way I would in real life.
72. As a player, I want a detective reveal where each caller flips to show who they were and the lines that gave them away light up, so that the ending teaches me something.
73. As a player, I want one rewind to replay the decision that cost me the most, so that I can try the safer move right away.
74. As a player, I want the Probe, Protect, Verify and Disconnect moves on screen during a call, so that I remember my options under pressure.
75. As a judge, I want every challenge round to be the same scripted day, so that players' scores are comparable.

## Implementation Decisions

**Product rules**
- Call-type mix per session: about 60% scam, 25% legit, 15% hijacked. Hijacked maps to the "convincing" difficulty. This mix applies to practice mode; the stage demo is the scripted Challenge mode day (below).
- The four rules live in one policy definition. Persona prompts, Debrief scoring, verdict copy and the Guardian all read from it.
- Scoring has two parts. Behavior: whether any fake secret appears in the user's turns (normalized match, see Policy and scoring), whether they complied, verified, or hung up, and when. Judgment: whether the Real/Scam verdict was correct, weighted by confidence. Falling for a scam or hijacked call is a large penalty; rejecting a legit call is a small one.
- Progress metrics: hit rate (scams correctly called scam) and false-alarm rate (legit calls called scam), stored per drill as time-series.
- Anti-shortcut rules: a shared pool of four voices assigned randomly regardless of call type; one opening-line template for every type; mixed demeanor (hijacked callers are the warmest, some legit callers are brisk); an identical card layout for all types.
- Fictional brands only: Corvanta Bank, ParcelKite, ShopNest, Nimbus Mobile, Bluebonnet Labs.
- Drill caps: every drill (phone, browser voice or text) ends after 12 user replies or 3 minutes, whichever comes first. The cap and "you can end it at any time" are shown on the scenario card.
- Call disclosure: every phone and browser-voice call opens with the same fixed spoken line before the persona speaks: "It's recorded for your report. Say 'stop drill' anytime." It is identical for every call type, so it reveals nothing, and it is part of the shared opening-line template. Pilot participants and stage volunteers also give written consent first.
- Phone verification: a number is verified with a one-time SMS code from a hosted verification service before any call is placed. Tell never calls an unverified number, so there is no surprise mode in v1 (see Out of Scope).
- Caller label: every persona is labelled "AI practice caller" in the app (never "scam" or "legit"), so the label is honest without giving away the call type.
- Try-it mode (no signup): a public page runs a drill in the browser by voice (ElevenLabs web session, same agent) or by text (Nemotron directly), with no phone number and no account. It runs the Challenge mode day in text or browser voice, ends in the same verdicts and detective reveal, and stores nothing beyond anonymous outcome counts. This is the judges' path; the real-phone drill stays the headline demo.
- Landing page: the tagline ("Every scam has a tell"), a Try-it button, a Start-drill signup, and, only if the pilot runs, its before/after numbers with n, labelled as a small feasibility check.
- Scenario card secrets: every card carries a fake date of birth and a fake home address alongside the card ending, PIN and (on some drills) a one-time code. Scam personas ask for these identity details first, before payment details, because real scam calls ask for identity details far more often than for payment credentials.
- Persona quirks: every persona keeps its serious script beats, so the drill still teaches the four rules, and adds ONE comic quirk taken from real scam-baiting behavior:
  - Derek (bank scam): reads his script too literally and restarts it when interrupted.
  - Priya (delivery scam): keeps cheerfully lowering the "redelivery fee".
  - Kevin (SIM-swap scam): gets audibly stressed about his supervisor listening in.
  - Ray (phone-provider hijacked): too smooth; compliments you for being "so security-conscious" right before asking for the code.
  - Legit personas: mild realism only (a hold-music joke, typing sounds), never pushy.
  - Yui, Ren and Kai (Challenge day): quirks to be chosen and rehearsed with their scripts.
  Quirks must never reveal the call type, so legit callers get quirks too.

**Modules**
- **Drill service (the main seam).** Interface: start a drill for a user (optionally from a threat), receive a post-call event, record a verdict, get a report, get progress. It coordinates everything below, and every external system sits behind an adapter so it can be replaced with a fake.
- **Drill Planner agent (Nemotron, multi-step with tools).** Tools: read the user's profile and rule history; search similar scam dialogues by vector similarity; fetch current threats; write the persona card; place the call. It outputs a persona card (below) and logs each step.
- **Debrief agent (Nemotron).** Input: the persona card, transcript and verdict. Output: rules kept or broken with timestamps, red flags hit, behavior and judgment scores, and the next recommended target rule. Each step is logged, and in Challenge mode the log is shown on the reveal screen (fetch transcript, run the retrieval detector, map moves to rules, pick the rewind point), so the scripted demo still shows Nemotron's multi-step work.
- **Policy and scoring.** Encodes the four rules, the leak check over fake secrets (transcripts and secrets are both normalized before matching: spoken numbers to digits, spacing and punctuation removed, month names to numbers, and house number plus street name for addresses, so "eight three oh two" matches 8302), and redaction of real-looking data (card-number and SSN patterns) before storage.
- **Voice adapter (ElevenLabs Agents).** Places outbound calls through the SIP-trunk outbound-call API with the persona passed as dynamic variables, and verifies and parses the post-call transcription webhook (HMAC signature; idempotent on the conversation ID because retries resend the same payload). Live events: during a call the agent reports scripted beats to Tell through server tools (mid-call requests the agent makes at defined beats: code requested, payment requested, secret heard, stop drill), and these drive the code pop-up, the risk meter, balance changes and break-character. Which live signals ElevenLabs exposes on SIP outbound calls is verified in the first hour; if per-turn data isn't available, the risk meter and live features run on the browser-voice session, where the app sees every turn.
- **Telephony configuration (Photon Spectrum Voice).** The Photon iMessage line is imported into ElevenLabs as a SIP-trunk number: TLS to Photon's SIP server on port 5061, digest auth with the project ID and secret, media encryption disabled (Photon carries plain RTP), caller ID must be a line owned by the same project. Photon is the phone line only; it has no voice webhooks, so call results come from ElevenLabs.
- **LLM adapter (Nemotron via NVIDIA's OpenAI-compatible API).** Agents use a larger Nemotron (`nemotron-3-super-120b-a12b`, with `llama-3.3-nemotron-super-49b-v1.5` as backup). The live call tries a small fast model (`nvidia-nemotron-nano-9b-v2`) as ElevenLabs' custom LLM. If first-token latency is above 800 ms in testing, the live call falls back to ElevenLabs' built-in model and Nemotron stays on the agents; the pitch then says Nemotron runs the agents, detector and reveal, not the live voice. The NVIDIA API key stays on the server, and Persona QA and evaluation runs happen before the demo so they don't share the live quota.
- **Detector.** Three versions behind one interface (TF-IDF baseline, Nemotron zero-shot, Nemotron + retrieval), each returning label, scam type, tactic-tagged red flags and confidence; see Detection below. Used by the Debrief agent, the Guardian screen and the evaluation script.
- **Threat ingest.** Pulls FTC consumer alerts (primary) and NewsAPI headlines (secondary, free tier: 24-hour delay, 100 requests/day, development use only) on the server every few hours. Nemotron tags each item with a theme and red flags; results are cached.
- **Web app (Next.js, dark, Apple-clean).** Hackathon screens: landing, try-it, Challenge game board, verdict sheet, detective reveal with rewind, and the presenter screen. Practice-mode screens (onboarding, home, drills, after-call report, Guardian, settings) come later. Visual direction: see Design direction below; product truth for design work lives in PRODUCT.md.

**Persona card (decision shape, from the design pass)**
```json
{
  "persona_name": "Ray",
  "claimed_org": "Nimbus Mobile Security",
  "theme": "phone_provider",
  "call_type": "hijacked",
  "voice_id": "<shared pool>",
  "demeanor": "calm, authoritative",
  "card_facts": {"plan": "Unlimited Plus", "last_bill": "$71.18"},
  "fake_secrets": {"date_of_birth": "1991-03-14", "home_address": "418 Pecan Hollow Dr, Plano TX", "account_pin": "8302", "live_code": "551 274"},
  "script_beats": ["verify name", "cite last bill", "warn of port-out", "ask for live code", "press once if refused"],
  "red_flags": ["details_as_proof", "asks_for_code"],
  "rules_tested": [1, 3]
}
```
The card is sent to the voice agent as dynamic variables and saved on the drill, so the Debrief agent knows exactly what was planted.

**Data (TigerData / Tiger Cloud Postgres with TimescaleDB, pgvector and pgvectorscale)**
- Regular tables: users (first name, verified phone, themes, difficulty, voice, surprise window), drills (theme, call type, persona card, fake secrets, conversation ID, verdict, confidence), scam examples (dialogue, type, label, embedding with a StreamingDiskANN index).
- Hypertables: call turns, drill outcomes (behavior, judgment, hit/false-alarm flags), agent steps, threats.
- Seed data:
  - Scammer persona source: BothBosu/multi-agent-scam-conversation (Hugging Face, Apache-2.0). Columns: dialogue, personality, type, label. Scam types: ssn, refund, support, reward. Non-scam types: delivery, insurance, telemarketing, wrong. The Planner pulls 2–3 example dialogues per scam type into each persona prompt as script references.
  - Legit caller style: talkmap/telecom-conversation-corpus (200k synthetic telecom support calls, MIT) and talkmap/banking-conversation-corpus (300k, MIT). A few agent turns serve as style examples for the legit personas (Maria, Tom, Dana): calm, specific, never pushy. These are customer-initiated calls, so they are adapted to outbound.
  - Real scam calls: 436-4/youtube-scam-conversations (20 real scam-baiting transcripts, Apache-2.0). Test data only (real-call scoring and pilot clips), never used for persona prompts or quirks. Quirks come from the multi-agent dataset's personality column and the team's own writing.
  - Detector train/test: BothBosu/scam-dialogue (1.28k train / 320 test), unchanged.
  - If T-Mobile's synthetic set arrives, it is swapped in behind the same loader.

**Challenge mode**
- The day: the player starts with $1,000 and two tasks, "Book your Bluebonnet Labs interview" and "Sort out the Corvanta Bank alert". The win condition is ending the day with $1,000 and both tasks done. Bluebonnet Labs is a fictional employer and joins the fictional brand list.
- The three scripted calls ("three calls, two stories"), placed on the player's real phone in this order:
  1. Yui, Bluebonnet Labs recruiting (legit): confirms the interview slot and asks for nothing secret. Saying Real, or Unverified and then checking the portal, books the interview. Saying Scam leaves the task open.
  2. Ren, claiming Bluebonnet Labs onboarding (scam): asks for a $350 "equipment deposit" by gift card. The scenario card says the player bought a $350 gift card for a birthday, with a fake gift-card code; reading that code (or the fake card details) is the payment and costs $350. Refusing loses nothing.
  3. Kai, Corvanta Bank fraud team (hijacked, the ambiguous call): knows the card ending and a recent charge, then asks for the one-time code that pops up mid-call. Reading the code costs $650 and fails the bank task. Hanging up and tapping "Call Corvanta" in the fictional bank app resolves the alert and completes the task.
- Verdicts: one tap after every call (Real, Scam or Unverified), with no confidence rating in Challenge mode; confidence stays in practice mode. Unverified is never penalized by itself; what counts is whether money moved and whether the task got done.
- Before the day starts the player sees only the goal ("Keep your $1,000. Finish both tasks.") and the four moves. The four rules are taught at the reveal, right after the player has kept or broken them.
- Where the player looks: a laptop or tablet is the game board and the player's own phone takes the call. Try-it runs everything on one device by browser voice or text.
- A call that doesn't connect or drops shows two buttons, "Call again" and "Play in browser", never a spinner; the day carries on either way.
- Verification surfaces: a fictional company portal (shows the real interview booking and says Bluebonnet never charges for equipment) and a fictional bank app. Calling back is an in-app action, not an inbound call: "Call Corvanta" opens a short browser-voice or text session with a scripted legit Corvanta agent who confirms no alert was sent. Opening the portal, opening the bank app and finishing the callback are recorded as Verify events with timestamps; that is how Unverified turns into a completed task.
- Moves: Probe (ask a question), Protect (refuse a secret), Verify (check the portal or bank app, or call back), Disconnect (hang up). On a phone call they are spoken, and the screen shows them as reminders; in text try-it mode they are tappable. The Debrief agent tags which move the player made at each key moment.
- Balance and tasks update after each call. A leak is detected with the same normalized check over fake secrets as drills (including the gift-card code), and its cost comes from the call's stakes.
- Call flow: each call is scripted to about 45 seconds of beats (still capped at 12 replies or 3 minutes). The next call is placed only after the player submits a verdict, and the portal and bank app keep their state across the day.
- Detective reveal: after the third call, each caller card flips to show the real identity and call type, the detector's red-flag lines light up on the transcript, and each decision is marked as worked or cost you. It replaces the after-call report in Challenge mode and still grades against the four rules.
- Rewind: one per day. The player picks a decision (default: the costliest) and replays from that turn in text with the same persona; the replay outcome is shown next to the original but doesn't change the official score.
- Scripted vs adaptive: challenge rounds use a fixed seed, fixed personas, beats and stakes, so every player faces the same day. Nemotron runs the detector, the risk meter and the Debrief agent behind the reveal, and the live replies within those beats when its latency allows (see LLM adapter). Practice mode keeps the adaptive Planner and the call-type mix.
- Stage demo: the scripted day is the demo sequence (Yui → Ren → Kai), with the spectator risk meter on the big screen. See Further Notes for timing.

**Agent and voice decisions**
- Code decides money, tasks and rules (normalized leak check, verify events, verdicts). The Debrief agent only explains them and picks the rewind point. If the agent's explanation contradicts the code's score, the code's score is shown and the mismatch is logged.
- The Debrief agent is a real Nemotron tool-calling loop over a small fixed toolset (read transcript, run the detector, get leak events, get verify events, map moves to rules, choose the rewind point), capped at about 6 steps. If it fails or runs past 8 seconds, a fixed sequence of the same calls runs instead. The reveal labels which path ran, so the demo never claims agency that didn't happen.
- Four fixed ElevenLabs agents for the Challenge day: Yui, Ren, Kai and Aki (the Corvanta callback agent). Each has a fixed voice and prompt; only the fake secrets change per call, through dynamic variables. Per-call prompt and voice overrides are not used, because each one must be switched on in the agent's Security tab and errors otherwise. The shared agent with overrides returns in practice mode.
- Live calls use ElevenLabs' built-in model by default. Nemotron Nano sits behind a setting that is switched on only if it beats 800 ms to the first word in testing. Nemotron runs the Debrief agent, the detector and the risk meter either way.
- Persona guardrails: never reveal the call type before the reveal, deflect once in character and steer back, break character only on hearing real personal data, never give real-world scam instructions, never name real companies. Persona QA adds a "jailbreak attempt" receiver to the eight personalities.
- ElevenLabs data handling, from its docs (to confirm in the first hour): turn voice recording off and the separate audio webhook off; set a short retention period; delete each conversation through the API once its post-call webhook is processed. True zero retention is Enterprise-only. Verify the post-call webhook with the ElevenLabs SDK's signature helper. Mid-call server tools carry a secret header and the conversation ID.
- Open facts from the docs, to settle in ticket #2: whether server tools work on SIP outbound calls, and whether any per-turn data is available during a SIP call. The live monitoring socket is Enterprise-only and not documented for phone calls.

**Design direction**
Product truth for design work is in PRODUCT.md; sprite rules are in SPRITES_USAGE.md. This is the confirmed brief.
- World: the day as a passbook, drawn in the sprites' style and made to feel futuristic without neon. Pure black field, matching the sprite frames, so a sprite tile disappears into the page. Flat shapes with the sprites' white outline and soft rounded corners. Status chips are small rounded pills like the sprite sheet's row labels. Big figures (the balance, timers, the presenter's risk readout) are set in a dot-matrix face; everything else is the system UI face. Hairline instrument details. Colour stays neutral (white, greys, one warm off-white); purple, red and green appear only with their cat. After the reveal, broken and kept rules may use red and green, always with text labels.
- Game board (laptop, landscape): a running head of pills (CALL 2 OF 3 · BLUEBONNET ONBOARDING · 0:42). Left: the $1,000 balance at monumental size and a three-line ledger, one line per call. Centre: the caller card ("AI practice caller", claimed name and org, timer, a calm call indicator). Right: two task slips (OPEN, BOOKED, RESOLVED) and two app tiles, the Corvanta bank app and the Bluebonnet portal, which open as sheets. Bottom: the four moves. During a call everything except the caller card and the moves dims. The one-time code arrives as a notification-style toast.
- Verdict sheet: three large buttons, Real, Scam and Unverified, each with a plain one-line sublabel. One tap.
- Between calls: the ledger line posts with a stamp, the balance counts to its new value, coins or a task stamp animate, then the screen goes still.
- Detective reveal: the three caller cards flip to show identity and call type in words. Transcripts show the detector's red-flag lines with tactic pills. Each decision is marked "worked" or "cost you". The green Debrief cat sits in a black tile beside the agent-steps panel, its pose following the real agent state (thinking during tool calls, typing while writing, standard while presenting, excited only for kept rules or a good day). The four rules, then the one rewind.
- Presenter screen (projector): a huge dot-matrix risk readout and bar, tactic pills as they appear, the current caller's claimed name, and the red Detector cat. Never shown on the player's screen.
- Try-it: the same board on one device; on a phone it stacks into one column and the caller card becomes the chat or browser-voice panel.
- Landing: the tagline "Every scam has a tell", the hook, a Try it button, and the three cats introduced as the three AI systems (Planner, Detector, Debrief), idle in their tiles. No invented results.
- Sprite rules: one cat on screen at a time; a cat animates only while its system is working, plays its idle loop twice, then holds frame 01. 1× (170×145) on the board and presenter screen, 2× only for the reveal's hero moment, crisp pixels, never cropped or recoloured. No cat on the player's board during a call; no purple Planner cat in Challenge mode (the day is scripted); no cat between calls. Cats are text-only (no text-to-speech); the talk pose plays while text streams.
- Motion: strong ease-out for anything entering, ease-in-out for things moving on screen, never ease-in; UI motion stays under 300 ms (press 140 ms, toasts about 220 ms, sheets about 300 ms). Buttons press to 0.97 scale. Nothing enters from scale(0); entrances start at 0.95 with a fade. Stamps may use a small spring (bounce at most 0.2). The reveal is rare, so its card flips may run about 420 ms with 60 ms staggers. Only transform and opacity animate. During a call nothing moves except the call indicator and the code toast. Reduced motion: fades only, and sprites show a still frame.
- Accessibility: body type at least 18 px on the board, verdict buttons at least 64 px tall, primary text contrast at least 7:1, no meaning carried by colour alone, visible white focus rings.
- Anti-goals: childish or gamey, fear-mongering, neon glow, alarm red.
- Open design decisions: the dot-matrix face must pass a legibility check on a projector and for older eyes, or figures fall back to the system face. In phone mode the laptop can't hear the call, so the caller card's indicator shows call state, not real audio; a real waveform appears only in browser voice.

**Detection**
We do not fine-tune or train Nemotron. Nemotron is used as-is, and its weights never change. The Hugging Face data has three jobs:
1. Train a tiny TF-IDF + logistic-regression baseline (seconds, scikit-learn). Its only purpose is to give Nemotron something to beat.
2. Act as an example pool for retrieval: for each call, fetch the 5 most similar labeled dialogues from TigerData (pgvector) and put them in Nemotron's prompt as examples.
3. Act as held-out test sets that produce the accuracy numbers.

- Data roles (strict split, no leakage):

  | Data | Role |
  | --- | --- |
  | BothBosu/scam-dialogue train split | Train the baseline + the retrieval example pool in TigerData |
  | BothBosu/scam-dialogue test split | Scoring only, never used as examples |
  | 436-4/youtube-scam-conversations + FTC robocall transcripts (wspr-ncsu/robocall-audio-dataset) | Real-call scoring only (all scams, so reported as detection rate/recall, not F1), never used as examples or persona material |
  | 30–50 hard negatives: urgent-sounding legit calls (real fraud alerts, delivery problems) written by the team from real bank and carrier alert wording, plus talkmap support calls; not generated by Nemotron, so Nemotron isn't graded on its own writing | False-positive scoring only |
  | BothBosu/multi-agent-scam-conversation + talkmap corpora | Persona prompts only, not detection |

  Deduplicate across splits; the evaluation must assert that no test item is in the example pool. The YouTube transcripts are public, so Nemotron may have seen them in pretraining; the pitch says so.
- Three detector versions behind one interface, all returning label, scam type, red-flag spans tagged with tactics (authority, urgency, details-as-proof, reward, fear), and confidence:
  1. TF-IDF baseline.
  2. Nemotron zero-shot with structured output.
  3. Nemotron + retrieval (5 nearest labeled examples from pgvector). This is the production detector.
  If T-Mobile provides their baseline classifier, add it as a fourth comparison.
- Unsure band: below 60% confidence the detector says "Can't tell — verify by calling back on a number you already have" instead of guessing.
- Turn-by-turn scoring: the detector can run after each call turn and record the first turn where it flags correctly (time to detection).
- Spectator mode: during a live drill, a risk meter on the presenter screen only (never on the user's phone, so drills stay honest) rises turn by turn and shows tactic labels as red flags appear. Used in the stage demo.
- The detector feeds the Debrief agent (red flags on the transcript).

**API contract (shape, not routes)**
- Start drill → returns the drill ID and scenario card; the call is placed asynchronously.
- Post-call webhook → verified, idempotent; stores redacted turns and triggers Debrief.
- Submit verdict → Real / Scam / Unverified + confidence (50/75/100).
- Record verify event → portal opened, bank app opened, callback completed (Challenge mode).
- Get report → rules, flags, reveal, scores, next target, agent steps.
- Get progress → time series of hit rate, false-alarm rate, rule breaks.
- Start challenge → returns the day (balance, tasks, the three calls' scenario cards); calls are placed one after another.
- Get challenge result → final balance, task status, per-call verdicts and moves, the reveal and the rewind outcome.

## Testing Decisions

- **A good test** drives the system only through its public interface and asserts on externally visible results: the report, the progress numbers, what was stored, what the fake vendors were asked to do. It never asserts on prompts, internal function calls or intermediate data structures. Tests must survive a rewrite of the agents' internals.
- **Seam 1 — drill service, end to end (primary; most tests live here).** Real Postgres (Tiger, or local TimescaleDB with pgvector for CI). Fakes replace the voice adapter (records outbound-call requests and emits recorded post-call webhook payloads), the LLM adapter (returns fixed plans and scores for given inputs), the threat feeds, and the clock. Scenarios to cover:
  - A scam drill where the transcript contains a fake secret: behavior is scored as a leak, rule 1 is broken at the right timestamp, and hit rate stays unchanged.
  - A legit drill where the user says "scam": counted as a false alarm, small penalty, the "how you could have checked" explanation is present.
  - A hijacked drill where the user refuses the code and completes the in-app callback: rules 1, 3 and 4 kept, counted as a hit.
  - A spoken leak ("eight three oh two", "March fourteenth ninety-one") matches the fake secret after normalization.
  - Every call request starts with the fixed disclosure line.
  - A duplicate webhook delivery doesn't double-count outcomes.
  - A webhook with a bad signature is rejected and stores nothing.
  - A real-looking card number or SSN in the transcript is redacted before storage.
  - The Planner targets the user's most-broken rule and respects the type mix over many drills.
  - "Practice this" on a threat produces a drill whose persona traces back to that threat.
  - The challenge seed produces the exact Yui → Ren → Kai day, with the same stakes every time.
  - Challenge scoring: confirming Yui books the interview; paying Ren costs $350; reading Kai's code costs $650 and fails the bank task; calling back through the bank app completes it; a perfect day ends at $1,000 with both tasks done.
  - Saying Scam to Yui leaves the interview task open, and Unverified followed by a portal check completes it.
  - A rewind replay is recorded but doesn't change the official day score.
  - Calls are never placed to an unverified number.
  - A drill ends at the reply or time cap, and the report is still produced.
  - A try-it drill places no call, needs no account, and stores only anonymous outcome counts.
- **Seam 2 — detector evaluation script.** Given a dataset split, it scores every detector version (baseline, Nemotron zero-shot, Nemotron + retrieval, and T-Mobile's baseline if provided):
  - On the synthetic test split: accuracy, precision, recall, F1 and a confusion matrix. On real calls (all scams): detection rate only. On hard negatives (all legit): false-positive rate only. The headline pairs the last two.
  - Unseen-type test: example pool limited to ssn + refund, scored on support + reward, to show it learned tactics, not scripts.
  - Time to detection: average turn of first correct flag.
  - Calibration: bucket predictions by confidence and compare to actual accuracy.
  - Leakage check: fails if any test item appears in the example pool.
  Tests use a tiny labeled fixture with known answers to verify every metric.
- **Seam 3 — Persona QA (text only, no phone calls).** Nemotron plays each of 8 receiver personalities (aggressive, anxious, confused, distracted, greedy, polite, skeptical, and one more still to be chosen) against all 11 personas (the nine practice personas plus Yui and Ren), for 88 text conversations. Checks run on the conversation transcript only:
  - Every scam and hijacked persona asks for at least one fake secret.
  - No legit persona ever asks for a secret.
  - "Stop drill" ends the conversation within one turn.
  - The persona breaks character when the receiver says something that looks like a real card number or SSN.
  - No real company names appear.
  - The opening line matches the shared template for every call type.
  - The fixed disclosure line opens every conversation.
  Output: a pass/fail table per persona × personality, plus saved transcripts, which double as demo material and as evidence of Nemotron multi-step use for the NVIDIA track.
- **No separate UI test seam.** The UI is checked by hand against the demo script. Optional smoke checks only if time allows.
- **Prior art:** none; the repo is empty. These seams set the pattern for later tests.

## Out of Scope

- Connecting real bank, calendar or telecom accounts (OAuth, Plaid, Nessie); personas use typed-in profile facts only.
- Intercepting or screening the user's real incoming calls in real time.
- Answering scammers on the user's behalf (scam-baiting).
- Caregiver accounts, scheduling for others, or multi-user households.
- Native mobile apps; Tell is a mobile-responsive web app.
- Inbound calls to the Tell number, and iMessage/SMS conversations through Photon (callbacks happen in-app instead).
- Surprise mode (story 8) for v1: a call the user didn't just start could reach whoever is holding the phone.
- Languages other than English.
- Battle cards: one-line practice rounds, a mastery deck, and Debrief recommendations of a card to drill.
- For the hackathon: evidence pinning against synthetic messages, a "boss" caller that combines earlier tactics, and shareable friend-challenge seeds. They fit Challenge mode later.
- Claims about retention or long-term behavior change; the pilot is same-session only.
- Production compliance (Photon business-profile registration, NewsAPI paid tier, consent and recording-law review per state).

## Further Notes

- **Transfer is the key claim to defend.** An 8-month randomized trial with about 19,500 UC San Diego Health employees found embedded phishing training reduced failure rates by only about 1.7%, mainly because people didn't engage with the material. Tell's answer is live voice practice with feedback in seconds, adapting to the rule you keep breaking. Tonight's pilot: 10–15 consenting hackers do a pre-test on held-out items (phone-provider calls, real scam clips, one legit call), then 3 drills on banking and shopping only, then a post-test on different held-out items. Report n, hit rate, false-alarm rate and rule-correct actions, and present the results honestly even if nothing moves.
- **Integration risks to clear in the first hour:** the phone ringing via ElevenLabs → Photon with two-way audio; each Nemotron model ID responding on the hosted endpoint; per-call voice override enabled in the ElevenLabs agent (fallback: one agent per voice); a public URL for the webhook.
- **Fallbacks:** Photon SIP fails → place calls from an ElevenLabs/Twilio number. Live-call Nemotron too slow → ElevenLabs built-in model. Webhook missing → poll the conversation by ID after hang-up.
- **Prior art: Scam Vaccine (scamvaccine.gov.sg, Singapore Open Government Products, from Hack for Public Good 2026).** From its public pages: an AI scammer talks to you by voice call or message (bank and police impersonation), there's a no-signup demo capped at 12 replies or 3 minutes, real users get safe versions of newly detected scam variants by call or WhatsApp, and a debrief lists the red flags and what to watch next. Its headline results are satisfaction numbers (100% wanted more exercises, 96% supported a rollout). Judges may know it, so the pitch says plainly where Tell differs:
  - **Legit and hijacked calls, not only scams.** Tell measures false alarms, so it can show people get better without becoming paranoid.
  - **Measured learning, not satisfaction.** Pre/post hit rate and false-alarm rate on themes participants never practiced, reported as a small feasibility check.
  - **Adaptive practice.** The Planner targets the rule you break most.
  - **Detection with real numbers.** Baseline vs Nemotron vs Nemotron + retrieval: detection rate on real scam calls and false-alarm rate on hard negatives, plus the live risk meter.
  - **A game with stakes.** The $1,000 day rewards completing real tasks, not just refusing; both products call real phones, so that alone isn't a difference.
- **Three-minute stage run:** 0:00–0:15 hook ("Three calls. Two stories. Who gets your trust?" and the $1,000 day). 0:15–0:45 Yui and Ren as a 30-second recording from rehearsal, labelled "recorded", with the balance moving. 0:45–1:45 Kai live on a team member's pre-verified phone, risk meter and code pop-up on the big screen. 1:45–2:20 the detective reveal with the Debrief agent's steps, and one rewind. 2:20–2:45 one results slide. 2:45–3:00 QR code to the no-signup page.
- **Stage call path:** the live call goes to a team member's phone verified the day before, never an unverified judge's phone (a judge can try the no-signup page). In the first hours, test-call phones on T-Mobile, AT&T and Verizon and check the call isn't labelled "Scam Likely" or blocked. The presenter screen has a one-tap switch to the browser-voice session, which is Plan B for Kai; text try-it is Plan C.
- **Detection pitch slide:** one big pair (Nemotron + retrieval vs baseline: share of real scam calls caught, and false-alarm rate on urgent legit calls); a small table of the 3 versions × synthetic F1 / real-call detection rate / hard-negative false-alarm rate; a time-to-detection chart; one honesty line ("synthetic training data; real-call test set is small, n = …").
- **Build order (vertical slice first):** (1) Challenge day in text: three scripted personas on Nemotron, normalized leak check, balance and tasks, verdicts, verify events, reveal. This is also try-it and Plan C. (2) The same day by browser voice. (3) Real phone calls with the disclosure line and phone verification. (4) Live events: code pop-up and risk meter. (5) Detector: baseline vs Nemotron + retrieval on real calls and hard negatives. (6) Debrief agent log on the reveal, then rewind. Nothing below starts until (1)–(4) work end to end.
- **Cut list, cut first to last:** surprise mode (already out), Guardian, NewsAPI, the Today screen, calibration and the unseen-type test, practice-mode Planner, Persona QA beyond the Challenge personas, the pilot (or run n≈5 as an anecdote), the landing page beyond tagline + Try-it.
- **More first-hour checks:** which live signals a SIP call exposes; each Nemotron model ID responding with structured output; capture one real post-call webhook payload as the test fixture.
- Diagrams live in `docs/img/`: architecture, persona matrix, and the live-call and reveal screens.
- No issue tracker is configured for this repo yet. This file stands in for the tracker issue, labeled `ready-for-agent`. GitHub Issues can replace it once the team sets them up.
