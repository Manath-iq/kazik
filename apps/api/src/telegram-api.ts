import { z } from 'zod';
import type { Bindings } from './types';

export class TelegramApiError extends Error {
 constructor(public method:string,public code:number,public alreadyRefunded=false){super(`Telegram ${method}: ${code}`);}
}

// Ни URL запроса (с токеном), ни сырой network error/ответ Telegram не попадают в логи.
export async function telegramCall<T>(env:Bindings,method:string,body:Record<string,unknown>,result:z.ZodType<T>,timeout=6000):Promise<T>{
 if(!env.BOT_TOKEN)throw new TelegramApiError(method,503);
 try{
  const response=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),
  });
  const payload=z.object({ok:z.boolean(),result:z.unknown().optional(),error_code:z.number().optional(),description:z.string().optional()}).parse(await response.json());
  if(!response.ok||!payload.ok)throw new TelegramApiError(method,payload.error_code??response.status,/\b(?:CHARGE|PAYMENT)_ALREADY_REFUNDED\b/.test(payload.description??''));
  return result.parse(payload.result);
 }catch(error){if(error instanceof TelegramApiError)throw error;throw new TelegramApiError(method,502);}
}
