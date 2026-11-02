import {createHash,createHmac} from 'node:crypto';
const messages={INVALID_CODE:'参加コードをご確認ください。',NOT_ACTIVE:'ただいま受付を停止しています。',SOLD_OUT:'今回の配布は終了しました。',ALREADY_INITIALIZED:'初期化はすでに完了しています。',ALREADY_REDEEMED:'このクーポンは使用済みです。',COUPON_NOT_FOUND:'クーポンが見つかりません。',CONFIG_REQUIRED:'初期化と利用条件の設定が必要です。'};
export function makeHandler(env=process.env,fetcher=fetch){
 return async event=>{
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const response=(statusCode,data,extra={})=>({statusCode,headers:{...headers,...extra},body:JSON.stringify(data)});
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
 const cookie=(token='',age=0)=>`__Host-hw_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
 try{
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.RATE_LIMIT_SECRET||env.RATE_LIMIT_SECRET.length<32) return response(503,{error:'ただいま準備中です。時間をおいて再度お試しください。'});
 const host=event.headers.host; const method=event.httpMethod;
 if(!['GET','POST'].includes(method))return response(405,{error:'Method not allowed'},{Allow:'GET, POST'});
 if(method==='POST'){
  let origin;try{origin=new URL(event.headers.origin).host}catch{}
  if(!origin||origin!==host)fail(403,'アクセスを確認できませんでした。');
  if(!event.headers['content-type']?.startsWith('application/json'))fail(415,'JSON required');
 }
 const path=event.path.replace(/^\/\.netlify\/functions\/api/,'').replace(/^\/api/,'');
 let body={};
 if(method==='POST'){if(event.isBase64Encoded||Buffer.byteLength(event.body||'')>8192)fail(413,'入力が長すぎます。');try{body=JSON.parse(event.body||'{}')}catch{fail(400,'入力をご確認ください。')}if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'入力をご確認ください。');}
 const remote=async(endpoint,options={})=>{
  const r=await fetcher(`${env.SUPABASE_URL}${endpoint}`,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
  const data=await r.json().catch(()=>({}));return {r,data};
 };
 const rpc=async(name,args={})=>{
  const {r,data}=await remote(`/rest/v1/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`},body:JSON.stringify(args)});
  if(!r.ok){const key=Object.keys(messages).find(k=>data.message?.includes(k));if(key)fail(409,messages[key]);fail(503,'接続できませんでした。同じ参加コードで再度お試しください。');}return data;
 };
 if(method==='GET'&&path==='/status')return response(200,await rpc('hw_status'));
 if(method==='POST'&&['/draw','/login'].includes(path)){
  const ip=event.headers['x-nf-client-connection-ip'];if(!ip)fail(503,'接続元を確認できませんでした。');
  const key=createHmac('sha256',env.RATE_LIMIT_SECRET).update(path+':'+ip).digest('hex');
  if(!await rpc('hw_rate',{p_key:key}))return response(429,{error:'試行回数が多いため、1分ほどお待ちください。'},{'Retry-After':'60'});
 }
 if(method==='POST'&&path==='/draw'){
  const code=typeof body.code==='string'?body.code.trim().toUpperCase():'';
  if(!/^HW-[A-F0-9]{32}$/.test(code))fail(400,'参加コードをご確認ください。');
  return response(200,await rpc('hw_draw',{p_hash:createHash('sha256').update(code).digest('hex')}));
 }
 const allowed=new Set((env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
 const verify=async token=>{
  if(!token)fail(401,'ログインしてください。');
  const {r,data}=await remote('/auth/v1/user',{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok||!data.email_confirmed_at||!allowed.has(data.email?.toLowerCase()))fail(401,'管理者としてログインしてください。');return data;
 };
 if(method==='POST'&&path==='/login'){
  if(typeof body.email!=='string'||typeof body.password!=='string'||body.password.length>256)fail(400,'入力をご確認ください。');
  const {r,data}=await remote('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:body.email,password:body.password})});
  if(!r.ok)fail(401,'メールアドレスまたはパスワードをご確認ください。');
  await verify(data.access_token);
  return response(200,{ok:true},{'Set-Cookie':cookie(data.access_token,Math.min(data.expires_in||3600,3600))});
 }
 if(method==='POST'&&path==='/logout')return response(200,{ok:true},{'Set-Cookie':cookie()});
 if(path.startsWith('/admin')){
  const token=event.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-hw_admin='))?.slice(16);
  const user=await verify(token);
  if(method==='GET'&&path==='/admin')return response(200,await rpc('hw_admin'));
  if(method==='POST'&&path==='/admin/initialize')return response(200,await rpc('hw_initialize',{p_actor:user.id}));
  if(method==='POST'&&path==='/admin/config'){
   if(typeof body.active!=='boolean'||typeof body.rules!=='string'||body.rules.length>4000)fail(400,'入力をご確認ください。');
   return response(200,await rpc('hw_config',{p_active:body.active,p_rules:body.rules,p_actor:user.id}));
  }
  if(method==='POST'&&path==='/admin/redeem'){
   if(typeof body.coupon!=='string'||!/^HWC-[A-F0-9]{32}$/.test(body.coupon))fail(400,'コードをご確認ください。');
   return response(200,await rpc('hw_redeem',{p_coupon:body.coupon,p_actor:user.id}));
  }
 }
 return response(404,{error:'ページが見つかりません。'});
 }catch(e){return response(e.status||503,{error:e.status?e.message:'接続できませんでした。時間をおいて再度お試しください。'});}
 };
}
export const handler=makeHandler();
