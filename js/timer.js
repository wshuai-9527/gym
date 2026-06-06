export class TimerManager{
  constructor(appState){this.state=appState;this.handlers=new Map();this.interval=null;this.restAlarmed=false}
  on(event,fn){if(!this.handlers.has(event))this.handlers.set(event,new Set());this.handlers.get(event).add(fn)}
  emit(event,payload){this.handlers.get(event)?.forEach(fn=>fn(payload))}
  ensure(){const t=this.state.state.timers;t.work=t.work||{running:false,startAt:0,elapsed:0,laps:[]};t.rest=t.rest||{duration:90,running:false,endAt:0}}
  startLoop(){if(this.interval)return;this.interval=setInterval(()=>{this.emit('tick',this.snapshot());this.checkRestDone()},250)}
  snapshot(){this.ensure();return{work:this.workSeconds(),rest:this.restRemaining(),restDuration:this.state.state.timers.rest.duration,workRunning:this.state.state.timers.work.running,restRunning:this.state.state.timers.rest.running,laps:this.state.state.timers.work.laps||[]}}
  workSeconds(){const w=this.state.state.timers.work;return Math.floor((w.elapsed+(w.running?Date.now()-w.startAt:0))/1000)}
  toggleWork(){this.ensure();const w=this.state.state.timers.work;if(w.running){w.elapsed+=Date.now()-w.startAt;w.running=false}else{w.startAt=Date.now();w.running=true}this.startLoop();this.emit('tick',this.snapshot())}
  resetWork(){this.state.state.timers.work={running:false,startAt:0,elapsed:0,laps:[]};this.emit('tick',this.snapshot())}
  lap(){const w=this.state.state.timers.work;w.laps=w.laps||[];w.laps.push({time:this.workSeconds(),at:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});this.emit('tick',this.snapshot())}
  setRest(sec){const r=this.state.state.timers.rest;r.duration=Math.max(10,+sec||90);r.running=false;r.endAt=0;this.restAlarmed=false;this.emit('tick',this.snapshot())}
  startRest(sec){this.ensure();const r=this.state.state.timers.rest;if(sec)r.duration=sec;r.endAt=Date.now()+r.duration*1000;r.running=true;this.restAlarmed=false;this.startLoop();this.emit('tick',this.snapshot())}
  toggleRest(){const r=this.state.state.timers.rest;if(r.running){r.duration=this.restRemaining();r.running=false}else this.startRest(r.duration)}
  addRest(sec){const r=this.state.state.timers.rest;if(r.running)r.endAt+=sec*1000;else r.duration=Math.max(10,r.duration+sec);this.emit('tick',this.snapshot())}
  resetRest(){const r=this.state.state.timers.rest;r.running=false;r.endAt=0;this.restAlarmed=false;this.emit('tick',this.snapshot())}
  restRemaining(){const r=this.state.state.timers.rest;if(!r.running)return r.duration;return Math.max(0,Math.ceil((r.endAt-Date.now())/1000))}
  checkRestDone(){const r=this.state.state.timers.rest;if(r.running&&this.restRemaining()<=0&&!this.restAlarmed){r.running=false;this.restAlarmed=true;this.emit('rest-done',this.snapshot())}}
}