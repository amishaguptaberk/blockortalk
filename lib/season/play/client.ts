import type { PublicCall } from '../calls/types';
/** Server clock plus local elapsed time; the browser's wall clock may be wrong. */
export function playServerTime(serverNow: string, receivedAt: number, localNow: number) {
  return Date.parse(serverNow) + Math.max(0, localNow - receivedAt);
}
export async function resumePlayCall(storage: Pick<Storage, 'getItem' | 'removeItem'>, fetchCall: (url: string) => Promise<Response>): Promise<{ status:'none' } | {status:'retry'} | {status:'signed-out'} | {status:'resumed';call:PublicCall}> {
 const id=storage.getItem('tell-active-call');if(!id)return {status:'none'};
 try {
  const response=await fetchCall('/api/play/calls/'+encodeURIComponent(id));
  if(response.status===404){storage.removeItem('tell-active-call');return {status:'none'};}
  if(response.status===401)return {status:'signed-out'};
  if(!response.ok)return {status:'retry'};
  return {status:'resumed',call:(await response.json() as {call:PublicCall}).call};
 }catch{return {status:'retry'};}
}
