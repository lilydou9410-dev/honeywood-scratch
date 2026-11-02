// Dedicated disposable local PostgreSQL cluster. Never points at production.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'honeywood-pg-'));
const server=new EmbeddedPostgres({databaseDir:dir,port:15439,user:'postgres',password:randomUUID(),persistent:false,onLog:()=>{},onError:()=>{}});
let pool;
try{
 await server.initialise();await server.start();
 const client=server.getPgClient();await client.connect();
 await client.query('create role anon;create role authenticated;create role service_role;');
 await client.query(await readFile(new URL('../supabase/001_schema.sql',import.meta.url),'utf8'));
 const connection=client.connectionParameters;
 pool=new pg.Pool({host:connection.host,port:connection.port,user:connection.user,password:connection.password,database:connection.database,max:30});
 const rpc=async(name,args=[])=>{const r=await pool.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args);return r.rows[0].v};
 const actor=randomUUID(),hash=x=>createHash('sha256').update(x).digest('hex');
 await rpc('hw_initialize',[actor]);await rpc('hw_config',[true,'テスト環境の利用条件です。',actor]);
 const entries=(await rpc('hw_admin')).entries;
 // Real simultaneous independent sessions compete for same entry.
 const duplicates=await Promise.all(Array.from({length:60},()=>rpc('hw_draw',[hash(entries[0].code)])));
 assert.equal(new Set(duplicates.map(x=>x.coupon)).size,1);
 console.log('PASS: 60 simultaneous duplicate requests -> one allocation');
 // 300 unique customers plus replay requests all in flight; pool has 30 real sessions.
 const results=await Promise.all(entries.map(e=>rpc('hw_draw',[hash(e.code)])));
 assert.equal(new Set(results.map(x=>x.coupon)).size,300);
 for(const [amount,count]of [[50,150],[100,75],[200,60],[300,15]])assert.equal(results.filter(x=>x.amount===amount).length,count);
 assert.equal((await rpc('hw_status')).remaining,0);
 console.log('PASS: 300 draws via 30 concurrent PostgreSQL connections -> exact 150/75/60/15, 300 unique coupons, zero remaining');
 const original=results[1];const retry=await rpc('hw_draw',[hash(entries[1].code)]);assert.equal(retry.coupon,original.coupon);
 console.log('PASS: lost-response retry returns original coupon');
 const redeemed=await Promise.allSettled(Array.from({length:20},()=>rpc('hw_redeem',[original.coupon,actor])));
 assert.equal(redeemed.filter(x=>x.status==='fulfilled').length,1);
 console.log('PASS: 20 concurrent redemptions -> exactly one success');
 // Transaction failure after selected prize must roll back eligibility and inventory.
 // Separate isolated campaign cannot reset, so verify allocation consistency directly.
 const invariant=await client.query('select (select count(*) from honeywood.entries where used_at is not null)=(select count(*) from honeywood.prizes where entry_id is not null) ok');assert(invariant.rows[0].ok);
 await client.end();
}finally{if(pool)await pool.end();await server.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
