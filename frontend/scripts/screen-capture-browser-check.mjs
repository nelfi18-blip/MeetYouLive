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
    import {useAndroidScreenCaptureProtection} from './lib/screenCaptureProtection';
    import {LiveSessionProvider,useLiveSession} from './contexts/LiveSessionContext';import MiniPlayer from './components/live/MiniPlayer';
    import {isSensitiveLiveScreen} from './lib/liveScreenCapturePolicy';
    window.fixtureCalls=[];window.fixturePath='/feed';
    function Guard({enabled,scope}){useAndroidScreenCaptureProtection(enabled,scope);return null;}
    function Harness(){const [route,setRoute]=useState('/feed'),[room,setRoom]=useState(null);const api=useLiveSession();
      window.fixtureNavigate=p=>{window.fixturePath=p;setRoute(p)};
      window.fixture={...api,room:meta=>setRoom(meta),navigate:window.fixtureNavigate};
      const inRoom=route.startsWith('/live/');
      return <><Guard enabled={route.startsWith('/chats/')} scope={route}/><Guard enabled={inRoom&&isSensitiveLiveScreen(room)} scope={route}/><p>{route}</p><MiniPlayer/></>;}
    createRoot(document.getElementById('root')).render(<React.StrictMode><LiveSessionProvider><Harness/></LiveSessionProvider></React.StrictMode>);`},plugins:[{name:"local-fixtures",setup(b){
    const stubs={
      "@capacitor/core":"export const Capacitor={getPlatform:()=> 'android',isNativePlatform:()=>true};export const registerPlugin=()=>({enable:async()=>{window.fixtureCalls.push(true)},disable:async()=>{window.fixtureCalls.push(false)}});",
      "next/navigation":"const router={push:p=>window.fixtureNavigate(p),replace:p=>window.fixtureNavigate(p)};export const useRouter=()=>router;export const usePathname=()=>window.fixturePath;",
      "@/contexts/LanguageContext":`const dictionary=${JSON.stringify(dictionary)};const t=k=>k.split('.').reduce((v,p)=>v?.[p],dictionary)||k;export const useLanguage=()=>({t});`,
      "@/lib/liveSession/liveSessionStore":"export const getSuspended=()=>null;export const closeOthers=()=>{};export const teardownSuspended=()=>{};",
    };
    b.onResolve({filter:/^(@capacitor\/core|next\/navigation|@\/contexts\/LanguageContext|@\/lib\/liveSession\/liveSessionStore)$/},a=>({path:a.path,namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:stubs[a.path],loader:"js"}));
    b.onResolve({filter:/^@\//},a=>{let p=path.join(frontend,a.path.slice(2));return {path:p+(a.path.includes("Context")?".jsx":".js")};});
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
  await page.evaluate(()=>window.fixture.updateScreenCaptureSensitivity('foreign-room',false));await waitForFlag(true);
  await page.evaluate(()=>window.fixture.updateScreenCaptureSensitivity('synthetic',false));await waitForFlag(false);
  await page.evaluate(()=>window.fixture.updateScreenCaptureSensitivity('synthetic',true));await waitForFlag(true);
  await page.evaluate(()=>window.fixture.closeSession());await waitForFlag(false);assert.equal(await page.getByRole('dialog').count(),0);
  evidence.checks.push("Actual session metadata and MiniPlayer: minimize, foreign update ignored, dynamic public/private changes and explicit close release protection");
  await page.evaluate(()=>{window.fixture.room({_id:'public',entryCost:0,isPrivate:false,isVipOnly:false});window.fixture.navigate('/live/public');});await waitForFlag(false);
  await page.evaluate(()=>{window.fixture.openSession({liveId:'public',screenCaptureSensitive:false});window.fixture.minimizeSession('public');window.fixture.navigate('/feed');});await page.getByRole('dialog').waitFor();await waitForFlag(false);
  await page.evaluate(()=>{window.fixture.updateScreenCaptureSensitivity('public',true);});await waitForFlag(true);
  await page.evaluate(()=>window.fixture.navigate('/login'));await waitForFlag(false);assert.equal(await page.getByRole('dialog').count(),0);
  evidence.checks.push("Public room and public mini-player remain unprotected; login hides sensitive mini-player and releases its owner");
  evidence.calls=await page.evaluate(()=>window.fixtureCalls);assert.deepEqual(evidence.errors,[]);evidence.success=true;console.log(JSON.stringify(evidence,null,2));
}catch(e){evidence.failure=e.message;throw e;}finally{await writeFile(path.join(folder,"results.json"),JSON.stringify(evidence,null,2));await browser?.close();await new Promise(r=>server?.close(r)||r());}
