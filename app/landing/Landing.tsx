'use client';

import { useEffect, useRef, useState } from 'react';
import SpriteScene from './SpriteScene';
import AgentPhases from './AgentPhases';
import './landing.css';

const prompts = [
  'A caller knows your name and your bank. Does that make them real?',
  'Your new employer asks for an equipment deposit. What would you say?',
  'Your bank calls for a one-time code. Do you share it or call back?',
  'A recruiter offers you an interview. How do you check it is real?',
];
const tabs = ['Probe the caller', 'Protect your details', 'Verify another way', 'Disconnect safely', 'Make your decision', 'Check the evidence', 'Protect your money', 'Finish both tasks', 'Meet your companions', 'Try the Challenge'];
const rules = [
  {title:'Protect your details',quote:'Never share codes, PINs, passwords or identity details with a caller.',detail:'Use only the fictional details in your practice day.'},
  {title:'Hear the pressure',quote:'Urgency, secrecy, or an unusual way to pay. Pressure is the tell.',detail:'Slow down. You can end the call and check another way.'},
  {title:'Check the identity',quote:'Knowing your details doesn’t prove who’s calling.',detail:'A familiar name or a recent purchase is not proof.'},
  {title:'Make the callback',quote:'Hang up. Call back on a number you already have.',detail:'Use the fictional bank app or company portal to verify.'},
];
const sections=['intro','practice','rules'] as const;
function Arrow({direction='right'}:{direction?:'right'|'left'|'down'}){const path=direction==='down'?'M12 4v15M5 13l7 7 7-7':direction==='left'?'M20 12H5M11 5l-7 7 7 7':'M4 12h15M13 5l7 7-7 7';return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={path}/></svg>;}
function Mark(){return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><defs><linearGradient id="tell-mark" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#ffb347"/><stop offset="1" stopColor="#ff3d8b"/></linearGradient></defs><path d="M26 10V8a5 5 0 0 0-5-5H10a6 6 0 0 0-6 6v14a5 5 0 0 0 5 5h13a4 4 0 0 0 4-4v-2" stroke="url(#tell-mark)" strokeWidth="2"/><circle cx="12" cy="15" r="2" fill="currentColor"/><circle cx="21" cy="15" r="2" fill="currentColor"/></svg>;}

export default function Landing(){
  const tabWindow=useRef<HTMLDivElement>(null);
  const [section,setSection]=useState(0);
  const [scrolled,setScrolled]=useState(false);
  const [dismissed,setDismissed]=useState(false);
  const [menu,setMenu]=useState(false);
  const [paused,setPaused]=useState(false);
  const [reduced,setReduced]=useState(true);
  const [promptIndex,setPromptIndex]=useState(0);
  const [typed,setTyped]=useState(prompts[0]);
  const [tab,setTab]=useState(0);
  const [rule,setRule]=useState(0);
  const motion= !paused&&!reduced;
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);
    const scroll=()=>{setScrolled(scrollY>40);setSection(sections.reduce((active,id,index)=>{const element=document.getElementById(id);return element && element.getBoundingClientRect().top<=innerHeight*.5?index:active;},0));};scroll();window.addEventListener('scroll',scroll,{passive:true});
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(false);};window.addEventListener('keydown',escape);
    return()=>{media.removeEventListener('change',update);window.removeEventListener('scroll',scroll);window.removeEventListener('keydown',escape);};
  },[]);
  useEffect(()=>{
    if(!motion){setTyped(prompts[promptIndex]);return;}
    let length=0,deleting=false,timeout:ReturnType<typeof setTimeout>;
    const tick=()=>{
      if(document.hidden){timeout=setTimeout(tick,250);return;}
      length=deleting?Math.max(0,length-2):Math.min(prompts[promptIndex].length,length+1);setTyped(prompts[promptIndex].slice(0,length));
      if(!deleting&&length===prompts[promptIndex].length){deleting=true;timeout=setTimeout(tick,2600);}
      else if(deleting&&length===0){timeout=setTimeout(()=>setPromptIndex(i=>(i+1)%prompts.length),250);}
      else timeout=setTimeout(tick,deleting?14:38);
    };timeout=setTimeout(tick,38);return()=>clearTimeout(timeout);
  },[motion,promptIndex]);
  useEffect(()=>{
    if(!motion||section!==1)return;
    const timer=setInterval(()=>{if(!document.hidden)setTab(t=>(t+1)%tabs.length);},2400);return()=>clearInterval(timer);
  },[motion,section]);
  useEffect(()=>{
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){(entry.target as HTMLElement).dataset.seen='true';observer.unobserve(entry.target);}}),{threshold:.15});
    document.querySelectorAll('.nova-section').forEach(element=>observer.observe(element));
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const strip=tabWindow.current;
    const selected=strip?.querySelector<HTMLButtonElement>('button.current');
    if(strip&&selected)strip.scrollTo({left:selected.offsetLeft-strip.offsetLeft,behavior:motion?'smooth':'instant'});
  },[tab,motion]);
  const closeTop=dismissed||scrolled;
  return <main className={`nova ${closeTop?'top-hidden':''} ${motion?'motion-on':''}`}>
    <a className="nova-skip" href="#intro">Skip to content</a>
    <div className="nova-guides" aria-hidden="true"><i/><i/><i/></div>
    <SpriteScene paused={!motion}/>
    <div className="nova-announcement"><a href="/challenge"><strong>New:</strong> Meet Block or Talk — Three calls. Two stories. Who gets your trust? <span>↗</span></a><button aria-label="Dismiss announcement" onClick={()=>setDismissed(true)}>×</button></div>
    <header className="nova-nav">
      <a className="nova-logo" href="#intro" aria-label="Block or Talk home"><Mark/><span>BLOCK OR TALK</span></a>
      <nav className="nova-menu" aria-label="Main navigation"><a href="/dashboard">Dashboard</a><a href="/dashboard?view=Leaderboard">Leaderboard</a><a href="/dashboard?view=Scenarios">Scenarios</a><a href="/dashboard?view=News">News</a></nav>
      <a className="nova-pad" href="/challenge">Challenge <Arrow/></a>
      <div className="nova-launch-cell"><a className="nova-launch" href="/dashboard"><span aria-hidden="true">••</span> OPEN DASHBOARD <Arrow/></a></div>
    </header>
    <aside className="nova-rail" aria-label="Page sections"><div className="nova-rail-track"><div className="nova-dots" aria-hidden="true">{Array.from({length:14},(_,i)=><i key={i}/>)}</div><a className="nova-rail-label" href={`#${sections[section]}`} style={{top:`${section*31}%`}}><span className="nova-dial"/>{['INTRO','PRACTICE','RULES'][section]}</a>{sections.map((s,i)=><a className="nova-rail-hit" key={s} href={`#${s}`} aria-label={`Go to ${s}`} aria-current={section===i?'location':undefined} style={{top:`${i*31}%`}}/>)}</div><button className="nova-menu-toggle" aria-expanded={menu} aria-controls="nova-drawer" onClick={()=>setMenu(v=>!v)}><span aria-hidden="true">≡</span> MENU</button></aside>
    {menu&&<nav id="nova-drawer" className="nova-drawer" aria-label="Section menu"><button onClick={()=>setMenu(false)} aria-label="Close menu">×</button>{sections.map(s=><a key={s} href={`#${s}`} onClick={()=>setMenu(false)}>{s==='practice'?'The Challenge':s==='rules'?'The four rules':'Introduction'}<Arrow/></a>)}<a href="/dashboard">Dashboard<Arrow/></a><a href="/dashboard?view=Leaderboard">Leaderboard<Arrow/></a><a href="/dashboard?view=Scenarios">Scenarios<Arrow/></a><a href="/dashboard?view=News">News<Arrow/></a><a href="/challenge">Challenge<Arrow/></a></nav>}
    <section id="intro" className="nova-section nova-intro" aria-labelledby="nova-title">
      <div className="nova-scene-slot" data-scene-slot="0" aria-hidden="true"><img className="nova-slot-fallback" src="/sprites/purple/idle/idle_01.png" width="340" height="290" alt=""/></div>
      <div className="nova-prompt rv"><div className="nova-quote-tab" aria-hidden="true">“</div><div className="nova-prompt-box" aria-label={prompts[promptIndex]}><span aria-hidden="true">{typed}<i className="nova-caret"/></span></div><p className="nova-next-prompt">{prompts[(promptIndex+1)%prompts.length]}</p></div>
      <div className="nova-intro-rule" aria-hidden="true"/>
      <ul className="nova-features rv"><li>Practice real decisions</li><li>Protect your details</li><li>Verify before trust</li><li>Find your next move</li></ul>
      <div className="nova-title-block rv"><p>EVERY CALL IS A CHOICE</p><h1 id="nova-title"><span className="nova-title-line cut">Every scam</span>{' '}<span className="nova-title-line">has a tell.</span></h1></div>
      <p className="nova-subline rv">Practice the call.<br/>Keep the lesson.</p>
      <a className="nova-scroll" href="#practice">SCROLL <span><Arrow direction="down"/></span></a><div className="nova-bottom-rule" aria-hidden="true"/>
    </section>
    <section id="practice" className="nova-section nova-product" aria-labelledby="nova-product-title">
      <div className="nova-scene-slot" data-scene-slot="1" aria-hidden="true"/>
      <div className="nova-tab-window" ref={tabWindow}><div className="nova-tabs">{tabs.map((label,i)=><button key={label} className={i===tab?'current':''} onClick={()=>setTab(i)} aria-pressed={i===tab}><span>{String(i+1).padStart(2,'0')}</span>{label}</button>)}</div></div>
      <div className="nova-product-copy rv"><span className="nova-small-dots" aria-hidden="true">··</span><h2 id="nova-product-title"><span>Your judgment.</span><br/>Under pressure.</h2><p>Start with $1,000 and two tasks.<br/>Three callers want your trust.<br/>What will you do?</p><a className="nova-text-link" href="/challenge">Play the Challenge <Arrow/></a></div>
      <div id="companions" className="nova-companion-note rv"><span>THREE SYSTEMS. ONE PRACTICE DAY.</span><p>Purple plans. Red detects.<br/>Green explains the calls.</p><small>AI practice callers. Fictional details only.</small></div>
    </section>
    <section id="rules" className="nova-section nova-reviews" aria-labelledby="nova-rules-title">
      <div className="nova-scene-slot" data-scene-slot="2" aria-hidden="true"/>
      <header className="nova-review-strip"><h2 id="nova-rules-title">THE RULES</h2><span className="nova-bracket">{String(rule+1).padStart(2,'0')}</span><span className="nova-review-dot"/><span>{rules[rule].title}</span><span className="nova-review-role">TAKE IT INTO YOUR NEXT CALL</span></header>
      <div className="nova-quote-content rv" key={rule}><blockquote>{rules[rule].quote}</blockquote><p>{rules[rule].detail}</p><a className="nova-text-link" href="/challenge">Try for yourself <Arrow/></a></div>
      <p className="nova-ghost" aria-hidden="true">{rules[(rule+1)%rules.length].quote}</p>
      <div className="nova-review-arrows"><button aria-label="Previous rule" onClick={()=>setRule(i=>(i+rules.length-1)%rules.length)}><Arrow direction="left"/></button><button aria-label="Next rule" onClick={()=>setRule(i=>(i+1)%rules.length)}><Arrow/></button><span>{String(rule+1).padStart(2,'0')} / 04</span></div>
    </section>
    <section className="landing-team" aria-labelledby="landing-team-title">
      <header><h2 id="landing-team-title">Meet your practice team.</h2><p>Three companions. A little more confidence with every call.</p></header>
      <AgentPhases paused={!motion} />
      <div className="landing-team-grid">
        <article><h3>Planner · Prepare your day</h3><p>Start with three callers, two tasks, and fictional details to protect. Your practice day gives you a concrete goal.</p><p>Scene → Tasks → Your first call</p></article>
        <article><h3>Detector · Examine the evidence</h3><p>After your decisions, the detector checks your call transcripts for scam signals. The reveal shows its evidence and uncertainty.</p><p>Transcript → Signals → Evidence</p></article>
        <article><h3>Debrief · Learn your next move</h3><p>See how your choices connect to the four rules, understand the outcome, and rewind the costliest decision to try again.</p><p>Your choices → Explanation → Retry</p></article>
      </div>
      <a className="nova-text-link" href="/dashboard">Open your practice dashboard <Arrow/></a>
    </section>
    <footer className="nova-footer"><a href="/dashboard">BLOCK OR TALK · EVERY SCAM HAS A TELL <Arrow/></a><a href="/profile">Player profile</a><a href="/credits">Credits</a><span>2026</span><button aria-pressed={paused} onClick={()=>setPaused(v=>!v)}>{paused?'Resume motion':'Pause motion'}</button></footer>
  </main>;
}
