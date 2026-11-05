import { it,expect,vi,afterEach } from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('haptic: selection/notification/impact по назначению, события ограничены и настройка off соблюдается',async()=>{
 let now=1000,off=false;const feedback={impactOccurred:vi.fn(),notificationOccurred:vi.fn(),selectionChanged:vi.fn()};
 vi.stubGlobal('window',{Telegram:{WebApp:{HapticFeedback:feedback}}});vi.stubGlobal('document',{hidden:false});vi.stubGlobal('localStorage',{getItem:()=>off?'off':null});vi.stubGlobal('performance',{now:()=>now});
 const {haptic}=await import('../apps/web/src/app/haptics');
 haptic('selection');haptic('selection');expect(feedback.selectionChanged).toHaveBeenCalledOnce();now+=200;haptic('success');expect(feedback.notificationOccurred).toHaveBeenCalledWith('success');
 now+=200;haptic('damage');now+=150;haptic('damage');expect(feedback.impactOccurred).toHaveBeenCalledTimes(1);expect(feedback.impactOccurred).toHaveBeenCalledWith('medium');
 off=true;now+=1000;haptic('press');expect(feedback.impactOccurred).toHaveBeenCalledTimes(1);
});
it('haptic: отсутствие SDK или его ошибка не ломает игру',async()=>{
 vi.stubGlobal('window',{});vi.stubGlobal('document',{hidden:false});vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');}});
 const {haptic}=await import('../apps/web/src/app/haptics');expect(()=>haptic('press')).not.toThrow();
});
