const CACHE='gym-vault-v28-clean';
const ASSETS=['./','./index.html?v=28','./manifest.webmanifest?v=28','./icon.svg',
'./images/push_1.jpg','./images/push_2.jpg','./images/push_3.jpg','./images/push_4.jpg','./images/push_5.jpg',
'./images/pull_1.jpg','./images/pull_2.jpg','./images/pull_3.jpg','./images/pull_4.png','./images/pull_5.jpg',
'./images/legs_1.jpg','./images/legs_2.jpg','./images/legs_3.jpg','./images/legs_4.jpg','./images/legs_5.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request,{cache:'no-store'}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./index.html?v=28',{ignoreSearch:true}))))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if('focus' in c)return c.focus()}if(clients.openWindow)return clients.openWindow('./index.html?v=28')}))});
