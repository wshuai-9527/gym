import webpush from 'npm:web-push@3.6.7';
const endpointAllowed=(endpoint:string)=>{
 try{const u=new URL(endpoint);return u.protocol==='https:'&&(u.hostname==='web.push.apple.com'||u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}
};
async function rpc(name:string,body:unknown={}){
 const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const response=await fetch(Deno.env.get('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},body:JSON.stringify(body)});
 if(!response.ok)throw Error('worker database request failed: '+response.status);
 return response.status===204?null:response.json();
}
Deno.serve(async req=>{
 if(req.method==='GET')return Response.json({service:'gym-rest-push',ready:true});
 if(req.method!=='POST')return new Response('method not allowed',{status:405});
 // Platform JWT verification remains enabled. A separate worker token binds Cron.
 const workerToken=req.headers.get('x-gym-worker')||'';
 if(!/^[A-Za-z0-9_-]{40,}$/.test(workerToken))return new Response('unauthorized',{status:401});
 try{
  const config=await rpc('gym_push_worker_config');
  if(workerToken!==config.gym_push_worker_token)return new Response('unauthorized',{status:401});
  const jobs=await rpc('gym_claim_push_jobs');let sent=0,failed=0;
  for(const job of jobs){
   let status=0;
   try{
    if(!endpointAllowed(job.subscription?.endpoint)){status=410;throw Error('invalid endpoint');}
    if(!await rpc('gym_push_job_current',{p_id:job.id,p_token:job.token}))continue;
    const payload=JSON.stringify({title:'休息结束',body:'准备好后开始下一组，保持动作稳定。',tag:'gym-rest-'+job.token,url:'https://wshuai-9527.github.io/gym/'});
    const details=webpush.generateRequestDetails(job.subscription,payload,{vapidDetails:{subject:'https://wshuai-9527.github.io/gym/',publicKey:config.gym_push_vapid_public,privateKey:config.gym_push_vapid_private},TTL:90,urgency:'high'});
    const response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:details.body,signal:AbortSignal.timeout(10000)});status=response.status;
    if(response.ok)sent++;else failed++;
   }catch{failed++;}
   await rpc('gym_finish_push_job',{p_id:job.id,p_token:job.token,p_status:status});
  }
  return Response.json({sent,failed});
 }catch{return Response.json({error:'notification worker unavailable'},{status:503});}
});
