import { HTTPException } from 'hono/http-exception';
export function sql(db: D1Database, query: string, ...values: (string|number|null)[]) { return db.prepare(query).bind(...values); }
export function fail(message: string, status: 400|401|403|404|409|429|503 = 400): never { throw new HTTPException(status, { message }); }
export function ledger(db: D1Database, user: string, delta: number, reason: string, ref: string) {
 return sql(db, 'INSERT INTO wallet_ledger(id,user_id,delta,reason,ref_id,created_at) VALUES(?,?,?,?,?,?)', crypto.randomUUID(),user,delta,reason,ref,Date.now());
}
export async function hash(text: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join(''); }
export function randomInt(max: number): number {
 const cap = 0x100000000 - (0x100000000 % max), a = new Uint32Array(1);
 do { crypto.getRandomValues(a); } while(a[0]>=cap);
 return a[0]%max;
}
export async function rateLimit(db:D1Database, user:string, max=90) {
 const bucket=Math.floor(Date.now()/60000);
 const row=await sql(db,'INSERT INTO action_limits(user_id,bucket,count) VALUES(?,?,1) ON CONFLICT(user_id,bucket) DO UPDATE SET count=count+1 RETURNING count',user,bucket).first<{count:number}>();
 if ((row?.count??0)>max) fail('Слишком много действий. Подожди минуту.',429);
}
