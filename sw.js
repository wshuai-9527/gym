const CACHE='gym-vault-v42-pro-analysis';
const ASSETS=['./','./index.html?v=42','./manifest.webmanifest?v=42','./icon.svg','./app-upgrade.js?v=41','./analysis.js?v=42','./images/v41/plan_push.svg','./images/v41/plan_pull.svg','./images/v41/plan_legs.svg'];
function inject(html){
  if(!html) return html;
  html=html.split('v37-analysis.js').join('disabled-v37-analysis.js');
  html=html.split('v38-analysis.js').join('disabled-v38-analysis.js');
  html=html.split('compat.js').join('disabled-compat.js');
  if(html.includes('analysis.js?v=42')) return html;
  return html.replace('</body>','<scr'+'ipt src="./app-upgrade.js?v=41"></scr'+'ipt><scr'+'ipt src="./analysis.js?v=42"></scr'+'ipt></body>');
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{const res=await fetch(event.request,{cache:'no-store'});const text=await res.text();return new Response(inject(text),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})}
      catch(err){const cached=await caches.match('./index.html?v=42',{ignoreSearch:true})||await caches.match('./index.html?v=36',{ignoreSearch:true});if(cached){const text=await cached.text();return new Response(inject(text),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})}throw err;}
    })());return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request,{ignoreSearch:true})));
});