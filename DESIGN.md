---
name: Block or Talk
description: A paper landing and a black passbook for practice calls.
colors:
  landing-paper: "#efece6"
  landing-ink: "#141414"
  landing-dim: "#625f59"
  gradient-amber: "#ffb347"
  gradient-orange: "#ff8a3d"
  gradient-coral: "#ff5a5f"
  gradient-pink: "#ff3d8b"
  challenge-bg: "#000000"
  challenge-ink: "#f7f5ef"
  challenge-paper: "#eeeae1"
typography:
  landing-display:
    fontFamily: "Schibsted Grotesk, sans-serif"
    fontSize: "clamp(42px, 5.25vw, 92px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-.035em"
  landing-label:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: ".04em"
  challenge-display:
    fontFamily: "Sora, system-ui, sans-serif"
    fontWeight: 500
rounded:
  challenge-card: "16px"
  landing-frame: "0px"
spacing:
  mobile-edge: "16px"
  landing-nav-height: "52px"
---

# Block or Talk: the day as a passbook

A black field with warm-white type. The visual structure comes from a ledger and a conversation, with the exported cat sprites as the only live-call colour. Call identity never controls colour or motion.

Sora, self-hosted with its license, supplies the wordmark and display hierarchy. The system face carries readable body copy. DotGothic16, subset and self-hosted with its license, is reserved for measured quantities: money, time and codes. Font loading uses swap and system fallbacks.

One outlined caller surface anchors the board. The ledger and tasks are open, ruled records rather than additional boxes. The neutral companion belongs beside the ledger. On mobile the caller comes first and all four moves remain in a sticky bottom dock. Touch targets remain at least 44px tall.

The intro is a large, restrained two-line proposition beside the sprite, followed by the two concrete tasks and the choice of voice or text. The reveal continues with identity slips, evidence records, and labelled rule outcomes. No decorative gradients, neon, glass, background grids or unrelated illustration.

Motion communicates actual activity. Sprites retain their native canvas and colourways, pause offscreen and in hidden tabs, and use still frames for reduced motion. Earned stamps and reveal transitions use the shared motion foundation. Focus remains visible without jumping the page to the reply field.

## Front landing: paper and sprite display

The front page follows the supplied three-section reference: background #efece6, ink #141414, vertical guides at 17/50/83%, thin rules, fixed announcement and navigation, a right section rail, orange-to-pink conic frame accents, Schibsted Grotesk display type and IBM Plex Mono labels. Fonts are self-hosted from the supplied font sources, with their licenses.

A fixed Three.js 0.160.0 scene renders into reserved grid space in each landing section and carries a charcoal pedestal and the original opaque PNG frames on an unmodified black display. Scroll selects each section’s scene; the renderer follows its reserved bounds so the object never covers copy. The three scenes show the purple Planner, red Detector and green Debrief respectively; these are system roles, not caller trust indicators. The final panel presents the four actual practice rules instead of fictional testimonials. Every launch link leads to /challenge; operational diagnostics live at /health.

Mobile stacks the same 3D scene between the headline and supporting copy, simplifies navigation, and keeps the menu in document flow. Motion can be paused in the footer; OS reduced motion disables typing, carousel autoplay, floating, pointer parallax and spatial entrances. A static sprite display remains if WebGL cannot initialize. No caller details or user data are sent to the scene.

The conversation pane uses one shared palette for every caller: background #100e19, incoming bubbles #251e35 with #f1ecff text, player bubbles #143039 with #e0faff text, secondary copy #bdb0d7, primary action #cbb4ff, and focus/connection accent #a8e8ef. Speaker labels remain visible; colour never encodes caller trust. The voice orb shares the violet/cyan palette. Other challenge surfaces retain the black passbook treatment.
