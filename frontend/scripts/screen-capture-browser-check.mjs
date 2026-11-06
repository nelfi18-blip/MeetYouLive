// Local-only React lifecycle/bridge harness. No accounts, API, media or devices.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import assert from "node:assert/strict";
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const tools=createRequire(path.join(process.env.CAPTURE_BROWSER_TOOLS||"/tmp/capture-browser-tools","package.json"));
const {build}=tools("esbuild"),{chromium}=tools("playwright");
const folder=process.env.CAPTURE_BROWSER_ARTIFACTS||"/tmp/capture-browser-artifacts";
await mkdir(folder,{recursive:true});
const dictionary=JSON.parse(await readFile(path.join(frontend,"messages/en.json"),"utf8"));
const evidence={type:"Actual React hook, LiveSessionProvider and MiniPlayer; simulated Android bridge, no FLAG_SECURE enforcement or Agora media",checks:[],errors:[]};
let browser,server;
try{
  const result=await build({bundle:true,write:false,outfile:"fixture.js",jsx:"automatic",define:{"process.env.NODE_ENV":'"test"'},stdin:{resolveDir:frontend,loader:"jsx",contents:`
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {useAndroidScreenCaptureProtection,useAndroidScreenCaptureGuard} from './lib/screenCaptureProtection';
    import {LiveSessionProvider,useLiveSession} from './contexts/LiveSessionContext';import MiniPlayer from './components/live/MiniPlayer';
    import Boundary from './components/ScreenCaptureBoundary';
    window.fixtureCalls=[];window.fixturePath='/feed';window.fixturePlatform=new URLSearchParams(location.search).get('platform')||'android';
    function Guard({enabled,scope}){useAndroidScreenCaptureProtection(enabled,scope);return null;}
    function Room({id}){const capture=useAndroidScreenCaptureGuard(true,id);return <Boundary capture={capture}><div data-testid='room'>Synthetic Live frame</div></Boundary>;}
    function Harness(){const [route,setRoute]=useState('/feed');const api=useLiveSession();
      window.fixtureNavigate=p=>{window.fixturePath=p;setRoute(p)};
      window.fixture={...api,room:()=>{},navigate:window.fixtureNavigate};
      const inRoom=route.startsWith('/live/');
      return <><Guard enabled={route.startsWith('/chats/')||route.startsWith('/calls/')} scope={route}/>{inRoom&&<Room key={route} id={route}/>}<p>{route}</p><MiniPlayer/></>;}
    createRoot(document.getElementById('root')).render(<React.StrictMode><LiveSessionProvider><Harness/></LiveSessionProvider></React.StrictMode>);`},plugins:[{name:"local-fixtures",setup(b){
    const stubs={
      "@capacitor/core":"export const Capacitor={getPlatform:()=>window.fixturePlatform,isNativePlatform:()=>window.fixturePlatform!=='web'};export const registerPlugin=()=>({enable:async()=>{window.fixtureCalls.push(true);if(window.fixtureMissing)throw Object.assign(Error('missing plugin'),{code:'UNIMPLEMENTED'});if(window.fixtureFail)throw Object.assign(Error('synthetic bridge failure'),{code:'SCREEN_SECURITY_FAILED'});if(window.fixtureHold)await new Promise(r=>{window.fixtureAcknowledge=r});return window.fixtureLegacy?undefined:{screenSecurityContract:1,verifiedOnUiThread:true,secure:true}},disable:async()=>{window.fixtureCalls.push(false);return window.fixtureLegacy?undefined:{screenSecurityContract:1,verifiedOnUiThread:true,secure:false}}});",
      "next/navigation":"const router={push:p=>window.fixtureNavigate(p),replace:p=>window.fixtureNavigate(p)};export const useRouter=()=>router;export const usePathname=()=>window.fixturePath;",
      "@/contexts/LanguageContext":`const dictionary=${JSON.stringify(dictionary)};const t=k=>k.split('.').reduce((v,p)=>v?.[p],dictionary)||k;export const useLanguage=()=>({t});`,
      "@/lib/liveSession/liveSessionStore":"export const getSuspended=()=>null;export const closeOthers=()=>{};export const teardownSuspended=()=>{};",
    };
    b.onResolve({filter:/^(@capacitor\/core|next\/navigation|@\/contexts\/LanguageContext|@\/lib\/liveSession\/liveSessionStore)$/},a=>({path:a.path,namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"js"}));
    b.onResolve({filter:/^@\//},a=>{let p=path.join(frontend,a.path.slice(2));return {path:p+(a.path.includes("Context")||a.path.startsWith("@/components/")?".jsx":".js")};});
  }}]});
  server=createServer((req,res)=>{if(req.url==="/fixture.js"){res.setHeader("Content-Type","application/javascript");res.end(Buffer.from(result.outputFiles[0].contents));}else{res.setHeader("Content-Type","text/html");res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>');}});
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  browser=await chromium.launch({...(process.env.CAPTURE_CHROMIUM_PATH?{executablePath:process.env.CAPTURE_CHROMIUM_PATH}:{}),args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.on("pageerror",e=>evidence.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.fixture);
  const waitForFlag=async value=>{await page.waitForFunction(v=>window.fixtureCalls.at(-1)===v,value);};
  await waitForFlag(false);
  await page.evaluate(()=>window.fixture.navigate('/chats/synthetic'));await waitForFlag(true);
  await page.evaluate(()=>window.fixture.navigate('/login'));await waitForFlag(false);
  evidence.checks.push("Actual React effects: chat activation and login-route cleanup, including StrictMode");
  await page.evaluate(()=>{window.fixture.room({_id:'synthetic',isPrivate:true});window.fixture.navigate('/live/synthetic');window.fixture.openSession({liveId:'synthetic',screenCaptureSensitive:true,creatorName:'Synthetic creator'});});await waitForFlag(true);
  await page.evaluate(()=>{window.fixture.minimizeSession('synthetic');window.fixture.navigate('/feed');});
  await page.getByRole('dialog').waitFor();await waitForFlag(true);
  await page.screenshot({path:path.join(folder,'sensitive-mini-mobile.png'),fullPage:true});
  const beforeRestore = await page.evaluate(()=>window.fixtureCalls.filter(v=>!v).length);
  await page.evaluate(()=>window.fixture.restoreSession());await page.getByTestId('room').waitFor();await waitForFlag(true);
  assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(v=>!v).length),beforeRestore);
  await page.evaluate(()=>window.fixture.closeSession());
  await page.evaluate(()=>window.fixture.navigate('/feed'));await waitForFlag(false);
  evidence.checks.push("Full room and actual MiniPlayer handoff/restore retain the active-session owner; closing the last protected surface clears it");
  await page.evaluate(()=>{window.fixtureHold=true;window.fixture.navigate('/live/public');});
  await page.waitForFunction(()=>window.fixtureAcknowledge);
  assert.equal(await page.getByTestId('room').isVisible(),false);
  await page.screenshot({path:path.join(folder,'public-live-before-ack.png'),fullPage:true});
  await page.evaluate(()=>{window.fixtureHold=false;window.fixtureAcknowledge();});
  await page.getByTestId('room').waitFor();await waitForFlag(true);
  await page.screenshot({path:path.join(folder,'public-live-protected.png'),fullPage:true});
  await page.evaluate(()=>{window.fixture.openSession({liveId:'public'});window.fixture.minimizeSession('public');window.fixture.navigate('/feed');});
  await page.getByRole('dialog').waitFor();await waitForFlag(true);
  await page.evaluate(()=>window.fixture.navigate('/login'));await waitForFlag(false);assert.equal(await page.getByRole('dialog').count(),0);
  evidence.checks.push("Public free Live content concealed before delayed bridge acknowledgement; public mini-player protected; login hides it and releases ownership");
  await page.evaluate(()=>{window.fixture.closeSession();window.fixtureFail=true;window.fixture.navigate('/live/failure');});
  await page.getByRole('alert').waitFor();assert.equal(await page.getByTestId('room').isVisible(),false);
  await page.evaluate(()=>{window.fixtureFail=false;});
  await page.getByRole('button',{name:dictionary.screenCaptureProtection.retry,exact:true}).click();
  await page.getByTestId('room').waitFor();await waitForFlag(true);
  await page.evaluate(()=>window.fixture.navigate('/feed'));await waitForFlag(false);
  evidence.checks.push("Bridge rejection conceals Live content; explicit retry reveals only after protection; leaving clears the final owner");
  await page.evaluate(()=>{window.fixtureAcknowledge=null;window.fixtureHold=true;window.fixture.navigate('/live/stale');});
  await page.waitForFunction(()=>window.fixtureAcknowledge);
  await page.evaluate(()=>window.fixture.navigate('/feed'));
  await page.evaluate(()=>{window.fixtureHold=false;window.fixtureAcknowledge();});await waitForFlag(false);
  assert.equal(await page.getByTestId('room').count(),0);
  evidence.checks.push("Late acknowledgement after leaving cannot restore Live content and clears protection");
  await page.evaluate(()=>{window.fixtureLegacy=true;window.fixture.navigate('/live/old-native');});
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByTestId('room').isVisible(),false);
  await page.getByRole('link',{name:dictionary.screenCaptureProtection.update,exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:dictionary.screenCaptureProtection.retry,exact:true}).count(),0);
  await page.evaluate(()=>{window.fixture.openSession({liveId:'old-native'});window.fixture.minimizeSession('old-native');window.fixture.navigate('/feed');});
  await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').isVisible(),false);
  await page.screenshot({path:path.join(folder,'old-native-update-required.png'),fullPage:true});
  await page.evaluate(()=>{window.fixture.closeSession();window.fixture.navigate('/login');});await waitForFlag(false);
  evidence.checks.push("Old native empty ACK + new frontend: room and actual mini remain hidden, update required without bypass; logout cleans up");
  await page.evaluate(()=>{window.fixtureLegacy=false;window.fixtureMissing=true;window.fixture.navigate('/live/missing-plugin');});
  await page.getByRole('alert').waitFor();assert.equal(await page.getByTestId('room').isVisible(),false);
  await page.getByRole('link',{name:dictionary.screenCaptureProtection.update,exact:true}).waitFor();
  await page.evaluate(()=>{window.fixture.navigate('/feed');window.fixtureMissing=false;});await waitForFlag(false);
  for(const kind of ['public-free','private','VIP','paid']) {
    await page.evaluate(k=>window.fixture.navigate('/live/'+k),kind);
    await page.getByTestId('room').waitFor();await waitForFlag(true);
    await page.evaluate(()=>window.fixture.navigate('/calls/synthetic'));await waitForFlag(true);
    await page.evaluate(()=>window.fixture.navigate('/chats/synthetic'));await waitForFlag(true);
    await page.evaluate(()=>window.fixture.navigate('/login'));await waitForFlag(false);
  }
  evidence.checks.push("Missing native plugin requires update without showing Live; new contract reveals all four Live categories; call/chat ownership and logout cleanup retained (bridge simulation)");
  for(const platform of ['web','ios']) {
    const other=await browser.newPage();
    other.on('pageerror',e=>evidence.errors.push(e.message));
    await other.goto(`http://127.0.0.1:${server.address().port}/?platform=${platform}`);
    await other.waitForFunction(()=>window.fixture);
    await other.evaluate(()=>window.fixture.navigate('/live/public'));
    await other.getByTestId('room').waitFor();
    await other.evaluate(()=>{window.fixture.openSession({liveId:'public'});window.fixture.minimizeSession('public');window.fixture.navigate('/feed');});
    await other.getByRole('dialog').waitFor();
    assert.deepEqual(await other.evaluate(()=>window.fixtureCalls),[]);
    await other.close();
  }
  evidence.checks.push("Web/PWA and iOS render Live and mini-player without native bridge calls or Android wait gate");
  evidence.calls=await page.evaluate(()=>window.fixtureCalls);assert.deepEqual(evidence.errors,[]);evidence.success=true;console.log(JSON.stringify(evidence,null,2));
}catch(e){evidence.failure=e.message;throw e;}finally{await writeFile(path.join(folder,"results.json"),JSON.stringify(evidence,null,2));await browser?.close();await new Promise(r=>server?.close(r)||r());}
