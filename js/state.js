export class AppState{
  constructor(initialState){this.listeners=new Map();this.proxyCache=new WeakMap();this.state=this.wrap(initialState,[])}
  wrap(target,path){if(target===null||typeof target!=='object')return target;if(this.proxyCache.has(target))return this.proxyCache.get(target);const proxy=new Proxy(target,{get:(obj,key)=>{const val=obj[key];return val&&typeof val==='object'?this.wrap(val,path.concat(key)):val},set:(obj,key,val)=>{obj[key]=val;const p=path.concat(key).join('.');this.emit(p,val);this.emit('*',this.state);return true},deleteProperty:(obj,key)=>{delete obj[key];this.emit(path.concat(key).join('.'),undefined);this.emit('*',this.state);return true}});this.proxyCache.set(target,proxy);return proxy}
  subscribe(event,fn){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(fn);return()=>this.listeners.get(event)?.delete(fn)}
  emit(event,payload){this.listeners.get(event)?.forEach(fn=>fn(payload,event));}
  patch(mutator,event='patch'){mutator(this.state);this.emit(event,this.state);this.emit('*',this.state)}
}