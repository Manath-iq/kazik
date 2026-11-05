type Insets = {top:number;bottom:number;left:number;right:number};
export type InvoiceStatus = 'paid'|'cancelled'|'failed'|'pending';
type TelegramApp = {
 initData:string; version:string; ready:()=>void; expand:()=>void;
 isVersionAtLeast:(v:string)=>boolean; disableVerticalSwipes:()=>void; enableVerticalSwipes:()=>void;
 setHeaderColor:(color:string)=>void; setBackgroundColor:(color:string)=>void;
 viewportStableHeight:number; contentSafeAreaInset?:Partial<Insets>;safeAreaInset?:Partial<Insets>;
 isFullscreen?:boolean;requestFullscreen?:()=>void;
 openInvoice?:(url:string,callback:(status:InvoiceStatus)=>void)=>void;
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
  for(const side of ['top','bottom','left','right'] as const){
   document.documentElement.style.setProperty(`--sl-system-safe-${side}`,`${Math.max(0,app.safeAreaInset?.[side]??0)}px`);
   document.documentElement.style.setProperty(`--sl-content-safe-${side}`,`${Math.max(0,app.contentSafeAreaInset?.[side]??0)}px`);
  }
  document.documentElement.dataset.telegramFullscreen=String(app.isFullscreen===true);
  };
 const events=['viewportChanged',...(app.isVersionAtLeast('8.0')?['safeAreaChanged','contentSafeAreaChanged','fullscreenChanged','fullscreenFailed']:[])];
 resize();for(const event of events)app.onEvent(event,resize);
 // Не используем browser requestFullscreen: это Telegram WebView API, не DOM fullscreen.
 // Один запрос при запуске; выход пользователя не вызывает навязчивый повторный вход.
 if(app.isVersionAtLeast('8.0')&&!app.isFullscreen){try{app.requestFullscreen?.();}catch{/* Старый/неподдерживаемый клиент остаётся в expand. */}}
 return ()=>{for(const event of events)app.offEvent(event,resize);};
}
export function canOpenInvoice(){const app=tg();return Boolean(app?.initData&&app.isVersionAtLeast('6.1')&&app.openInvoice);}
export function openStarInvoice(url:string,onClose:(status:InvoiceStatus)=>void){
 const app=tg();if(!canOpenInvoice()||!app?.openInvoice)throw new Error('Для оплаты открой игру в актуальном Telegram.');
 const link=new URL(url);if(link.origin!=='https://t.me'||!/^\/(?:\$|invoice\/)[A-Za-z0-9_=-]+$/.test(link.pathname))throw new Error('Сервер вернул неверную ссылку счёта.');
 app.openInvoice(url,onClose);
}
export function haptic() { if(localStorage.getItem('sl-vibration')!=='off')tg()?.HapticFeedback?.impactOccurred('light'); }
