# Issue #10 implementation review

Fixed point: `cc3d892db9566479152fb119108c4fa677418894` (main when the issue
branch was created). Scope: the presenter risk meter and the live-turn integration
it needs. The implementation does not close #10's remaining acceptance gates.

## Standards

- Fixed the bar's `transition: width` to use `scaleX`, following SPEC's
  “Only transform and opacity animate” rule. Reduced motion disables transitions.
- Replaced route tests asserting internal scheduling calls with assertions on
  public responses, following SPEC's seam-testing rule.
- Preserved approved fictional caller details while redacting real-looking card
  numbers and SSNs. The Challenge and voice webhook now share the existing
  redaction policy. A regression test covers fictional address/date preservation
  alongside card/SSN removal in the same caller turn.
- Resolved three maintenance judgments: live and final voice uploads share one
  serializer; caller/start-time comparisons share a call-identity helper; the
  detector and meter share one tactic whitelist.

No unresolved standards findings. Three documented violations and three
maintenance judgments were addressed.

## Spec

- Fixed resumed voice connections losing their first N messages: each connection
  has its own session ID and cumulative cursor, and stale uploads are rejected.
- Removed whole-day serial inference: two prefixes can score concurrently, with
  independent leases and current-call priority over archived backlog.
- Removed the three-prefix batch cutoff: workers drain available work, including
  turns arriving during inference. Persisted leases support recovery after a
  runtime interruption.
- Hid the Detector mascot between calls and after day completion, per SPEC.
- Gave the standard talking pose precedence on a meter jump, then resumed
  thinking if other scoring remains in flight.

No unresolved code findings from the review. Five implementation findings were
addressed. Acceptance remains incomplete: the latest hosted detector smoke call
took 3.37 seconds before polling, exceeding “updates within 3 seconds of each
turn.” Two-device text/browser-voice checks and projector legibility also remain
required. See [the presenter guide](PRESENTER.md).

Standards: 0 unresolved; Spec: 0 unresolved review code findings, with live timing
and manual acceptance checks still open.
