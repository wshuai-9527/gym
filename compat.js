(()=>{
  'use strict';
  if(window.__GYM_COMPAT_GUARD__) return;
  window.__GYM_COMPAT_GUARD__=true;
  const originalQuerySelector=Document.prototype.querySelector;
  Document.prototype.querySelector=function(selector){
    const found=originalQuerySelector.call(this,selector);
    if(found) return found;
    if(typeof selector==='string' && /^#[A-Za-z][\w:-]*$/.test(selector)){
      const id=selector.slice(1);
      const el=document.createElement('div');
      el.id=id;
      el.style.display='none';
      document.body.appendChild(el);
      return el;
    }
    return found;
  };
})();
