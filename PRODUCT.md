# Product

## Platform

web

## Stack

Next.js web app (named in `docs/SPEC.md`), deployed to a public URL. Mobile-responsive; no native apps.

## Users

Everyday adults who get calls from banks, delivery services, carriers and recruiters, including older adults, the group scammers target most. They are not gamers and should never need gaming literacy to play. They use Tell on a laptop or tablet as the "game board" while their own phone takes the practice call, or on one device in the browser.

Secondary audience, for the HackUTD 2026 event: judges who watch a three-minute stage run on a big screen and then try the no-signup page on their own laptops.

## Product Purpose

Tell trains people to tell a real call from a scam by practicing on their own phone. The headline experience is Challenge mode: a fictional day with $1,000 and two tasks (book a job interview, sort out a bank alert), and three scripted calls: a real recruiter, a fake recruiter asking for an equipment deposit, and a bank caller who knows your details. The player wins by keeping the money and finishing both tasks, so hanging up on everyone loses too. After each call the player says Real, Scam or Unverified; a detective reveal at the end shows who each caller really was, and one rewind replays the costliest decision.

Success: players protect fake secrets and still complete legitimate tasks, and leave with four portable rules they can use on a real call.

## Positioning

Tell measures both sides of judgment: scams caught and real callers wrongly rejected. Unlike scam simulators that only send scams (Scam Vaccine, Singapore), Tell includes legitimate and hijacked callers and rewards verifying through a number you already have. Detection is reported with real numbers (baseline vs Nemotron vs Nemotron + retrieval), and the Debrief agent's work is shown, not claimed.

## Operating Context

- A real phone rings with an AI caller; the laptop or tablet shows the game board: the caller card, the player's $1,000, two task cards, the four moves, and a fictional bank app and company portal.
- A presenter screen, separate from the player's, shows the live risk meter for the audience. It never appears on the player's screen.
- A no-signup try-it page runs the same day in text or browser voice on one device.
- Every call opens with a fixed spoken disclosure: it's recorded, say "stop drill" anytime.

## Capabilities and Constraints

- The four rules: never share codes, PINs, passwords, SSN or identity details; pressure is the tell; knowing your details doesn't prove who's calling; hang up and call back on a number you already have.
- Four moves on screen: Probe, Protect, Verify, Disconnect.
- Verdicts are one tap: Real, Scam or Unverified. Unverified is never penalized by itself.
- Code decides money, tasks and rules; the Debrief agent explains and picks the rewind point.
- Every caller is labelled "AI practice caller". Nothing on the player's screen (color, art, layout) may hint at call type before the reveal.
- Fictional brands only: Corvanta Bank, ParcelKite, ShopNest, Nimbus Mobile, Bluebonnet Labs.
- Drill caps: 12 player replies or 3 minutes.
- Out of scope for the hackathon: auth beyond phone verification, production hardening, practice-mode surfaces (Today threats, Guardian, progress). Battle cards are not part of Tell.

## Brand Commitments

- Name: Tell. Tagline: "Every scam has a tell." Challenge hook: "Three calls. Two stories. Who gets your trust?"
- `docs/SPEC.md` pins the web app as dark and Apple-clean.
- Mascots: one black chibi cat in a hoodie, in three colorways, each the face of one AI system: purple = Drill Planner, red = Detector, green = Debrief agent. Usage is governed by `SPRITES_USAGE.md`: callers never get mascots, colorway never signals call type, frames are 170×145 opaque on a black field and are never recolored, cropped or color-keyed. Sprites keep the app lively without distracting from listening.
- Not childish or gamey, and never fear-mongering.

## Evidence on Hand

- Product spec: `docs/SPEC.md`. Diagrams: `docs/img/` (architecture, persona matrix, call screens; the persona matrix predates the brand renames).
- Mascot sprites: `public/sprites/{purple,red,green}/`.
- No pilot results, user testimonials or detection numbers exist yet. Landing and results slides must not invent them; show them only after they are measured.

## Product Principles

1. Caution isn't safety. Reward verifying and completing real tasks, not just refusing.
2. Never give the answer away before the verdict, in copy, color, art or motion.
3. Show the work. The agent's steps and the detector's evidence are visible; scores come from code.
4. Playful in the moment, plain-spoken in the lesson. The reveal teaches in calm, specific language, never shaming.
5. Motion means something is happening; at rest, the screen is still.

## Accessibility & Inclusion

Designed for older adults: large readable type, high contrast on the dark theme, plain words, one-tap decisions, and no reliance on color alone (call types and outcomes carry text labels). Respect the OS reduced-motion setting by showing still frames.
