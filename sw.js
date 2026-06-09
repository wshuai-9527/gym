const CACHE='gym-vault-action-name-v25';
function patchHtml(html){
  html=html.replace("(()=>{'use strict';","(()=>{'use strict';try{localStorage.setItem('gym-fix-test','1')}catch(e){};");
  html=html.replaceAll('上斜胸托反向飞鸟','坐姿俯身飞鸟');
  html=html.replaceAll('俯身反向飞鸟','坐姿俯身飞鸟');
  html=html.replaceAll('./images/pull_4.jpg','./images/pull_4.svg?v=25');
  html=html.replaceAll('./images/pull_4.svg?v=24','./images/pull_4.svg?v=25');
  html=html.replaceAll('胸托凳面，手臂微弯打开，顶峰停顿，不借腰摆。','坐姿屈髋俯身，胸口靠近大腿；手臂微弯向两侧打开，轻重量找后束发力。');
  html=html.replaceAll('屈髋俯身，背部中立；手臂微弯向两侧打开，轻重量找后束发力。','坐姿屈髋俯身，胸口靠近大腿；手臂微弯向两侧打开，轻重量找后束发力。');
  html=html.replaceAll('胸口贴住斜凳','坐姿俯身，胸口靠近大腿');
  html=html.replaceAll('髋向后坐，背部中立','坐姿俯身，背部自然稳定');
  return html;
}
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(e.request.mode==='navigate'||u.pathname.endsWith('/gym/')||u.pathname.endsWith('/gym/index.html')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(async r=>new Response(patchHtml(await r.text()),{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}})));
    return;
  }
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request,{ignoreSearch:true})));
});
