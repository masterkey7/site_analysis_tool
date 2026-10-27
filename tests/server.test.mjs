import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../serve.mjs';
test('本机配置、来源校验、密钥隔离、地图代理和删除完整流程',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-config-test-'));
 const key='1'.repeat(32),secret='a'.repeat(32);let upstream;
 const app=createApp({configDir:dir,fetcher:async url=>{upstream=new URL(url);if(upstream.pathname==='/v4/map/styles')return new Response(new Uint8Array([0,255,128,2]),{headers:{'content-type':'application/octet-stream'}});return new Response(JSON.stringify({status:'1',tips:[],echo:secret}),{headers:{'content-type':'application/json'}});}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${app.address().port}`;
 try {
  const boot=await (await fetch(origin+'/api/bootstrap')).json();assert.equal(boot.configured,false);assert.ok(boot.csrf);
  let res=await fetch(origin+'/api/config',{method:'POST',headers:{'Content-Type':'application/json','Origin':origin},body:JSON.stringify({key,securityCode:secret})});assert.equal(res.status,403);
  const headers={'Content-Type':'application/json','Origin':origin,'X-Atlas-Token':boot.csrf};
  assert.equal((await fetch(origin+'/api/location-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/api/location-analysis',{method:'POST',headers,body:'{}'})).status,400);
  assert.equal((await fetch(origin+'/api/location-analysis',{method:'POST',headers,body:JSON.stringify({siteConfirmed:true,boundary:[[120,30],[120.01,30],[120,30.01]],bounds:{sw:[119,29],ne:[121,31]}})})).status,503);
  res=await fetch(origin+'/api/config',{method:'POST',headers:{...headers,Origin:'https://unrelated.example'},body:'{}'});assert.equal(res.status,403);
  res=await fetch(origin+'/api/config',{method:'POST',headers,body:JSON.stringify({key:'bad',securityCode:secret})});assert.equal(res.status,400);
  res=await fetch(origin+'/api/config',{method:'POST',headers,body:JSON.stringify({key,securityCode:secret})});assert.equal(res.status,200);
  const publicConfig=await(await fetch(origin+'/api/bootstrap')).text();assert.ok(!publicConfig.includes(secret));assert.equal(JSON.parse(publicConfig).key,key);
  assert.equal((await fetch(origin+'/.local/amap.json')).status,404);assert.equal((await fetch(origin+'/serve.mjs')).status,404);
  const status=await(await fetch(origin+'/api/status')).text();assert.ok(!status.includes(key)&&!status.includes(secret));
  res=await fetch(origin+'/_AMapService/v3/assistant/inputtips?keywords=Hangzhou&key=wrong');assert.equal(res.status,200);assert.equal(upstream.hostname,'restapi.amap.com');assert.equal(upstream.searchParams.get('key'),key);assert.equal(upstream.searchParams.get('jscode'),secret);assert.ok(!(await res.text()).includes(secret));
  res=await fetch(origin+'/_AMapService/v4/map/styles?id=demo');assert.equal(res.status,200);assert.equal(upstream.hostname,'webapi.amap.com');assert.deepEqual(new Uint8Array(await res.arrayBuffer()),new Uint8Array([0,255,128,2]));
  assert.equal((await fetch(origin+'/_AMapService/anything')).status,403);
  for(const module of ['project-storage.js','png-export.js','satellite-export.js','html2canvas.min.js','analysis-data.js','analysis-svg.js','app.js','scene.js','workbench.css','hangzhou-sample.json','basemap-gray-water.png','basemap-dark-roads.png','basemap-full-moss.png','basemap-full-dark.png','basemap-full-light.png'])assert.equal((await fetch(origin+'/'+module)).status,200);
  res=await fetch(origin+'/api/config',{method:'DELETE',headers});assert.equal(res.status,200);assert.equal((await(await fetch(origin+'/api/status')).json()).configured,false);
  assert.equal((await fetch(origin+'/_AMapService/v3/assistant/inputtips')).status,503);
 }finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('atlas-config-test-'))throw new Error('Temporary test directory outside expected root');await fs.rm(dir,{recursive:true,force:true});}
});

test('客户端取消分析请求后服务端中止上游并释放互斥，不继续返回 429',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-cancel-test-'));await fs.writeFile(path.join(dir,'amap.json'),JSON.stringify({key:'1'.repeat(32),securityCode:'a'.repeat(32)}));
 let start,aborted,calls=0;const started=new Promise(r=>start=r),cancelled=new Promise(r=>aborted=r);
 const app=createApp({configDir:dir,fetcher:async(_,options)=>{calls++;if(calls===1){start();return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborted();reject(options.signal.reason);},{once:true}));}return new Response(JSON.stringify({status:'1',regeocode:{}}));}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.address().port}`;
 try{
  const boot=await(await fetch(origin+'/api/bootstrap')).json(),headers={'Content-Type':'application/json',Origin:origin,'X-Atlas-Token':boot.csrf},body=JSON.stringify({name:'取消测试',siteConfirmed:true,boundary:[[120,30],[120.01,30],[120,30.01]],bounds:{sw:[119,29],ne:[121,31]}}),controller=new AbortController();
  const result=fetch(origin+'/api/location-analysis',{method:'POST',headers,body,signal:controller.signal}).catch(e=>e);await started;controller.abort();await result;await cancelled;
  let response;for(let i=0;i<10;i++){response=await fetch(origin+'/api/location-analysis',{method:'POST',headers,body});if(response.status!==429)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(response.status,502);assert.match((await response.json()).error,/确定场地/);assert.equal(calls,2);
 }finally{app.closeAllConnections();await new Promise(r=>app.close(r));if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('atlas-cancel-test-'))throw Error('Unexpected temp path');await fs.rm(dir,{recursive:true,force:true});}
});
