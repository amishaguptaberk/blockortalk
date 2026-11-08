import { expect,test } from 'vitest';
import { resumePlayCall, playServerTime } from '../lib/season/play/client';
test('a temporary resume failure preserves the call and retry recovers it',async()=>{
 const values=new Map([['tell-active-call','owned-call']]);const storage={getItem:(key:string)=>values.get(key)??null,removeItem:(key:string)=>{values.delete(key);}};
 const unavailable=await resumePlayCall(storage,async()=>new Response('{}',{status:503}));
 expect(unavailable).toMatchObject({status:'retry'});expect(storage.getItem('tell-active-call')).toBe('owned-call');
 const recovered=await resumePlayCall(storage,async()=>Response.json({call:{id:'owned-call'}}));expect(recovered).toEqual({status:'resumed',call:{id:'owned-call'}});
});
test('confirmed missing calls clear the pointer, while browser clock skew does not alter server time',async()=>{
 const storage={getItem:()=> 'missing',removeItem:()=>{removed=true;}};let removed=false;
 expect(await resumePlayCall(storage,async()=>new Response('{}',{status:404}))).toEqual({status:'none'});expect(removed).toBe(true);
 expect(playServerTime('2026-11-08T18:00:00Z',5000,8000)).toBe(Date.parse('2026-11-08T18:00:03Z'));
});
