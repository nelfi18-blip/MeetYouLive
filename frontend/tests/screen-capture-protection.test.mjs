import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createScreenCaptureProtectionController as controller } from "../lib/screenCaptureProtectionController.js";
import { isSensitiveLiveScreen as sensitive } from "../lib/liveScreenCapturePolicy.js";
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r;});return {promise,resolve}; };
for (const [name, props, expected] of [
  ["public",{},false],["public admitted",{hasAccess:true,hasVipAccess:true},false],
  ["private gate",{isPrivate:true,hasAccess:false},true],["private admitted",{isPrivate:true,hasAccess:true},true],
  ["VIP gate",{isVipOnly:true,hasVipAccess:false},true],["VIP admitted",{isVipOnly:true,hasVipAccess:true},true],
  ["paid without private flag",{entryCost:50},true],["paid string",{entryCost:"10"},true],["free string",{entryCost:"0"},false],
]) test(`Live policy: ${name}`,()=>assert.equal(sensitive({_id:"a",...props}),expected));
test("old sensitive content stays protected until public replacement metadata is rendered",()=>{assert.equal(sensitive(null),false);assert.equal(sensitive({_id:"old",isPrivate:true}),true);assert.equal(sensitive({_id:"new",isPrivate:false,entryCost:0}),false);});
test("overlapping owners and inactive surfaces cannot unlock each other",async()=>{
  const calls=[],c=controller(async v=>{calls.push(v);return true;});const a=c.acquire();await c.reconcile();const b=c.acquire();await c.reconcile();a();await c.reconcile();assert.deepEqual(calls,[true]);b();await c.reconcile();assert.deepEqual(calls,[true,false]);
});
test("late enable cleanup cannot unlock a new sensitive screen",async()=>{
  const first=deferred(),calls=[];let active=0,max=0;const c=controller(async v=>{calls.push(v);max=Math.max(max,++active);if(calls.length===1)await first.promise;active--;return true;});
  const a=c.acquire();await tick();a();const b=c.acquire();first.resolve();await c.reconcile();assert.deepEqual(calls,[true]);assert.equal(max,1);b();await c.reconcile();assert.deepEqual(calls,[true,false]);
});
test("unmount while enable is pending eventually clears the window",async()=>{
  const first=deferred(),calls=[],c=controller(async v=>{calls.push(v);if(v)await first.promise;return true;});const a=c.acquire();await tick();a();first.resolve();await c.reconcile();assert.deepEqual(calls,[true,false]);
});
test("acquire during pending disable re-enables last",async()=>{
  const off=deferred(),calls=[],c=controller(async v=>{calls.push(v);if(!v)await off.promise;return true;});const a=c.acquire();await c.reconcile();a();await tick();const b=c.acquire();off.resolve();await c.reconcile();assert.deepEqual(calls,[true,false,true]);b();await c.reconcile();
});
test("StrictMode cleanup/remount coalesces; release is idempotent",async()=>{
  const calls=[],c=controller(async v=>{calls.push(v);return true;});const a=c.acquire();a();a();const b=c.acquire();await c.reconcile();assert.deepEqual(calls,[true]);b();b();await c.reconcile();assert.deepEqual(calls,[true,false]);
});
test("bridge rejection does not poison cleanup or future acquisition",async()=>{
  const calls=[],c=controller(async v=>{calls.push(v);if(calls.length===1)throw Error("synthetic bridge failure");return true;});const a=c.acquire();await tick();a();await c.reconcile();const b=c.acquire();await c.reconcile();b();await c.reconcile();assert.deepEqual(calls,[true,false,true,false]);
});
test("a false bridge result is retried on next reconciliation",async()=>{
  const calls=[],c=controller(async v=>{calls.push(v);return calls.length>1;});const a=c.acquire();await tick();await c.reconcile();assert.deepEqual(calls,[true,true]);a();await c.reconcile();
});
// Execute the actual hook with controlled effect lifetimes and a simulated
// Capacitor bridge. This tests the contract, not Android window enforcement.
async function fixture({platform="android",native=true,ssr=false,fail=false}={}) {
  const source=await readFile(new URL("../lib/screenCaptureProtection.js",import.meta.url),"utf8");
  const calls=[],effects=new Map();let cursor=0;
  const context={createScreenCaptureProtectionController:controller,getMobilePlatform:()=>platform,isNativeMobileApp:()=>native,
    registerPlugin:name=>{assert.equal(name,"ScreenSecurity");return {enable:async()=>{calls.push(true);if(fail)throw Error("synthetic");},disable:async()=>{calls.push(false);if(fail)throw Error("synthetic");}};},console:{warn(){}},
    useEffect(effect,deps){const key=cursor++,old=effects.get(key);if(old&&deps.every((d,i)=>Object.is(d,old.deps[i])))return;old?.cleanup?.();effects.set(key,{deps,cleanup:effect()});}};
  if(!ssr)context.window={};vm.createContext(context);
  vm.runInContext(source.replace(/^import .*;$/gm,"").replace(/export (async )?function /g,"$1function "),context);
  return {calls,async render(items){cursor=0;items.forEach(([v,key])=>context.useAndroidScreenCaptureProtection(v,key));await tick();},async clear(){for(const effect of effects.values())effect.cleanup?.();effects.clear();await tick();},imperative:context.setAndroidScreenCaptureProtection};
}
for(const opts of [{platform:"web",native:false},{platform:"android",native:false},{platform:"ios"},{ssr:true}])
  test(`no native calls outside installed Android: ${JSON.stringify(opts)}`,async()=>{const f=await fixture(opts);await f.render([[true,"chat"]]);await f.clear();assert.deepEqual(f.calls,[]);assert.equal(await f.imperative(true),false);});
test("chat → private room → public room → logout/unmount",async()=>{
  const f=await fixture();await f.render([[true,"chat"]]);await f.render([[true,"room"]]);assert.deepEqual(f.calls,[true]);await f.render([[false,"public"]]);assert.deepEqual(f.calls,[true,false]);await f.render([[true,"chat2"]]);await f.clear();assert.deepEqual(f.calls,[true,false,true,false]);
});
test("mini-player handoff stays secure until hidden on login or closed",async()=>{
  const f=await fixture();await f.render([[true,"room"],[false,"mini"]]);await f.render([[false,"room"],[true,"mini"]]);assert.deepEqual(f.calls,[true]);await f.render([[false,"room"],[false,"mini"]]);assert.deepEqual(f.calls,[true,false]);await f.clear();
});
test("imperative disable and inactive hooks cannot override a protected call",async()=>{
  const f=await fixture();await f.render([[true,"call"],[false,"exclusive"]]);await f.imperative(true);await f.imperative(false);assert.deepEqual(f.calls,[true]);await f.clear();assert.deepEqual(f.calls,[true,false]);
});
test("hook bridge failure stays non-fatal on teardown",async()=>{const f=await fixture({fail:true});await f.render([[true,"chat"]]);await f.clear();assert.deepEqual(f.calls,[true,false]);});
test("actual route/mini-player wiring stays scoped; provider only stores metadata",async()=>{
  const read=p=>readFile(new URL(p,import.meta.url),"utf8");const [chat,room,mini,provider]=await Promise.all([read("../app/chats/[id]/page.jsx"),read("../app/live/[id]/page.jsx"),read("../components/live/MiniPlayer.jsx"),read("../contexts/LiveSessionContext.jsx")]);
  assert.match(chat,/useAndroidScreenCaptureProtection\(true, id\)/);assert.match(room,/useAndroidScreenCaptureProtection\(sensitiveLiveScreen && !error && !hostSessionConflict, id\)/);
  assert.equal((room.match(/screenCaptureSensitive: isSensitiveLiveScreen\(live\)/g)||[]).length,2);assert.match(mini,/useAndroidScreenCaptureProtection\(visible && session.screenCaptureSensitive, liveId\)/);
  assert.match(provider,/screenCaptureSensitive: false/);assert.doesNotMatch(provider,/useAndroidScreenCaptureProtection\(/);
});
