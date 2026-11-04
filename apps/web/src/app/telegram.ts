type TelegramApp = {
 initData:string; version:string; ready:()=>void; expand:()=>void;
 isVersionAtLeast:(v:string)=>boolean; disableVerticalSwipes:()=>void; enableVerticalSwipes:()=>void;
 setHeaderColor:(color:string)=>void; setBackgroundColor:(color:string)=>void;
 viewportStableHeight:number; contentSafeAreaInset?:{top:number;bottom:number};
 onEvent:(event:string,fn:()=>void)=>void;offEvent:(event:string,fn:()=>void)=>void;
 BackButton:{show:()=>void;hide:()=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void};
 HapticFeedback?:{impactOccurred:(style:string)=>void};
};
declare global { interface Window { Telegram?: {WebApp:TelegramApp}; } }
export const tg=()=>window.Telegram?.WebApp;
export function initTelegram() {
 const app=tg();if(!app?.initData)return ()=>{};
 app.ready();app.expand();
 if(app.isVersionAtLeast('6.1')){app.setHeaderColor('#080B10');app.setBackgroundColor('#080B10');}
 const resize=()=>{
  if(app.viewportStableHeight)document.documentElement.style.setProperty('--app-height',`${app.viewportStableHeight}px`);
  document.documentElement.style.setProperty('--tg-safe-top',`${app.contentSafeAreaInset?.top??0}px`);
  document.documentElement.style.setProperty('--tg-safe-bottom',`${app.contentSafeAreaInset?.bottom??0}px`);
 };
 resize();app.onEvent('viewportChanged',resize);app.onEvent('contentSafeAreaChanged',resize);
 return ()=>{app.offEvent('viewportChanged',resize);app.offEvent('contentSafeAreaChanged',resize);};
}
export function haptic() { if(localStorage.getItem('sl-vibration')!=='off')tg()?.HapticFeedback?.impactOccurred('light'); }
