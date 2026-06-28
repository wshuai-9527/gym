const CACHE='gym-vault-v37-analysis';
const ASSETS=["./", "./index.html?v=36", "./manifest.webmanifest?v=36", "./icon.svg", "./v37-analysis.js?v=37", "./images/push_1.png", "./images/push_2.png", "./images/push_3.png", "./images/push_4.png", "./images/push_5.png", "./images/pull_1.png", "./images/pull_2.png", "./images/pull_3.png", "./images/pull_4.png", "./images/pull_5.png", "./images/legs_1.png", "./images/legs_2.png", "./images/legs_3.png", "./images/legs_4.png", "./images/legs_5.png"];
function injectV37(html){
  if(!html || html.includes('v37-analysis.js')) return html;
  return html.replace('</body>','<script src="./v37-analysis.js?v=37"></script></body>');
}
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const res=await fetch(e.request,{cache:'no-store'});
        const text=await res.text();
        return new Response(injectV37(text),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
      }catch(err){
        const cached=await caches.match('./index.html?v=36',{ignoreSearch:true});
        if(cached){
          const text=await cached.text();
          return new Response(injectV37(text),{headers:{'content-type':'text/html; charset=utf-8'}});
        }
        throw err;
      }
    })());
    return;
  }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match('./index.html?v=36',{ignoreSearch:true}))));
});
