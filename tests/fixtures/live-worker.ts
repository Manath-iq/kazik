// Test-only entry: control time/outcomes through a subclass, never a public dev route.
import { CasinoRoom as Room } from '../../apps/api/src/live-casino';
import { app } from '../../apps/api/src/app';
import type { LiveGame,LiveRound } from '@street/shared';
export default app;
export class CasinoRoom extends Room{
 async fixture(game:LiveGame,phase:LiveRound['phase']='betting',point=100,number=7){
  const now=Date.now(),id=crypto.randomUUID(),start=phase==='betting'?now+10000:now-1000;
  await this.ctx.storage.put('room',{round:{id,game,sequence:1,phase,bettingEndsAt:start,startedAt:start,phaseEndsAt:phase==='betting'?start:game==='roulette'?start+5000:null},finishAt:phase==='betting'?start+10000:now+10000,point,number,recent:[]});
  await this.ctx.storage.setAlarm(now+10000);return id;
 }
 async transition(phase:LiveRound['phase']){
  const state=await this.ctx.storage.get<{round:LiveRound;finishAt:number}>('room');if(!state)throw Error('fixture missing');
  if(phase==='playing'){state.round.bettingEndsAt=state.round.startedAt=Date.now()-1000;state.round.phase='playing';state.round.phaseEndsAt=state.round.game==='crash'?null:Date.now()+5000;state.finishAt=Date.now()+10000;}
  else if(phase==='result'){state.round.phase='playing';state.finishAt=Date.now()-1;}
  else {state.round.phase='result';state.round.phaseEndsAt=Date.now()-1;}
  await this.ctx.storage.put('room',state);await this.ctx.storage.setAlarm(Date.now()+10);
 }
 async alarmNow(){await this.alarm();}
}
