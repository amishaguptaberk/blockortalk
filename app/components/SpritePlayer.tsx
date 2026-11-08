'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FRAME_MS, SPRITE_HEIGHT, SPRITE_WIDTH, animationFolder, frameAt, isSettled, spriteFrame, spriteFrames,
  type Animation, type Personality,
} from '../../lib/sprites.mjs';

export type { Animation, Personality };

const names: Record<Personality, string> = { planner: 'Drill Planner', detector: 'Detector', debrief: 'Debrief agent' };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

type Props = {
  personality: Personality;
  animation: Animation;
  /** True only while the system is working / text is streaming. Idle ignores it. */
  active?: boolean;
  /** 1x on the board and presenter screen; 2x only for the reveal's hero moment. */
  scale?: 1 | 2;
};

/**
 * Plays the exported PNG frames at about 8 fps. Changing personality or animation
 * restarts at frame 01. Idle plays twice then holds frame 01; talk poses loop while
 * `active` and hold frame 01 otherwise. Reduced motion shows a still frame.
 * The board owns placement; the pose reflects activity, never caller trustworthiness.
 */
export default function SpritePlayer({ personality, animation, active = true, scale = 1 }: Props) {
  const folder = animationFolder[animation];
  const reduced = usePrefersReducedMotion();
  const tile = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false));
    if (tile.current) observer.observe(tile.current);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const animate = !reduced && visible && pageVisible;
  const key = `${personality}/${folder}`;
  const [run, setRun] = useState({ key, tick: 0 });
  const tick = run.key === key ? run.tick : 0; // a new pose starts at frame 01 immediately

  useEffect(() => {
    spriteFrames(personality, folder).forEach(src => { new Image().src = src; });
  }, [personality, folder]);

  useEffect(() => {
    setRun({ key, tick: 0 });
    if (isSettled(folder, 0, { active, animate })) return;
    let current = 0;
    const timer = window.setInterval(() => {
      current += 1;
      setRun({ key, tick: current });
      if (isSettled(folder, current, { active, animate })) window.clearInterval(timer);
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [key, folder, active, animate]);

  const frame = frameAt(folder, tick, { active, animate });
  return <span ref={tile} className="ui-sprite-tile">
    <img
      className="ui-sprite"
      src={spriteFrame(personality, folder, frame)}
      width={SPRITE_WIDTH * scale}
      height={SPRITE_HEIGHT * scale}
      alt={`${names[personality]}, ${animation}`}
      draggable={false}
    />
  </span>;
}
