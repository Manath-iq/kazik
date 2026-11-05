import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { initTelegram,openStarInvoice,canOpenInvoice } from '../apps/web/src/app/telegram';

function fixture(version='8.0'){
 const handlers=new Map<string,()=>void>(),properties=new Map<string,string>();
 const root={style:{setProperty:(k:string,v:string)=>properties.set(k,v)},dataset:{telegramFullscreen:''}};
  const app={initData:'test-launch-data',version,ready:vi.fn(),expand:vi.fn(),disableVerticalSwipes:vi.fn(),enableClosingConfirmation:vi.fn(),isVersionAtLeast:(v:string)=>Number(version)>=Number(v),setHeaderColor:vi.fn(),setBackgroundColor:vi.fn(),viewportStableHeight:812,isFullscreen:false,requestFullscreen:vi.fn(),openInvoice:vi.fn(),safeAreaInset:{top:44,bottom:34,left:0,right:0},contentSafeAreaInset:{top:56,bottom:0,left:0,right:0},onEvent:(e:string,fn:()=>void)=>handlers.set(e,fn),offEvent:(e:string)=>handlers.delete(e)};
 vi.stubGlobal('window',{Telegram:{WebApp:app}});vi.stubGlobal('document',{documentElement:root});return {app,root,handlers,properties};
}
beforeEach(()=>vi.restoreAllMocks());afterEach(()=>vi.unstubAllGlobals());
describe('Telegram fullscreen и invoice adapter',()=>{
 it('запрашивает fullscreen один раз, отслеживает обе safe area и очищает обработчики',()=>{
   const f=fixture(),cleanup=initTelegram();expect(f.app.ready).toHaveBeenCalledOnce();expect(f.app.expand).toHaveBeenCalledOnce();expect(f.app.requestFullscreen).toHaveBeenCalledOnce();
   expect(f.app.disableVerticalSwipes).toHaveBeenCalledOnce();expect(f.app.enableClosingConfirmation).toHaveBeenCalledOnce();
  expect(f.properties.get('--sl-system-safe-top')).toBe('44px');expect(f.properties.get('--sl-content-safe-top')).toBe('56px');expect(f.properties.get('--app-height')).toBe('812px');
  f.app.isFullscreen=true;f.handlers.get('fullscreenChanged')!();expect(f.root.dataset.telegramFullscreen).toBe('true');
  f.app.isFullscreen=false;f.handlers.get('fullscreenChanged')!();expect(f.app.requestFullscreen).toHaveBeenCalledOnce();cleanup();expect(f.handlers.size).toBe(0);
 });
 it('старый Telegram остаётся expanded; fullscreenFailed не ломает запуск',()=>{
  const old=fixture('7.0');initTelegram()();expect(old.app.requestFullscreen).not.toHaveBeenCalled();
  const current=fixture();current.app.requestFullscreen.mockImplementation(()=>{throw new Error('unsupported');});expect(()=>initTelegram()).not.toThrow();current.handlers.get('fullscreenFailed')!();expect(current.app.expand).toHaveBeenCalledOnce();
 });
 it('без Telegram launch не вызывает нативные методы и не разрешает invoice',()=>{
  const f=fixture();f.app.initData='';initTelegram()();expect(f.app.ready).not.toHaveBeenCalled();expect(canOpenInvoice()).toBe(false);expect(()=>openStarInvoice('https://t.me/$test',()=>{})).toThrow(/Telegram/);
 });
 it('invoice открывается только в официальном Telegram, callback ничего не выдаёт',()=>{
  const f=fixture(),closed=vi.fn();expect(()=>openStarInvoice('https://bad.example/$test',closed)).toThrow();expect(()=>openStarInvoice('https://t.me/username',closed)).toThrow();
  openStarInvoice('https://t.me/$valid_invoice',closed);expect(f.app.openInvoice).toHaveBeenCalledWith('https://t.me/$valid_invoice',closed);expect(closed).not.toHaveBeenCalled();
 });
});
