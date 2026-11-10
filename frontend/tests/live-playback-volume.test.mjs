import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bindLivePlaybackVolume } from "../lib/livePlaybackVolume.js";
import { createScreenCaptureProtectionController } from "../lib/screenCaptureProtectionController.js";
import { applyVerifiedScreenSecurity } from "../lib/screenSecurityContract.js";
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture() {
  const handlers=new Map();
  const track=()=>({volume:100,playing:true,changes:[],setVolume(value){this.volume=value;this.changes.push(value);},stop(){this.playing=false;}});
  const first=track(),second=track(),local={publishing:true,microphone:true};
  const client={remoteUsers:[{audioTrack:first},{audioTrack:second}],local,
    on(event,listener){if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event).add(listener);},
    off(event,listener){handlers.get(event)?.delete(listener);},
    emit(event){for(const listener of handlers.get(event)||[])listener();}};
  return {client,first,second,local,track,handlers};
}
for(const role of ["viewer","host","guest"])for(const state of ["loading","failure","timeout","update-required"])
  test(`${role} remote playback is silent during ${state}; local publication is untouched`,()=>{
    const f=fixture();const stop=bindLivePlaybackVolume(f.client,{ready:false,muted:false});
    assert.equal(f.first.volume,0);assert.equal(f.second.volume,0);
    assert.deepEqual(f.local,{publishing:true,microphone:true});stop();
  });
test("ready playback preserves explicit mute and resumes all remote participants after confirmation",()=>{
  const f=fixture();let stop=bindLivePlaybackVolume(f.client,{ready:false,muted:false});stop();
  stop=bindLivePlaybackVolume(f.client,{ready:true,muted:true});assert.equal(f.first.volume,0);stop();
  stop=bindLivePlaybackVolume(f.client,{ready:true,muted:false});assert.equal(f.first.volume,100);assert.equal(f.second.volume,100);stop();
});
test("a suspended session stays silent after remote-track replacement/reconnection",()=>{
  const f=fixture();const stop=bindLivePlaybackVolume(f.client,{ready:false,muted:false});
  for(const event of ["user-published","connection-state-change"]){const next=f.track();f.client.remoteUsers=[{audioTrack:next}];f.client.emit(event);assert.equal(next.volume,0);}stop();
});
test("cleanup removes only these playback listeners and never unmutes by itself",()=>{
  const f=fixture();let existing=0;f.client.on("user-published",()=>existing++);
  const stop=bindLivePlaybackVolume(f.client,{ready:false,muted:false});stop();f.client.emit("user-published");
  assert.equal(existing,1);assert.equal(f.first.volume,0);assert.equal(f.handlers.get("connection-state-change").size,0);
});
test("failed volume operation falls back to stopping only remote playout",()=>{
  const f=fixture();f.first.setVolume=()=>{throw Error("synthetic stale track");};
  const stop=bindLivePlaybackVolume(f.client,{ready:false,muted:false});assert.equal(f.first.playing,false);assert.equal(f.local.microphone,true);stop();
});
test("missing client is a safe no-op before a session exists",()=>assert.equal(bindLivePlaybackVolume(null,{ready:false,muted:false}),undefined));
test("verified window is reused across room → mini → restore without another native operation",async()=>{
  const calls=[],c=createScreenCaptureProtectionController(async enabled=>{calls.push(enabled);return true;});
  assert.equal(c.isProtected(),false);const room=c.acquire();await c.reconcile();assert.equal(c.isProtected(),true);
  const mini=c.acquire();room();assert.equal(c.isProtected(),true);await c.reconcile();
  const restore=c.acquire();mini();assert.equal(c.isProtected(),true);await c.reconcile();assert.deepEqual(calls,[true]);
  restore();assert.equal(c.isProtected(),false);await c.reconcile();assert.deepEqual(calls,[true,false]);
});
test("a pending disable cannot be mistaken for retained verified protection",async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  const c=createScreenCaptureProtectionController(async enabled=>{if(!enabled)await pending;return true;});
  const old=c.acquire();await c.reconcile();old();await tick();const next=c.acquire();assert.equal(c.isProtected(),false);
  finish();await c.reconcile();assert.equal(c.isProtected(),true);next();await c.reconcile();
});
for(const kind of ["old-empty-ack","missing-plugin","timeout"])
  test(`unverified ${kind} never becomes reusable playback authorization`,async()=>{
    const plugin={enable:()=>kind==="timeout"?new Promise(()=>{}):kind==="missing-plugin"?Promise.reject({code:"UNIMPLEMENTED"}):Promise.resolve(),disable:()=>Promise.resolve()};
    const c=createScreenCaptureProtectionController(async enabled=>(await applyVerifiedScreenSecurity(plugin,enabled,5)).success);
    const release=c.acquire();await c.reconcile();assert.equal(c.isProtected(),false);release();await c.reconcile();
  });
test("the actual Live mounts its unchanged media component only after readiness",async()=>{
  const source=await readFile(new URL("../app/live/[id]/page.jsx",import.meta.url),"utf8");
  assert.match(source,/capture\.ready && <LiveRoomContent \/>/);
  const mini=await readFile(new URL("../components/live/MiniPlayer.jsx",import.meta.url),"utf8");
  assert.match(mini,/ready: capture\.ready && !hidden/);assert.match(mini,/bindLivePlaybackVolume/);
});
