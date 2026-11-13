// Real entry UI with synthetic metadata and socket boundary. All requests are
// fulfilled locally: no remote accounts, photographs, provider assets or fees.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://meetyoulive-git-feat-vcr-horizon-3d-world-meetyoulive.vercel.app';
const api='https://meetyoulive-world-test.onrender.com';
const artifacts=process.env.WORLD_ENTRY_ARTIFACTS||'/tmp/world-entry-artifacts';
await mkdir(artifacts,{recursive:true});
const stubs={
 'next/link':'export default function Link(p){return React.createElement("a",p,p.children)}',
 'next-auth/react':'export const useSession=()=>({status:"authenticated",data:null});',
 'socket.io-client':'export const io=()=>({});',
 '@/lib/token':'export const getToken=()=>"synthetic-entry-fixture";export const setToken=()=>{};',
 '@/contexts/LanguageContext':'export const useLanguage=()=>({t:key=>key.split(".").reduce((v,k)=>v?.[k],window.fixture.messages)||key});',
 '@/lib/vcr/presence':'export const createVcrPresence=()=>({join(){},leave(){},close(){},changeCountry(){}});',
};
const output=await build({write:false,bundle:true,format:'iife',jsx:'automatic',outdir:'/tmp/world-entry-build',
 stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import PhotoWorld from './components/vcr/PhotoWorld.jsx';createRoot(document.getElementById('root')).render(<PhotoWorld onEnterWalk={s=>window.fixture.entries.push(s)}/>);`},
 define:{'process.env.NEXT_PUBLIC_WORLD_TEST_MODE':'"isolated"','process.env.NEXT_PUBLIC_API_URL':JSON.stringify(api),'process.env.NODE_ENV':'"production"'},
 plugins:[{name:'synthetic-entry-boundaries',setup(b){
  b.onResolve({filter:/^(next\/link|next-auth\/react|socket.io-client|@\/lib\/token|@\/contexts\/LanguageContext|@\/lib\/vcr\/presence)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:'import React from "react";'+stubs[a.path],resolveDir:root}));
  b.onResolve({filter:/^@\//},a=>({path:path.join(root,a.path.slice(2))+(path.extname(a.path)?'':'.js')}));
 }}]});
const js=output.outputFiles.find(x=>x.path.endsWith('.js')).text;
const css=output.outputFiles.find(x=>x.path.endsWith('.css'))?.text||'';
const results={fixture:'Real PhotoWorld and scene-session validator; synthetic responses/socket; no remote or physical-phone validation',checks:[]};
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.VCR_CHROMIUM_PATH?{executablePath:process.env.VCR_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 for(const lang of ['es','en','pt']){
  const messages=JSON.parse(await readFile(path.join(root,'messages',lang+'.json'),'utf8'));
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let status=404,malformed=false;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization','access-control-allow-methods':'GET'}});
   if(url.origin===origin&&url.pathname==='/bundle.js')return route.fulfill({contentType:'application/javascript',body:js});
   if(url.origin===origin&&url.pathname==='/bundle.css')return route.fulfill({contentType:'text/css',body:css});
   if(url.origin===origin&&url.pathname==='/vcr')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><div id="root"></div><script>window.fixture=${JSON.stringify({messages,entries:[]})}</script><script src="/bundle.js"></script>`});
   if(url.origin===api&&url.pathname.startsWith('/api/world-ai/scenes/')){
    const country=url.pathname.split('/').at(-1),id='dc2c65e4-68d3-4210-a01e-7a54cc9ded2a',splatSha256='a'.repeat(64),colliderSha256='b'.repeat(64);
    const payload={descriptor:{country,provider:'worldlabs-marble',providerWorldId:id,generatedByAi:true,aiContentLabelRequired:true,interactionReady:false,splat100kUrl:'https://assets.example.invalid/a.spz',colliderGlbUrl:'https://assets.example.invalid/a.glb',splatSha256,colliderSha256},navigation:{schemaVersion:1,country,providerWorldId:id,splatSha256,colliderSha256,coordinateFrame:'three-y-up-meters',width:16,height:16,originX:-8,originZ:-8,cellSize:1,floorY:Array.from({length:16},()=>Array(16).fill(0)),spawn:{x:0,y:0,z:0,yaw:0}}};
    return route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify(status===200&&!malformed?payload:{})});
   }
   if(url.origin===api)return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':origin},body:'{}'});
   return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#20232a"/><text x="40" y="300" fill="white">SYNTHETIC ENTRY UI FIXTURE</text></svg>'});
  });
  await page.goto(origin+'/vcr');
  const enter=()=>page.getByRole('button',{name:messages.vcrWorld.start,exact:true}).or(page.getByRole('button',{name:messages.worldPhoto.retryEnter,exact:true}));
  await enter().click();
  await page.getByText(messages.worldPhoto.approvedSceneUnavailable,{exact:true}).waitFor({timeout:5000}).catch(async e=>{console.error(await page.locator('[role=alert]').allTextContents(),errors);throw e;});
  assert.deepEqual(await page.evaluate(()=>window.fixture.entries),[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(artifacts,lang+'-missing-scene-mobile.png'),fullPage:true});
  results.checks.push(lang+': missing scene explained, no automatic procedural navigation, mobile width fits');
  for(const next of [401,403,500,200]){
   status=next;malformed=next===200;await enter().click();
   await page.getByRole('alert').filter({hasText:next===401?messages.worldPhoto.testSessionExpired:messages.worldPhoto.walkingConnectionError}).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.fixture.entries),[]);
  }
  results.checks.push(lang+': 401/403/500 and malformed metadata cannot enter a world');
  status=404;malformed=false;await enter().click();
  await page.getByText(messages.worldPhoto.approvedSceneUnavailable,{exact:true}).waitFor();
  await page.getByRole('button',{name:messages.worldPhoto.tryPrototypeWalk,exact:true}).click();
  assert.equal(await page.evaluate(()=>window.fixture.entries.length),1);
  assert.equal(await page.evaluate(()=>window.fixture.entries[0].mode),undefined);
  await page.evaluate(()=>{window.fixture.entries=[]});
  await page.getByRole('button',{name:messages.vcrWorld.countries.fr,exact:true}).click();
  assert.equal(await page.getByText(messages.worldPhoto.approvedSceneUnavailable,{exact:true}).count(),0);
  results.checks.push(lang+': prototype requires explicit click; changing countries clears missing-scene state');
  status=200;malformed=false;await enter().click();await page.waitForFunction(()=>window.fixture.entries.length===1);
  assert.equal(await page.evaluate(()=>window.fixture.entries[0].mode),'ai');
  assert.equal(await page.evaluate(()=>window.fixture.entries[0].initialCountry),'fr');
  results.checks.push(lang+': valid synthetic metadata selects AI route; real assets not validated');
  assert.deepEqual(errors,[]);await context.close();
 }
 results.success=true;console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await writeFile(path.join(artifacts,'results.json'),JSON.stringify(results,null,2));}
