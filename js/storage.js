export class StorageManager{
  constructor(key,defaultState){this.key=key;this.defaultState=defaultState}
  clone(v){return structuredClone?structuredClone(v):JSON.parse(JSON.stringify(v))}
  load(){try{const raw=localStorage.getItem(this.key);return raw?this.migrate(JSON.parse(raw)):this.clone(this.defaultState)}catch{return this.clone(this.defaultState)}}
  save(state){localStorage.setItem(this.key,JSON.stringify(this.strip(state)))}
  strip(v){return JSON.parse(JSON.stringify(v))}
  migrate(old){const next={...this.clone(this.defaultState),...old,version:this.defaultState.version};next.records=Array.isArray(next.records)?next.records:[];next.checkins=next.checkins||{};next.timers=next.timers||{};return next}
  clear(){localStorage.removeItem(this.key)}
}