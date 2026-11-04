import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
const accountId=process.argv[2];
if(!/^[a-f0-9]{32}$/.test(accountId??''))throw new Error('Expected account ID');
// Документированный Wrangler auth token. Credential только в памяти, не печатается.
const auth=JSON.parse(execFileSync(process.execPath,[new URL('../../node_modules/wrangler/bin/wrangler.js',import.meta.url).pathname,'auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const token=auth.token;
if(typeof token!=='string')throw new Error(`Unexpected auth schema: ${Object.keys(auth).join(',')}`);
const output={};
for(const name of ['workers/account-settings','workers/subdomain','subscriptions']){
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${name}`,{headers:{Authorization:`Bearer ${token}`}});
 const json=await response.json();
 output[name]=json.success?json.result:{status:response.status,codes:json.errors?.map(e=>e.code)};
}
await writeFile(new URL('../../.local/cloudflare-info.json',import.meta.url),JSON.stringify(output,null,2),{mode:0o600});
console.log(JSON.stringify(output));
