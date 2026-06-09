const CACHE='gym-vault-title-fix-v23';
function patchHtml(html){
  html=html.replace(".hero h2{font-size:54px;line-height:.94;letter-spacing:-.09em;margin:0 0 14px;font-weight:1000}",".hero h2{font-size:54px;line-height:.96;letter-spacing:-.035em;margin:0 0 14px;font-weight:1000;white-space:nowrap}.hero-title-en{display:inline-block;letter-spacing:-.045em}.hero-title-cn{display:inline-block;margin-left:.16em;letter-spacing:-.02em}");
  html=html.replace("$('#planTitle').textContent=ctx.label;","$('#planTitle').innerHTML=(ctx.type==='Push'?'<span class=\"hero-title-en\">Push</span><span class=\"hero-title-cn\">日</span>':ctx.type==='Pull'?'<span class=\"hero-title-en\">Pull</span><span class=\"hero-title-cn\">日</span>':'<span class=\"hero-title-en\">Legs</span><span class=\"hero-title-cn\">日</span>');");
  return html;
}
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(e.request.mode==='navigate'||u.pathname.endsWith('/gym/')||u.pathname.endsWith('/gym/index.html')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(async r=>{
      const h=patchHtml(await r.text());
      return new Response(h,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
    }).catch(()=>caches.match(e.request,{ignoreSearch:true})));
    return;
  }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res})));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus()}if(clients.openWindow)return clients.openWindow('./index.html?v=23')}))});
