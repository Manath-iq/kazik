export type HapticEvent='press'|'selection'|'modal'|'bet'|'success'|'failure'|'spin'|'stop'|'crash'|'attack'|'damage'|'coin'|'finish';
const last=new Map<string,number>();let previous=-Infinity;
const cooldown:Partial<Record<HapticEvent,number>>={attack:900,damage:700,coin:1400,spin:1000,stop:1000,crash:1000,success:500,failure:500};
/** Event-based, opt-out, foreground only. Never vibrate per frame or per wheel sector. */
export function haptic(event:HapticEvent='press'){
 try{
  if(typeof window==='undefined'||typeof document==='undefined'||document.hidden||localStorage.getItem('sl-vibration')==='off')return;
  const feedback=window.Telegram?.WebApp?.HapticFeedback;if(!feedback)return;
  const now=performance.now();if(now-previous<90||now-(last.get(event)??-Infinity)<(cooldown[event]??120))return;
  const notify=event==='success'||event==='bet'?'success':event==='failure'||event==='crash'?'error':event==='finish'?'warning':null;
  if(notify&&feedback.notificationOccurred)feedback.notificationOccurred(notify);
  else if(event==='selection'&&feedback.selectionChanged)feedback.selectionChanged();
  else feedback.impactOccurred?.(event==='damage'||event==='crash'?'medium':event==='modal'?'soft':'light');
  last.set(event,now);previous=now;
 }catch{/* Desktop/old clients or blocked storage must never break an action. */}
}
export function initButtonFeedback(){
 const click=(event:MouseEvent)=>{if(!event.isTrusted)return;const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(!target||target.disabled||target.dataset.haptic==='off')return;haptic(target.hasAttribute('aria-pressed')?'selection':'press');};
 document.addEventListener('click',click,true);return ()=>document.removeEventListener('click',click,true);
}
