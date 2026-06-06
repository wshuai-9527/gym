import{NORMALIZE_RULES,TYPE_META}from'./data.js';
export const mdToDate=(md)=>{const[y,m,d]=md.includes('-')?md.split('-').map(Number):[new Date().getFullYear(),...md.split('.').map(Number)];return new Date(y,m-1,d)};
export const dateToMD=(d)=>`${d.getMonth()+1}.${d.getDate()}`;
export const cmpMD=(a,b)=>mdToDate(a)-mdToDate(b);
export const todayMD=()=>dateToMD(new Date());
export function canon(name){let n=(name||'').trim();for(const[a,b]of NORMALIZE_RULES)if(n===a)return b;return n}
export function category(rec){const names=(rec.items||[]).map(i=>i.name).join(' ');if(names.includes('篮球'))return'篮球';if(names.includes('休整'))return'休整';if(/卧推|推肩|侧平举|臂屈伸|俯卧撑/.test(names))return'胸肩三头';if(/下拉|划船|弯举|上拉|飞鸟/.test(names))return'背二头';if(/摆动|蹲|硬拉|支撑|箭步/.test(names))return'臀腿';return'休整'}
export function typeFromCat(c){return c==='胸肩三头'?'Push':c==='背二头'?'Pull':c==='臀腿'?'Legs':null}
export function nextTypeAfter(t){return t==='Push'?'Pull':t==='Pull'?'Legs':'Push'}
export function parseRawRecords(raw){return raw.trim().split(/\n\s*\n/).map(block=>{const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);const date=lines.shift();const items=[];for(let i=0;i<lines.length;i++){if(!/(\d|🏀)/.test(lines[i])||lines[i]==='🏀'){const name=canon(lines[i]);const sets=[];while(lines[i+1]&&/(\d|kg|s|\*)/.test(lines[i+1]))sets.push(lines[++i].replaceAll('×','*'));items.push({name,sets})}}return normalizeRecord({date,items})}).filter(r=>r.date)}
export function normalizeRecord(r){return{date:r.date,items:(r.items||[]).map(i=>({name:canon(i.name),sets:(i.sets||[]).map(s=>String(s).replaceAll('×','*'))}))}}
export function normalizeRecords(records){const map=new Map();records.map(normalizeRecord).forEach(r=>map.set(r.date,r));return[...map.values()].sort((a,b)=>cmpMD(a.date,b.date))}
export function latestStrength(records){return normalizeRecords(records).filter(r=>!['篮球','休整'].includes(category(r))).at(-1)||null}
export function buildPlanContext(records,planLibrary){const last=latestStrength(records);const lastType=last?typeFromCat(category(last)):null;const type=last?nextTypeAfter(lastType):'Push';let date=todayMD();if(last&&cmpMD(last.date,date)>=0){const d=mdToDate(last.date);d.setDate(d.getDate()+1);date=dateToMD(d)}return{type,date,label:TYPE_META[type].label,line:TYPE_META[type].line,last,exercises:planLibrary[type]}}
export function createCheckin(ctx){return{key:`${ctx.date}-${ctx.type}`,date:ctx.date,type:ctx.type,sets:ctx.exercises.map(ex=>({name:ex.name,sets:ex.sets.map(([weight,reps],i)=>({id:`${ex.name}-${i}`,weight,reps,done:false}))}))}}
export function recordFromCheckin(checkin){return{date:checkin.date,items:checkin.sets.map(ex=>({name:ex.name,sets:ex.sets.filter(s=>s.done).map(s=>`${s.weight?`${s.weight}*`:''}${s.reps}`)})).filter(i=>i.sets.length)}}
export function saveRecord(records,record){return normalizeRecords([...records.filter(r=>r.date!==record.date),record])}
export function basketballRecord(date){return{date,items:[{name:'篮球',sets:[]}]}}
export function nextUnchecked(checkin){for(let i=0;i<checkin.sets.length;i++)for(let j=0;j<checkin.sets[i].sets.length;j++)if(!checkin.sets[i].sets[j].done)return[i,j];return null}