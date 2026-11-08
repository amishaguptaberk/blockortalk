'use client';

import { useEffect, useState } from 'react';

/** Captured at rehearsal and saved here by hand (docs/STAGE.md); it is not generated. */
export const CLIP_PATH = '/stage/rehearsal-yui-ren.mp4';

export default function RecordedClip() {
  // Checked after mount: a media error during hydration would fire before React could hear it.
  const [clip, setClip] = useState<'checking' | 'ready' | 'missing'>('checking');
  useEffect(() => {
    let live = true;
    fetch(CLIP_PATH, { method: 'HEAD' }).then(response => { if (live) setClip(response.ok ? 'ready' : 'missing'); }).catch(() => { if (live) setClip('missing'); });
    return () => { live = false; };
  }, []);
  return <figure className="stage-clip">
    {/* The label sits on the frame itself, so the audience never takes the clip for a live call. */}
    <div className="stage-clip-frame">
      {clip === 'missing'
        ? <p className="stage-clip-missing" role="status">No rehearsal recording yet. Save the 30-second clip of Yui and Ren as <code>public{CLIP_PATH}</code>.</p>
        : clip === 'ready' && <video src={CLIP_PATH} controls playsInline preload="auto" onError={() => setClip('missing')} aria-label="Recorded rehearsal: Yui and Ren calls" />}
      <span className="stage-recorded">Recorded</span>
    </div>
    <figcaption>Recorded at rehearsal · Yui and Ren · the live call follows</figcaption>
  </figure>;
}
