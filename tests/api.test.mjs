import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeHandler} from '../netlify/functions/api.mjs';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret',RATE_LIMIT_SECRET:'a'.repeat(32),ADMIN_EMAILS:'admin@example.com'};
const event=(path,method='GET',body)=>({path:'/api'+path,httpMethod:method,headers:{host:'honeywood.example',origin:'https://honeywood.example','content-type':'application/json','x-nf-client-connection-ip':'192.0.2.1'},body:JSON.stringify(body)});
function fake(responses){const calls=[];const h=makeHandler(env,async(url,opts)=>{calls.push({url,opts});const [status,data]=responses.shift()||[500,{}];return new Response(JSON.stringify(data),{status})});return {h,calls};}
await test('Phase 4: unconfigured environment fails closed',async()=>assert.equal((await makeHandler({})(event('/status'))).statusCode,503));
await test('Phase 4: CSRF, malformed JSON, code validation, rate-limit',async()=>{
 let {h,calls}=fake([]);const e=event('/draw','POST',{});e.headers.origin='https://evil.example';assert.equal((await h(e)).statusCode,403);assert.equal(calls.length,0);
 ({h}=fake([[200,true]]));assert.equal((await h(event('/draw','POST',{code:'invalid'}))).statusCode,400);
 ({h}=fake([[200,false]]));assert.equal((await h(event('/draw','POST',{code:'HW-'+'A'.repeat(32)}))).statusCode,429);
 ({h}=fake([]));e.headers.origin='https://honeywood.example';e.body='{';assert.equal((await h(e)).statusCode,400);
});
await test('Phase 4: amount is ignored, only code hash sent to private RPC',async()=>{
 const {h,calls}=fake([[200,true],[200,{amount:50,coupon:'test'}]]);
 const r=await h(event('/draw','POST',{code:'hw-'+'a'.repeat(32),amount:300}));assert.equal(JSON.parse(r.body).amount,50);
 const args=JSON.parse(calls[1].opts.body);assert.deepEqual(Object.keys(args),['p_hash']);assert.equal(args.p_hash.length,64);assert(!calls[1].opts.body.includes('HW-'));
});
await test('Phase 5: unauthenticated admin denied before any record query',async()=>{
 const {h,calls}=fake([]);assert.equal((await h(event('/admin'))).statusCode,401);assert.equal(calls.length,0);
});
await test('Phase 5: valid user outside allowlist rejected',async()=>{
 const {h,calls}=fake([[200,{email:'other@example.com',email_confirmed_at:'now'}]]);const e=event('/admin');e.headers.cookie='__Host-hw_admin=jwt';assert.equal((await h(e)).statusCode,401);assert.equal(calls.length,1);
});
await test('Phase 5: secure login cookie and authenticated records',async()=>{
 const {h,calls}=fake([[200,true],[200,{access_token:'jwt',expires_in:3600}],[200,{id:'id',email:'admin@example.com',email_confirmed_at:'now'}]]);
 const r=await h(event('/login','POST',{email:'admin@example.com',password:'password'}));assert.equal(r.statusCode,200);assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);assert(!r.body.includes('jwt'));
 const f=fake([[200,{email:'admin@example.com',email_confirmed_at:'now'}],[200,{entries:[]}]]);const e=event('/admin');e.headers.cookie='__Host-hw_admin=jwt';assert.equal((await f.h(e)).statusCode,200);assert.equal(f.calls[0].opts.headers.Authorization,'Bearer jwt');
});
await test('Phase 4: network error hides secrets and permits safe retry',async()=>{
 const h=makeHandler(env,async()=>{throw new Error('secret')});const r=await h(event('/status'));assert.equal(r.statusCode,503);assert(!r.body.includes('secret'));assert.equal(r.headers['Cache-Control'],'no-store');
});
