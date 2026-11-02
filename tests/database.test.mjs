import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const actor='11111111-1111-4111-8111-111111111111';
const hash=x=>createHash('sha256').update(x).digest('hex');
const db=new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(await readFile(new URL('../supabase/001_schema.sql',import.meta.url),'utf8'));
const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args);return r.rows[0].value};
await test('Phase 1: schema denies customer access and initialization is exactly once',async()=>{
 await rpc('hw_initialize',[actor]);
 await assert.rejects(rpc('hw_initialize',[actor]),/ALREADY_INITIALIZED/);
 const stats=(await rpc('hw_admin')).stats;
 assert.deepEqual(stats.map(s=>[s.amount,s.total]),[[50,150],[100,75],[200,60],[300,15]]);
 await db.exec('set role anon');
 await assert.rejects(rpc('hw_admin'),/permission denied/);
 await assert.rejects(db.query('select * from honeywood.prizes'),/permission denied/);
 await db.exec('reset role');
});
await test('Phase 4: invalid codes, paused campaign, config validation and IP rate limit',async()=>{
 await assert.rejects(rpc('hw_draw',['bad']),/INVALID_CODE/);
 const code=(await rpc('hw_admin')).entries[0].code;
 await assert.rejects(rpc('hw_draw',[hash(code)]),/NOT_ACTIVE/);
 await assert.rejects(rpc('hw_config',[true,'',actor]),/CONFIG_REQUIRED/);
 for(let i=0;i<15;i++)assert.equal(await rpc('hw_rate',['test']),true);
 assert.equal(await rpc('hw_rate',['test']),false);
 await rpc('hw_config',[true,'テスト用の利用条件です。',actor]);
});
await test('Phase 4: a failure after selecting a prize rolls back both prize and eligibility',async()=>{
 const entry=(await rpc('hw_admin')).entries[0];
 await db.exec("create function honeywood.test_fail() returns trigger language plpgsql as $$ begin raise exception 'TEST_ROLLBACK'; end $$; create trigger test_fail before update on honeywood.entries for each row execute function honeywood.test_fail();");
 await assert.rejects(rpc('hw_draw',[hash(entry.code)]),/TEST_ROLLBACK/);
 assert.equal((await rpc('hw_status')).remaining,300);
 assert.equal((await rpc('hw_admin')).entries.find(e=>e.code===entry.code).used_at,null);
 await db.exec('drop trigger test_fail on honeywood.entries;drop function honeywood.test_fail();');
});
await test('Phase 6/7: all 300 actual SQL allocations, duplicate burst, recovery, unique coupons',async()=>{
 const entries=(await rpc('hw_admin')).entries;
 const repeated=await Promise.all(Array.from({length:24},()=>rpc('hw_draw',[hash(entries[0].code)])));
 assert.equal(new Set(repeated.map(r=>r.coupon)).size,1);
 const results=await Promise.all(entries.map(e=>rpc('hw_draw',[hash(e.code)])));
 assert.equal(new Set(results.map(r=>r.coupon)).size,300);
 for(const [amount,count] of [[50,150],[100,75],[200,60],[300,15]])assert.equal(results.filter(r=>r.amount===amount).length,count);
 assert.equal((await rpc('hw_status')).remaining,0);
 const recovered=await rpc('hw_draw',[hash(entries[0].code)]);
 assert.equal(recovered.coupon,results[0].coupon);assert.equal(recovered.recovered,true);
 await rpc('hw_config',[false,'テスト用の利用条件です。',actor]);
 assert.equal((await rpc('hw_draw',[hash(entries[0].code)])).coupon,results[0].coupon);
});
await test('Phase 5: redeem atomically, reject duplicate, persist audit',async()=>{
 const e=(await rpc('hw_admin')).entries[0];
 const outcomes=await Promise.allSettled([rpc('hw_redeem',[e.coupon,actor]),rpc('hw_redeem',[e.coupon,actor])]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/ALREADY_REDEEMED/);
 assert.equal((await db.query("select count(*)::int n from honeywood.audit where action='redeem'")).rows[0].n,1);
});
await db.close();
