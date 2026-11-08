'use client';
import React, { useEffect, useState } from 'react';
import type { PlayModel } from '../../lib/season/play/types';
export function signupLocation(returnTo: string) { return '/profile?returnTo=' + encodeURIComponent(returnTo); }
export function PlayCatalog({ model }: { model: PlayModel }) {
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{const start=Date.now();const timer=setInterval(()=>setElapsed(Date.now()-start),1000);return()=>clearInterval(timer);},[]);
 const now=new Date(model.serverNow).getTime()+elapsed;
 const remaining=model.season ? Math.max(0,Math.ceil((Date.parse(model.season.endsAt)-now)/1000)) : 0;
 const live=!!model.season && now>=Date.parse(model.season.startsAt) && remaining>0;
 const practice=!live || !model.nextCallScored;
 return <main className="play">
 <div className="play-heading"><h1>Choose a call.</h1><p>Fictional details. Real-world judgment.</p></div>
 <section className="play-status" aria-label="Season status">{model.season ? <><strong>B {model.blokbuks.toLocaleString('en-US')}</strong><p>{model.scoredCallsLeft} Scored calls left today</p><p>{model.season.name} · {now<Date.parse(model.season.startsAt)?'Starts '+new Date(model.season.startsAt).toLocaleString('en-US'):remaining?`${Math.floor(remaining/86400)}d ${Math.floor(remaining%86400/3600)}h ${Math.floor(remaining%3600/60)}m ${remaining%60}s left`:'Ended'}</p></> : <p>Season unavailable. Calls will be available when a Season is ready.</p>}</section>
 {model.season && practice && <p className="play-notice">Practice · 0 B</p>}
 {model.suggested && <p className="play-suggested">Suggested from your finished calls: <a href={'/play/'+encodeURIComponent(model.suggested.id)}>{model.suggested.category}</a></p>}
 <div className="play-catalog">{[...model.scenarios].sort((a,b)=>(a.id===model.suggested?.id?-1:b.id===model.suggested?.id?1:0)).map(row=><a key={row.id} href={'/play/'+encodeURIComponent(row.id)} aria-disabled={!model.season} onClick={event=>{if(!model.season) event.preventDefault();}}><h2>{row.category}</h2><p>{row.org}</p></a>)}</div>
 </main>;
}
export default function PlayLoader(){
 const [model,setModel]=useState<PlayModel|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setError('');fetch('/api/play',{signal:controller.signal,cache:'no-store'}).then(async response=>{if(response.status===401){window.location.assign(signupLocation('/play'));return;}const data=await response.json() as PlayModel & {error?:string};if(!response.ok)throw new Error(data.error);setModel(data);}).catch(error=>{if(!controller.signal.aborted)setError(error.message||'Play is unavailable. Try again.');});return()=>controller.abort();},[revision]);
 if(model)return <PlayCatalog model={model}/>;
 return <main className="play"><h1>Choose a call.</h1>{error?<div role="alert"><p>{error}</p><button onClick={()=>setRevision(n=>n+1)}>Try again</button></div>:<p role="status">Loading your Season…</p>}</main>;
}
