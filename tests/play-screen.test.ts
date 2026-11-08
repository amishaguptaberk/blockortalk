import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PlayCatalog, signupLocation } from '../app/play/PlayCatalog';
import { scenarioCatalog } from '../lib/season/scenarios/catalog';
import { CallScreen } from '../app/play/[id]/CallScreen';
import type { PublicCall } from '../lib/season/calls/types';
export const call: PublicCall = { id:'c', label:'AI practice caller', scenario:{id:'bank',category:'Bank fraud alert',org:'Corvanta Bank',card:{name:'Alex Practice',facts:['Fictional account 2048'],ownApp:{title:'Your Corvanta app',facts:['Use your saved contact.']}},secrets:[{label:'Practice code',value:'8302'}]},turns:[{role:'caller',text:'An AI practice call.',step:1}],phase:'call',replies:0,startedAt:'2026-11-08T18:00:00Z',serverNow:'2026-11-08T18:00:00Z',scored:false,callsLeft:0 };
test('Play presents ten Category and org cards and marks practice before starting', () => {
  const html = renderToStaticMarkup(createElement(PlayCatalog,{ model:{ scenarios:Array.from({length:10},(_,i)=>({id:String(i),category:'Bank fraud alert',org:'Corvanta Bank'})),blokbuks:250,scoredCallsLeft:0,nextCallScored:false,season:{id:"s",name:"Season 1",startsAt:"2026-11-01T00:00:00Z",endsAt:"2026-11-10T00:00:00Z",status:"live"},serverNow:call.startedAt } }));
  expect(html.match(/href="\/play\//g)).toHaveLength(10); expect(html).toContain('0 Scored calls left today'); expect(html).toContain('Practice · 0 B'); expect(html).toContain('B 250'); expect(html).not.toContain('8302');
});
test('Play lists every catalog Category, including the training-type additions, without secrets', () => {
  const html = renderToStaticMarkup(createElement(PlayCatalog, { model: { scenarios: scenarioCatalog.map(({ id, category, org }) => ({ id, category, org })), blokbuks: 250, scoredCallsLeft: 5, nextCallScored: true, season: { id: 's', name: 'Season 1', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T00:00:00Z', status: 'live' }, serverNow: call.startedAt } }));
  expect(html.match(/href="\/play\//g)).toHaveLength(scenarioCatalog.length);
  for (const name of ['Refund or billing error', 'Insurance policy check', 'Subscription or sales call', 'Wrong number']) expect(html).toContain(name);
  expect(html).not.toContain('8211');
  expect(html).not.toContain('Practice protection code');
});
test('the call has a neutral identity, fictional card, secrets, editable reply and own app', () => {
 const html=renderToStaticMarkup(createElement(CallScreen,{scenarioId:'bank',initialCall:call}));
 for(const text of ['AI practice caller','Alex Practice','8302','Open your own app','Type your reply','End call','Practice · 0 B']) expect(html).toContain(text);
 expect(html).not.toContain('caller-link');
});
test('a suggestion from finished calls is named and listed first', () => {
  const html = renderToStaticMarkup(createElement(PlayCatalog, { model: { scenarios: [{ id: 'bank', category: 'Bank fraud alert', org: 'Puffinvale Bank' }, { id: 'delivery', category: 'Delivery or customs fee', org: 'Mossparcel' }], blokbuks: 0, scoredCallsLeft: 5, nextCallScored: true, season: { id: 's', name: 'Season 1', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T00:00:00Z', status: 'live' }, serverNow: call.startedAt, suggested: { id: 'delivery', category: 'Delivery or customs fee' } } }));
  expect(html).toContain('Suggested from your finished calls');
  expect(html.indexOf('/play/delivery')).toBeLessThan(html.indexOf('/play/bank'));
});
test('a missing Season keeps personal totals absent and calls unavailable',()=>{
 const html=renderToStaticMarkup(createElement(PlayCatalog,{model:{scenarios:[],blokbuks:0,scoredCallsLeft:5,nextCallScored:false,season:null,serverNow:call.startedAt}}));
 expect(html).toContain('Season unavailable');expect(html).not.toContain('B 0');
});
test('ended calls expose one-tap Verdicts and completed calls expose a neutral integration boundary',()=>{
 const html=renderToStaticMarkup(createElement(CallScreen,{scenarioId:'bank',initialCall:{...call,phase:'verdict'}}));
 for(const verdict of ['Real','Scam','Unverified'])expect(html).toContain('>'+verdict+'</button>');expect(html).not.toContain('Type your reply');
 const complete=renderToStaticMarkup(createElement(CallScreen,{scenarioId:'bank',initialCall:{...call,phase:'complete',result:{}}}));expect(complete).toContain('Your Verdict was saved');expect(complete).not.toContain('rank');
});
test('a caller link uses its own neutral control, distinct from the own-app control',()=>{
 const html=renderToStaticMarkup(createElement(CallScreen,{scenarioId:'bank',initialCall:{...call,callerLink:{href:'https://example.invalid'}}}));
 expect(html).toContain('Open caller’s link');expect(html).toContain('Open your own app');
});
test('reply controls give immediate access to fictional context and match the server text limit',()=>{
 const html=renderToStaticMarkup(createElement(CallScreen,{scenarioId:'bank',initialCall:call}));
 expect(html).toContain('maxLength="1000"');expect(html).toContain('href="#play-fictional-card"');expect(html.indexOf('View fictional card and fake secrets')).toBeLessThan(html.indexOf('Type your reply'));
});
test('signup return intent targets the profile route supplied by the shared shell',()=>{
 expect(signupLocation('/play/bank')).toBe('/profile?returnTo=%2Fplay%2Fbank');
});
test('Play surfaces leave branding to the shared shell and keep call wayfinding local',()=>{
 const catalog=renderToStaticMarkup(createElement(PlayCatalog,{model:{scenarios:[],blokbuks:0,scoredCallsLeft:5,nextCallScored:false,season:null,serverNow:call.startedAt}}));
 expect(catalog).not.toContain('TELL');
 const screen=renderToStaticMarkup(createElement(CallScreen,{scenarioId:'bank',initialCall:call}));
 expect(screen).toContain('Back to calls');expect(screen).not.toContain('TELL · Calls');
});
