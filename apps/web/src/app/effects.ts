import { useSyncExternalStore } from 'react';
import { shouldPlayEffects } from '../effects/catalog';

const event='sl-effects-change';
export function effectsPreference(){try{return localStorage.getItem('sl-effects')!=='off';}catch{return true;}}
export function reducedMotion(){return typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
export function effectsAllowed(){return shouldPlayEffects(effectsPreference(),reducedMotion(),typeof document!=='undefined'&&document.visibilityState==='visible');}
export function setEffectsPreference(enabled:boolean){try{localStorage.setItem('sl-effects',enabled?'on':'off');}catch{/* A blocked WebView storage must not break play. */}window.dispatchEvent(new Event(event));}
export function subscribeEffects(listener:()=>void){
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');
 window.addEventListener(event,listener);window.addEventListener('storage',listener);media.addEventListener('change',listener);document.addEventListener('visibilitychange',listener);
 return ()=>{window.removeEventListener(event,listener);window.removeEventListener('storage',listener);media.removeEventListener('change',listener);document.removeEventListener('visibilitychange',listener);};
}
function snapshot(){return `${effectsPreference()}:${reducedMotion()}`;}
export function useEffectsSettings(){const value=useSyncExternalStore(subscribeEffects,snapshot,()=> 'true:false');return {enabled:value.startsWith('true:'),reduced:value.endsWith(':true')};}
