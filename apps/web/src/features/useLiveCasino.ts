import { useCallback,useEffect,useRef,useState } from 'react';
import type { LiveGame,LiveSnapshot,LiveEvent } from '@street/shared';
import { api,casinoSocketUrl } from '../app/api';

/** WebSocket pushes authoritative phases; local time is only a visual interpolation.
 * Suspended pages close sockets. Fresh state/ticket is mandatory on resume/reconnect.
 */
export function useLiveCasino(game:LiveGame){
 const [snapshot,setSnapshot]=useState<LiveSnapshot|null>(null),[connected,setConnected]=useState(false),[error,setError]=useState('');
 const offset=useRef(0),mounted=useRef(false),lastRound=useRef('');
 const accept=useCallback((next:LiveSnapshot)=>setSnapshot(old=>{
  if(!old)return next;
  if(old.round.sequence>next.round.sequence)return old;
  const rank={betting:0,playing:1,result:2};
  return old.round.id===next.round.id&&rank[old.round.phase]>rank[next.round.phase]?{...next,round:old.round,recent:old.recent}:next;
 }),[]);
 const sync=useCallback(async()=>{
  const before=Date.now(),state=await api<LiveSnapshot>(`/casino/live/${game}/state`);
  if(mounted.current){offset.current=state.serverNow-(before+Date.now())/2;accept(state);setError('');}
  return state;
 },[game,accept]);
 useEffect(()=>{
  let stopped=false,ws:WebSocket|null=null,retry:number|undefined,attempt=0,connecting=false,lastSeen=Date.now();mounted.current=true;setSnapshot(null);setConnected(false);lastRound.current='';
  const reconnect=()=>{if(stopped||document.hidden)return;clearTimeout(retry);retry=window.setTimeout(()=>void connect(),Math.min(10000,800*2**Math.min(attempt++,4)));};
  async function connect(){
   if(stopped||document.hidden||connecting||(ws&&ws.readyState<=1))return;connecting=true;
   try{
    const state=await sync();lastRound.current=`${state.round.id}:${state.round.phase}`;
    const {ticket}=await api<{ticket:string}>(`/casino/live/${game}/ticket`,{});
    if(stopped||document.hidden)return;
    const socket=new WebSocket(casinoSocketUrl(game,ticket));ws=socket;
    socket.onopen=()=>{if(!stopped&&ws===socket){attempt=0;lastSeen=Date.now();setConnected(true);setError('');}};
    socket.onmessage=event=>{
     if(stopped||ws!==socket)return;lastSeen=Date.now();if(event.data==='pong')return;
     try{
      const message=JSON.parse(event.data) as LiveEvent;if(message.type!=='round'||message.round.game!==game)return;
      offset.current=message.serverNow-Date.now();
      setSnapshot(old=>old&&old.round.sequence<=message.round.sequence?{...old,round:message.round,serverNow:message.serverNow,recent:message.recent,bet:old.bet?.round_id===message.round.id?old.bet:null}:old);
      const key=`${message.round.id}:${message.round.phase}`;
      if(lastRound.current!==key){lastRound.current=key;void sync().catch(()=>{});}
     }catch{/* Malformed frames cannot create bets or results. */}
    };
    socket.onclose=()=>{if(!stopped&&ws===socket){ws=null;setConnected(false);reconnect();}};
    socket.onerror=()=>socket.close();
   }catch(e){if(!stopped){setConnected(false);setError((e as Error).message);reconnect();}}
   finally{connecting=false;if(!stopped&&!document.hidden&&!ws)reconnect();}
  }
  const visibility=()=>{clearTimeout(retry);const old=ws;ws=null;old?.close();setConnected(false);if(!document.hidden)void connect();};
  document.addEventListener('visibilitychange',visibility);
  const heartbeat=window.setInterval(()=>{if(document.hidden)return;if(ws?.readyState===WebSocket.OPEN){if(Date.now()-lastSeen>35000){setConnected(false);ws.close();}else ws.send('ping');}},15000);
  void connect();
  return ()=>{stopped=true;mounted.current=false;clearTimeout(retry);clearInterval(heartbeat);document.removeEventListener('visibilitychange',visibility);ws?.close();};
 },[game,sync]);
 return {snapshot,setSnapshot:accept,connected,error,sync,offset};
}
