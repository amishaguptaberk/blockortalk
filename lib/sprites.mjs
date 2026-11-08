// Sprite helpers. Rules live in SPRITES_USAGE.md and docs/SPEC.md (Design direction).
export const mascotDirectory = {
  planner: 'purple',
  detector: 'red',
  debrief: 'green',
};

export const frameCount = {
  idle: 8,
  talk_standard: 12,
  talk_excited: 12,
  talk_thinking: 12,
  talk_typing: 11,
};

// Usage names (from the guide) -> folder names.
export const animationFolder = {
  idle: 'idle',
  talking: 'talk_standard',
  excited: 'talk_excited',
  thinking: 'talk_thinking',
  typing: 'talk_typing',
};

export const FRAME_MS = 125; // about 8 fps
export const IDLE_LOOPS = 2;
export const SPRITE_WIDTH = 170;
export const SPRITE_HEIGHT = 145;

/** Frame is 1-based, like the files. */
export function spriteFrame(personality, animation, frame) {
  const colorway = mascotDirectory[personality];
  const count = frameCount[animation];
  if (!colorway) throw new Error(`Unknown personality: ${personality}`);
  if (!count) throw new Error(`Unknown animation: ${animation}`);
  if (!Number.isInteger(frame) || frame < 1 || frame > count) throw new Error(`Frame ${frame} out of range for ${animation}`);
  return `/sprites/${colorway}/${animation}/${animation}_${String(frame).padStart(2, '0')}.png`;
}

export function spriteFrames(personality, animation) {
  return Array.from({ length: frameCount[animation] }, (_, i) => spriteFrame(personality, animation, i + 1));
}

/**
 * 1-based frame to show after `tick` frame intervals since the animation started.
 * Idle plays its loop twice, then holds frame 01. Other poses loop while `active`
 * (text is streaming / the system is working) and hold frame 01 otherwise.
 * Reduced motion is `animate: false`: always the still frame.
 */
export function frameAt(animation, tick, { active = true, animate = true } = {}) {
  const count = frameCount[animation];
  if (!count) throw new Error(`Unknown animation: ${animation}`);
  if (!animate || !active || tick < 0) return 1;
  if (animation === 'idle') return tick < count * IDLE_LOOPS ? (tick % count) + 1 : 1;
  return (tick % count) + 1;
}

/** True once nothing more will change, so the timer can stop. */
export function isSettled(animation, tick, { active = true, animate = true } = {}) {
  if (!animate || !active) return true;
  return animation === 'idle' && tick >= frameCount.idle * IDLE_LOOPS;
}
