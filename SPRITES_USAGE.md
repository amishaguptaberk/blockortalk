# Mascot sprites

Cat mascot sprites for Tell. This file is the usage guide for the assets in `public/sprites/`. It does not add UI, playback code, or new personalities. The personalities below are the ones already defined in `docs/SPEC.md`.

## Overview

Tell is a practice-call app. Three AI systems do the work the user can see:

- The **Drill Planner agent** chooses the next drill, aims it at the rule the user breaks most, and writes the persona card.
- The **Detector** labels scam type and red flags. It feeds the after-call report, the Guardian paste-a-message screen, and the spectator risk meter.
- The **Debrief agent** scores the call against the four rules, explains the result, and picks what to practice next.

The cat is the on-screen face of those three systems. Each system has one colorway. The cat's pose changes with what that system is doing: waiting, speaking, speaking with energy, thinking, or typing.

The same three colorways share one drawing. A black chibi cat in a hoodie, with a light outline, flat color, and the same poses in every folder. Only the hoodie color changes. Purple, red, and green are not three different characters and they are not three call types.

### What these sprites are not

`docs/SPEC.md` also names people and test roles. They do not get mascots.

- **Caller personas** are the voices on the practice call. The nine practice personas plus Yui and Ren are the 11 personas in Persona QA: Derek, Priya, Kevin, Maria, Tom, Dana, Kai, Ava, Ray, Yui, and Ren. During a call every one of them is labelled "AI practice caller". The real persona and the call type (scam, legit, or hijacked) are revealed only after the user's verdict. Do not assign them colorways.
- **Receiver personalities** are simulated users for Persona QA: aggressive, anxious, confused, distracted, greedy, polite, skeptical, and one still to be chosen. They are not on-screen characters.
- **Call type is not a color.** The spec requires the scenario card and the caller label to look the same for scam, legit, and hijacked calls, so the screen does not give away the answer. Do not show the red cat for a scam, the green cat for a legit caller, or the purple cat for a hijacked caller.

## Personality and colorway mapping

The spec does not assign colors. This table is the mapping to use when the mascots are built. It follows language the spec and the report mock already use: the Detector's output is red flags, and the after-call mock in `docs/img/persona-screens.png` draws broken rules in red and kept rules in green. Purple is left for the Drill Planner so a planning mascot is not a verdict color.

| Personality | Colorway | Role | Sprite directory |
|---|---|---|---|
| Drill Planner agent | Purple | Chooses each drill, targets the rule the user breaks most, writes the persona card, and places the call. In Challenge mode the day is scripted; the Planner still runs in practice mode, including "Practice this" on a Today threat. | `public/sprites/purple/` |
| Detector | Red | Returns a label, scam type, tactic-tagged red flags, and confidence for the Debrief, the Guardian screen, and the evaluation script. Below 60% confidence it says it can't tell and tells the user to call back on a number they already have. The live risk meter is presenter-only and never appears on the user's phone during a drill. | `public/sprites/red/` |
| Debrief agent | Green | Scores behavior and judgment, marks rules kept or broken with timestamps, names the red flags, and recommends the next rule. The explanation is specific and not shaming, including when the user hung up on a real caller. In Challenge mode its steps are shown on the detective reveal. | `public/sprites/green/` |

Use one directory for the whole time that personality is the one on screen. When the app moves from planning a drill to explaining the result, switch from `purple/` to `green/` and start the new animation at frame 01.

## Directory structure

All three colorways use the same layout. Frame names and counts match across purple, red, and green.

```text
public/sprites/
├── purple/
│   ├── full_sprite_sheet.png
│   ├── purple_talking.gif
│   ├── idle/
│   │   └── idle_01.png … idle_08.png
│   ├── talk_standard/
│   │   └── talk_standard_01.png … talk_standard_12.png
│   ├── talk_excited/
│   │   └── talk_excited_01.png … talk_excited_12.png
│   ├── talk_thinking/
│   │   └── talk_thinking_01.png … talk_thinking_12.png
│   └── talk_typing/
│       └── talk_typing_01.png … talk_typing_11.png
├── red/
│   ├── full_sprite_sheet.png
│   ├── red_talking.gif
│   └── (the same five animation folders)
└── green/
    ├── full_sprite_sheet.png
    ├── green_talking.gif
    └── (the same five animation folders)
```

Naming rules, taken from the files:

- The colorway is the directory name: `purple`, `red`, or `green`.
- The animation is the folder name. The usage names in this guide map to those folders as follows.

  | Usage name | Folder | Filename prefix |
  |---|---|---|
  | idle | `idle` | `idle_` |
  | talking | `talk_standard` | `talk_standard_` |
  | excited | `talk_excited` | `talk_excited_` |
  | thinking | `talk_thinking` | `talk_thinking_` |
  | typing | `talk_typing` | `talk_typing_` |

- Frames are two-digit and 1-based: `_01`, `_02`, and so on. Play them in that numeric order. Do not sort them as plain strings if the index ever grows past 99; with the current files, plain string sort and numeric sort are the same.
- `full_sprite_sheet.png` is a contact sheet of the same poses (2172×724), with a label at the left of each row. It is a reference. Animate from the numbered PNGs so playback does not depend on slicing the sheet.
- `purple_talking.gif`, `red_talking.gif`, and `green_talking.gif` are 12-frame previews of **talking** (`talk_standard`), not a sixth animation. Each frame is 340×290, which is exactly 2× the 170×145 PNG canvas. The purple GIF matches `talk_standard_01.png` through `talk_standard_12.png` in order. The red and green GIFs have the same size, frame count, and frame delay beside the same folder layout.

There are 57 files in each colorway (55 numbered frames, one sprite sheet, one GIF) and 171 files in total.

## Animation reference

Every numbered frame is a 170×145 PNG. Every colorway has the same counts. The PNGs do not store a frame rate or a loop flag. Those two columns are playback recommendations, except where a cell quotes something the asset itself contains.

| Animation | Intended use | Frames | Frame order | Loop | Playback |
|---|---|---|---|---|---|
| idle | Resting or waiting. The Planner before a drill starts, the Detector with nothing to score, the Debrief after the report is already on screen. | 8 | `idle_01.png` → `idle_08.png` | Yes. The sprite sheet labels this row **IDLE (LOOP)**. That label is part of the art. | Recommended about 8 fps. Not stored in the PNGs. |
| talking | Speaking normally. A Planner step in the agent log, a Detector verdict at ordinary confidence, a Debrief explanation of a broken or kept rule. | 12 | `talk_standard_01.png` → `talk_standard_12.png` | Recommended while the personality is speaking in a normal tone. The sheet does not label this row as a loop. | Recommended about 8 fps, to sit next to the talking GIF. See below. |
| excited | Speaking with extra energy. A drill that is ready, a kept rule, a clear next step. Not a shame pose, and not the animation for "you fell for it." The Debrief's written tone stays gentle either way. | 12 | `talk_excited_01.png` → `talk_excited_12.png` | Recommended while that energetic line is playing. The sheet does not label this row as a loop. | Recommended about 8 fps. Not stored in the PNGs. |
| thinking | Working and not yet answering. The Planner reading history or similar dialogues, the Detector classifying, the Debrief mapping moves to rules. Also the Detector's "can't tell" pause before it recommends calling back. | 12 | `talk_thinking_01.png` → `talk_thinking_12.png` | Recommended while the step is still in progress. The sheet does not label this row as a loop. | Recommended about 8 fps. Not stored in the PNGs. |
| typing | Composing. The Planner writing the persona card, the Debrief writing the report, the Detector writing a Guardian verdict, or a text try-it reply being produced. | 11 | `talk_typing_01.png` → `talk_typing_11.png` | Recommended while text is still being produced. There is no `talk_typing_12.png`. | Recommended about 8 fps. Not stored in the PNGs. |

What the files themselves contain:

- **Frame order and counts** above are the extracted files, identical in `purple/`, `red/`, and `green/`.
- **Idle is marked LOOP** on the sprite sheet artwork. The other four rows are not marked LOOP on the sheet. Looping them is a recommendation so the cat does not freeze mid-gesture.
- **The talking GIFs store timing.** Each of the 12 frames has a delay of 13 centiseconds (130 ms), which is 100/13 ≈ 7.7 fps. The PNG sequences do not store this. Playing the PNGs at about 8 fps (125 ms per frame) is the recommended match. It is not metadata on the PNGs.
- **Canvas size** of each numbered frame is 170×145. The GIFs are 340×290. The sheets are 2172×724.

Poses, in filename order, are one cycle of the same cat:

- **idle** — seated, small shift in the body and tail.
- **talking** — seated speech, mouth and a small speech puff. This is the cycle in the talking GIFs.
- **excited** — a bigger speech, closed smiling eyes, larger motion and bursts.
- **thinking** — a paw comes up to the chin and a thought bubble appears, then the pose settles.
- **typing** — the cat sits at a laptop and the paws move on the keys. The cycle ends on frame 11.

## Sprite usage guidelines

These notes are for the later UI pass. Nothing in this section is implemented in the app.

**Pick the colorway from the personality, not from the call.** Purple is only the Drill Planner, red is only the Detector, green is only the Debrief. Keep that color for every animation while that personality is on screen. Do not recolor a folder to invent a fourth personality, and do not tint one colorway toward another. All three already exist.

**Pick the animation from the interaction state.**

| What the AI is doing | Folder |
|---|---|
| Waiting | `idle` |
| Speaking in a normal tone | `talk_standard` |
| Speaking with extra energy, without scolding | `talk_excited` |
| Reading, searching, scoring, or classifying | `talk_thinking` |
| Writing a card, a report, a verdict, or a text reply | `talk_typing` |

Corrections use `talk_standard` or `talk_thinking`. `talk_excited` is for a kept rule, a ready drill, or a clear next step. When the Detector is under 60% confidence, it is unsure: use `talk_thinking` or `talk_standard`, not `talk_excited`.

**Switch states by changing folders, then start at frame 01.** Do not carry frame 06 of thinking into frame 06 of talking. Do not cross-fade between colorways. The five folders are separate cycles that happen to share a canvas size.

**Keep the box the same size.** Every numbered frame is 170×145, so a fixed box stops the cat from jumping when the animation changes. Show it at 1× (170×145) or at an integer multiple. The talking GIF is the 2× size (340×290). Scale width and height together. Do not stretch, squash, or crop into the outline. If the image is scaled up, keep the pixels crisp (`image-rendering: pixelated` or `crisp-edges` in CSS) instead of blurring them.

**Leave the art as it was exported.**

- `full_sprite_sheet.png` has a transparent background, including soft edge pixels. Do not flatten that file or strip its alpha.
- The numbered PNGs and the talking GIFs are fully opaque. The field around the cat is black. Do not color-key that black out. The cat's body is black, and a black key will punch holes in it. On Tell's dark UI the black field can sit on a near-black page, but it is still a full rectangle. Do not crop it down to the outline.
- Do not redraw, recolor, add filters, or drop frames. The hoodie mark, the white outline, and the flat colors are the whole style.

**Keep the live call honest.** The user's phone screen during a drill stays free of a mascot color that could hint at scam, legit, or hijacked. The risk meter, if the red Detector is shown with it, stays on the presenter screen only, as the spec already requires.

## Developer examples

Examples only. These paths are not wired into the Next.js app.

Files in `public/` are served from the site root. A frame's URL is the path under `public/` with the `public` segment removed.

```text
/sprites/purple/talk_thinking/talk_thinking_01.png
/sprites/purple/talk_typing/talk_typing_03.png
/sprites/red/talk_standard/talk_standard_04.png
/sprites/red/idle/idle_01.png
/sprites/green/talk_excited/talk_excited_12.png
/sprites/green/talk_typing/talk_typing_11.png
/sprites/purple/full_sprite_sheet.png
/sprites/green/green_talking.gif
```

A later implementation can resolve a personality to a directory, then build the frame URL from the animation folder. The folder name and the filename prefix are the same, and typing stops at 11.

```ts
const mascotDirectory = {
  "Drill Planner agent": "purple",
  Detector: "red",
  "Debrief agent": "green",
} as const;

type Personality = keyof typeof mascotDirectory;
type Animation =
  | "idle"
  | "talk_standard"
  | "talk_excited"
  | "talk_thinking"
  | "talk_typing";

const frameCount: Record<Animation, number> = {
  idle: 8,
  talk_standard: 12,
  talk_excited: 12,
  talk_thinking: 12,
  talk_typing: 11,
};

function spriteFrame(personality: Personality, animation: Animation, frame: number) {
  const colorway = mascotDirectory[personality];
  const index = String(frame).padStart(2, "0");
  return `/sprites/${colorway}/${animation}/${animation}_${index}.png`;
}

// Drill Planner, first thinking frame
spriteFrame("Drill Planner agent", "talk_thinking", 1);
// → "/sprites/purple/talk_thinking/talk_thinking_01.png"

// Debrief, last excited frame
spriteFrame("Debrief agent", "talk_excited", frameCount.talk_excited);
// → "/sprites/green/talk_excited/talk_excited_12.png"
```
