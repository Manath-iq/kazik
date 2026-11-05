import { test,expect } from '@playwright/test';
import { SUPPORT_TERMS,SUPPORT_TERMS_VERSION } from '@street/shared';

const nativeFixture=`(()=>{
 const events={};let closed;
 document.addEventListener('qa-invoice-close',e=>closed?.(e.detail));
 window.Telegram={WebApp:{initData:'isolated-local-ui-fixture',version:'8.0',isFullscreen:false,viewportStableHeight:812,
 safeAreaInset:{top:44,bottom:34,left:0,right:0},contentSafeAreaInset:{top:56,bottom:0,left:0,right:0},
 ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},isVersionAtLeast(){return true;},disableVerticalSwipes(){},enableVerticalSwipes(){},
 BackButton:{show(){},hide(){},onClick(){},offClick(){}},onEvent(e,fn){events[e]=fn},offEvent(e){delete events[e]},
 requestFullscreen(){this.isFullscreen=true;document.documentElement.dataset.qaFullscreen='requested';queueMicrotask(()=>events.fullscreenChanged?.());},
 openInvoice(url,callback){closed=callback;document.documentElement.dataset.qaInvoice=url;}
 }};
})();`;
test('fullscreen safe area, согласие, invoiceClosed не заменяет webhook; возврат подтверждается сервером',async({page})=>{
 // Только UI fixtures. Денежная логика отдельно тестируется в настоящих workerd/D1.
 await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'application/javascript',body:nativeFixture}));
 await page.route('**/api/auth/telegram',async route=>{const response=await route.fetch({url:'http://127.0.0.1:8793/api/auth/dev',postData:'{}'});await route.fulfill({response});});
 let status='awaiting_payment',refunded=false;let orderId='';
 const order=()=>({id:orderId,stars:25,invoiceUrl:'https://t.me/$isolated_ui_test',expiresAt:Date.now()+1800000,status});
 await page.route('**/api/support',route=>route.fulfill({json:{data:{enabled:true,amounts:[25,100,250],termsVersion:SUPPORT_TERMS_VERSION,terms:SUPPORT_TERMS,supportUrl:'https://t.me/manath',pendingOrder:null,history:status==='paid'?[{chargeId:'local-ui-charge',stars:25,currency:'XTR',status:refunded?'refunded':'paid',receivedAt:Date.now(),refundedAt:refunded?Date.now():null}]:[]}}}));
 await page.route('**/api/support/invoices',route=>{const body=route.request().postDataJSON();expect(body).toMatchObject({stars:25,termsAccepted:true,termsVersion:SUPPORT_TERMS_VERSION});orderId=body.key;return route.fulfill({json:{data:order()}});});
 await page.route('**/api/support/orders/*',route=>route.fulfill({json:{data:order()}}));
 await page.route('**/api/support/refunds',route=>{expect(route.request().postDataJSON()).toEqual({chargeId:'local-ui-charge'});refunded=true;return route.fulfill({json:{data:{chargeId:'local-ui-charge',stars:25,currency:'XTR',status:'refunded',receivedAt:Date.now(),refundedAt:Date.now()}}});});
 await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-qa-fullscreen','requested');await page.getByRole('button',{name:'Открыть профиль'}).click();await page.getByRole('button',{name:/ПОДДЕРЖАТЬ ИГРУ/}).click();
 const dialog=page.getByRole('dialog',{name:'Поддержать игру'}),pay=dialog.getByRole('button',{name:'ПОДДЕРЖАТЬ · 25 STARS',exact:true});await expect(pay).toBeDisabled();
 const box=(await dialog.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(100);expect(box.y+box.height).toBeLessThanOrEqual(778);
 await dialog.getByRole('checkbox').check();await pay.click();await expect(page.locator('html')).toHaveAttribute('data-qa-invoice','https://t.me/$isolated_ui_test');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('qa-invoice-close',{detail:'paid'})));
 await expect(dialog.getByText(/Проверяем подтверждение Telegram/)).toBeVisible();await expect(dialog.getByText(/Спасибо за поддержку/)).toHaveCount(0);
 status='paid';await expect(dialog.getByText(/Спасибо за поддержку/)).toBeVisible({timeout:10000});
 await dialog.getByRole('button',{name:'Вернуть Stars',exact:true}).click();await dialog.getByRole('button',{name:'ВЕРНУТЬ 25 STARS',exact:true}).click();await expect(dialog.getByText('Stars возвращены',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/support-fullscreen-375.png'});
});
