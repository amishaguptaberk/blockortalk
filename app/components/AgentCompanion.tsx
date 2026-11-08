'use client';

import { useEffect, useState } from 'react';
import { frameCount, mascotDirectory, type Personality } from '../../lib/sprites.mjs';
import { poseFolder, stateInputs, type Companion } from '../../lib/agents/machine.ts';
import './agent-companion.css';

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
  companion: Companion;
  /** 1× beside the call. 2× only for the selected landing sprite. */
  scale?: 1 | 2;
  quiet?: boolean;
  /** Holds a still frame. The landing pause control and the mute button both use this. */
  still?: boolean;
  tone?: 'ink' | 'paper';
  compact?: boolean;
  showMute?: boolean;
  showCopy?: boolean;
};

export default function AgentCompanion({ companion, scale = 1, quiet = false, still: held = false, tone = 'ink', compact = false, showMute = false, showCopy = true }: Props) {
  const folder = poseFolder(companion.pose);
  const reduced = usePrefersReducedMotion();
  const [muted, setMuted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [entering, setEntering] = useState(true);
  const [frame, setFrame] = useState(1);
  const still = quiet || held || muted || reduced || !visible;
  const count = frameCount[folder];
  const color = mascotDirectory[companion.personality];
  const index = String(still ? 1 : frame).padStart(2, '0');
  const src = `/sprites/cutout/${color}/${folder}/${folder}_${index}.png`;

  useEffect(() => { setFrame(1); setEntering(true); const timer = window.setTimeout(() => setEntering(false), 300); return () => window.clearTimeout(timer); }, [companion.personality]);

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (still) return;
    const once = companion.pose === 'success' || companion.pose === 'concerned';
    const ms = folder === 'idle' ? 220 : 125;
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      if (once && tick >= count) { setFrame(1); window.clearInterval(timer); return; }
      setFrame((tick % count) + 1);
    }, ms);
    return () => window.clearInterval(timer);
  }, [still, folder, count, companion.pose, companion.personality]);

  const inputs = stateInputs(companion.state);
  const confirming = companion.state === 'success' || companion.state === 'concerned';
  return <figure
    className={`agent-companion${quiet ? ' is-quiet' : ''}${compact ? ' is-compact' : ''}${entering && !reduced && !muted ? ' is-entering' : ''}${confirming && !reduced && !muted ? ' is-confirming' : ''}`}
    data-tone={tone}
    data-state={companion.state}
    data-pose={companion.pose}
    data-inputs={Object.entries(inputs).filter(([, on]) => on).map(([name]) => name).join(' ')}
  >
    <span className="agent-stage">
      <img src={src} width={170 * scale} height={145 * scale} style={{ width: 170 * scale, height: 145 * scale }} alt={`${names[companion.personality]}, ${companion.pose}`} draggable={false} />
    </span>
    {showCopy && <figcaption className="agent-copy">
      <p className="agent-message" aria-live="polite">{companion.message}</p>
      {companion.exchange && <p className="agent-exchange">{companion.exchange}</p>}
      {companion.evidence && companion.evidence !== companion.message && <p className="agent-evidence">{companion.evidence}</p>}
      {companion.outcome && <p className="agent-outcome">{companion.outcome}</p>}
      {companion.skill && <p className="agent-skill">{companion.skill}</p>}
    </figcaption>}
    {showMute && <button type="button" className="agent-mute" aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? 'Unmute companion' : 'Mute companion'}</button>}
  </figure>;
}
