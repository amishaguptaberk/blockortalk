'use client';

import { useState } from 'react';
import SpritePlayer, { type Animation, type Personality } from '../components/SpritePlayer';
import { Button, Card, DotFigure, Flip, Pill, Sheet, Stamp, Toast } from '../components/ui';

const personalities: Personality[] = ['planner', 'detector', 'debrief'];
const animations: Animation[] = ['idle', 'talking', 'excited', 'thinking', 'typing'];
const swatches = ['--bg', '--surface', '--ink', '--ink-muted', '--line', '--paper', '--purple', '--red', '--green'];

export default function Styleguide() {
  const [personality, setPersonality] = useState<Personality>('detector');
  const [animation, setAnimation] = useState<Animation>('idle');
  const [active, setActive] = useState(true);
  const [scale, setScale] = useState<1 | 2>(1);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(false);
  const [flipKey, setFlipKey] = useState(0);
  const [stampKey, setStampKey] = useState(0);

  return <main style={{ padding: 24, maxWidth: 1000, margin: 'auto', display: 'grid', gap: 32 }}>
    <header><h1 style={{ margin: 0 }}>Tell visual foundation</h1><p style={{ color: 'var(--ink-muted)' }}>Tokens, components, sprite player and motion. Dev only.</p></header>

    <section aria-labelledby="sg-colour"><h2 id="sg-colour">Colour tokens</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {swatches.map(name => <div key={name} style={{ width: 120 }}>
          <div style={{ height: 48, background: `var(${name})`, border: '1px solid var(--line)', borderRadius: 12 }} />
          <small>{name}</small>
        </div>)}
      </div>
    </section>

    <section aria-labelledby="sg-type"><h2 id="sg-type">Type</h2>
      <p>Body, 18 px system face. Primary text is white on black.</p>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <DotFigure>$1,000</DotFigure><DotFigure size="48px">0:42</DotFigure><DotFigure size="48px">RISK 87</DotFigure>
      </div>
    </section>

    <section aria-labelledby="sg-comp"><h2 id="sg-comp">Components</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Pill>CALL 2 OF 3</Pill><Pill>BLUEBONNET ONBOARDING</Pill><Pill>0:42</Pill>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Button>Probe</Button><Button variant="primary">Try it</Button><Button disabled>Disabled</Button>
      </div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 420, marginBottom: 16 }}>
        <Button large sublabel="They are who they say they are">Real</Button>
        <Button large sublabel="They are trying to trick me">Scam</Button>
        <Button large sublabel="I cannot tell yet">Unverified</Button>
      </div>
      <Card>A task slip or app tile sits on a card.</Card>
      <div style={{ marginTop: 16 }}><Card strong>The caller card uses the stronger outline.</Card></div>
    </section>

    <section aria-labelledby="sg-motion"><h2 id="sg-motion">Motion</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button onClick={() => { setToast(false); requestAnimationFrame(() => setToast(true)); }}>Show toast</Button>
        <Button onClick={() => setSheet(true)}>Open sheet</Button>
        <Button onClick={() => setStampKey(k => k + 1)}>Stamp</Button>
        <Button onClick={() => setFlipKey(k => k + 1)}>Flip cards</Button>
        {stampKey > 0 && <Stamp key={stampKey}>Booked</Stamp>}
      </div>
      <div key={flipKey} style={{ display: 'flex', gap: 12, marginTop: 16, perspective: 800 }}>
        {[0, 1, 2].map(i => <Flip key={i} index={i}><Card>Caller {i + 1}</Card></Flip>)}
      </div>
      {toast && <Toast>Your one-time code is 482913. Do not share it.</Toast>}
      <Sheet open={sheet} onClose={() => setSheet(false)} label="Example sheet">
        <h2 style={{ marginTop: 0 }}>Sheet</h2><p>Sheets enter at about 300 ms.</p>
        <Button onClick={() => setSheet(false)}>Close</Button>
      </Sheet>
    </section>

    <section aria-labelledby="sg-sprite"><h2 id="sg-sprite">Sprite player</h2>
      <SpritePlayer key={`${personality}-${animation}-${scale}`} personality={personality} animation={animation} active={active} scale={scale} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        {personalities.map(p => <Button key={p} aria-pressed={p === personality} variant={p === personality ? 'primary' : 'default'} onClick={() => setPersonality(p)}>{p}</Button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {animations.map(a => <Button key={a} aria-pressed={a === animation} variant={a === animation ? 'primary' : 'default'} onClick={() => setAnimation(a)}>{a}</Button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button aria-pressed={active} onClick={() => setActive(a => !a)}>{active ? 'Working: yes' : 'Working: no'}</Button>
        <Button onClick={() => setScale(s => (s === 1 ? 2 : 1))}>Scale {scale}x</Button>
      </div>
    </section>
  </main>;
}
