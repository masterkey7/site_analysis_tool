import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/workbench-harness.mjs';
import {createProjectStorage} from '../dist/project-storage.js';
import {cleanAnalysis,mergeAnalysisEdits} from '../dist/analysis-data.js';
import {createQuery} from '../analysis.mjs';
import {pngFromSvg} from '../dist/png-export.js';

test('H1/L1 重新生成保留微调、按地理身份而非序号匹配、可撤销且不覆盖取景书签',async()=>{
 const h=harness();await h.boot();h.get('confirmSite').click();const before=h.state(),old=before.analysis;
 h.run("state.analysis.features[1].name='保留名称';state.analysis.features[1].visible=false;state.analysis.features[1].radius=2345;state.analysis.features[1].labelPoint=[120.3,30.3];state.analysis.ringDistances=[2,8];state.analysis.options.links=false;");const edited=h.state().analysis;
 h.context.fetch=async url=>url==='/api/bootstrap'?{ok:true,json:async()=>({csrf:'x'})}:{ok:true,json:async()=>({...old,generatedAt:'new-result',features:[...old.features].reverse().map((f,i)=>({...f,id:'new-'+i}))})};
 await h.get('generateAnalysis').click();assert.equal(h.state().analysis.generatedAt,'new-result');const f=h.state().analysis.features.find(x=>x.sourceName===edited.features[1].sourceName);assert.equal(f.name,'保留名称');assert.equal(f.visible,false);assert.equal(f.radius,2345);assert.deepEqual(f.labelPoint,[120.3,30.3]);assert.deepEqual(h.state().analysis.ringDistances,[2,8]);assert.equal(h.state().analysis.options.links,false);assert.deepEqual(h.state().output,before.output);
 h.get('undoBtn').click();assert.deepEqual(h.state().analysis,edited);h.context.confirm=()=>false;h.get('clearAnalysis').click();assert.deepEqual(h.state().analysis,edited);h.context.confirm=()=>true;h.get('clearAnalysis').click();assert.equal(h.state().analysis,null);h.get('undoBtn').click();assert.deepEqual(h.state().analysis,edited);
 const fresh=cleanAnalysis(old),previous=cleanAnalysis(old);previous.features[0].poiId='old-poi';previous.features[0].name='不能串用';fresh.features[0].poiId='new-poi';assert.notEqual(mergeAnalysisEdits(previous,fresh).features[0].name,'不能串用');
});

test('H2 多窗口版本冲突保留新版；Web Locks 下同时写入也不能覆盖',async()=>{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},issues=[];let chain=Promise.resolve(),lockCalls=0;
 const locks={request(_,fn){lockCalls++;const p=chain.then(fn);chain=p.catch(()=>{});return p;}};
 const a=createProjectStorage({storage,key:'p',locks,newId:()=> 'a',onIssue:k=>issues.push(k)}),b=createProjectStorage({storage,key:'p',locks,newId:()=> 'b',onIssue:k=>issues.push(k)});a.markClean({name:'old'});b.markClean({name:'old'});
 const result=await Promise.all([a.save({name:'new A'}),b.save({name:'old B'})]);assert.deepEqual(result,[true,false]);assert.equal(JSON.parse(store.get('p')).state.name,'new A');assert.equal(lockCalls,2);assert.equal(b.conflict,true);assert.equal(b.dirty,true);assert.ok(issues.includes('conflict'));
 const c=createProjectStorage({storage,key:'p',newId:()=> 'c'});c.markClean({name:'new A'});assert.equal(await c.save({name:'new A'}),false);assert.equal(JSON.parse(store.get('p')).revision,'a');
});

test('H2/M4 不在关闭时写入；存储配额失败保留脏状态、醒目提示与备份入口',async()=>{
 const h=harness();await h.boot();const original=h.storage.get('site-atlas-amap-v2');await h.window.emit('beforeunload');assert.equal(h.storage.get('site-atlas-amap-v2'),original);
 h.context.localStorage.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};h.run("state.name='尚未保存项目';save();");h.flushSave();for(let i=0;i<5;i++)await Promise.resolve();assert.equal(h.get('storageWarning').hidden,false);assert.match(h.get('toast').textContent,/自动保存失败/);assert.equal(h.run('projectStorage.dirty'),true);
 let prevented=false;await h.window.emit('beforeunload',{preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.storage.get('site-atlas-amap-v2'),original);h.get('backupUnsaved').click();assert.match(h.downloads.at(-1).name,/尚未保存项目/);
});

test('M7 取消与 Esc 恢复原节点，完成才提交并记录撤销',async()=>{
 const h=harness();await h.boot();const before=h.state().boundary;h.get('boundaryEdit').click();h.run('sitePolygon.setPath([[120,30],[120.01,30],[120,30.01]])');h.get('cancelDrawing').click();assert.deepEqual(h.state().boundary,before);assert.equal(h.run('history.length'),0);
 h.get('boundaryEdit').click();h.run('sitePolygon.setPath([[120,30],[120.01,30],[120,30.01]])');await h.document.emit('keydown',{key:'Escape'});assert.deepEqual(h.state().boundary,before);
 h.get('boundaryEdit').click();h.run('sitePolygon.setPath([[120,30],[120.01,30],[120,30.01]])');h.get('finishEditing').click();assert.notDeepEqual(h.state().boundary,before);h.get('undoBtn').click();assert.deepEqual(h.state().boundary,before);
});

test('M1/L4 SDK 脚本加载失败仍可搜索，定位有明确提示，正常打开不预查奥体',async()=>{
 const h=harness();let searches=0;const fetch=h.context.fetch;h.context.fetch=(url,opts)=>{if(url.includes('/_AMapService/'))searches++;return fetch(url,opts);};h.document.head.append=script=>queueMicrotask(()=>script.onerror());await h.boot();assert.equal(h.run('online'),false);assert.match(h.get('emptyMessage').textContent,/拦截/);assert.equal(searches,0);
 h.get('searchInput').value='良渚';await h.run('searchPlaces(true)');assert.equal(searches,1);assert.ok(h.get('searchResults').children[0].onclick);h.get('searchResults').children[0].click();assert.match(h.get('toast').textContent,/地图组件尚未加载/);assert.equal(h.get('retryMap').disabled,false);
});

test('H3 标签重绘复用底图节点，预览采用 PNG，不再在分析层复制底图',async()=>{
 const h=harness();await h.boot();h.run("map.setZoomAndCenter(12,[120.22,30.25]);basemapMeta.previewAssetUrls={moss:{full:'/preview.png'}};state.mode='moss';");let writes=0,value='';Object.defineProperty(h.get('mapBackdrop'),'innerHTML',{get:()=>value,set:v=>{writes++;value=v;}});h.run('drawAnalysis()');assert.match(value,/preview.png/);assert.equal(writes,1);await h.drag(h.state().analysis.features[1].id);h.flushFrames();assert.equal(writes,1);assert.ok(!h.get('analysisOverlay').innerHTML.includes('<image'));
});

test('M2 动态导出资源 404 后按锁定取景重新准备一次，不再依赖失效 URL',async()=>{
 const h=harness();await h.boot();const b={sw:[120.1,30.1],ne:[120.4,30.4]};h.context.snapshot={state:h.state(),bounds:b,metadata:{dynamic:true,id:'stale',bounds:b}};let loads=0,prepare=0;h.context.load=async(st,m)=>{loads++;if(m.id==='stale'){const e=Error('gone');e.status=404;throw e;}return {full:'recovered'};};h.run('embeddedImages=load');h.context.fetch=async url=>{assert.ok(url.startsWith('/api/basemap?'));prepare++;return {ok:true,json:async()=>({dynamic:true,id:'fresh',bounds:b})};};const images=await h.run('prepareExportAssets(snapshot,new AbortController().signal)');assert.equal(images.full,'recovered');assert.equal(h.context.snapshot.metadata.id,'fresh');assert.equal(prepare,1);assert.equal(loads,2);
});

test('M6 取消中止查询和排队任务，后续查询不被旧任务占用',async()=>{
 let calls=0,started;const firstStarted=new Promise(r=>started=r);const controller=new AbortController();const query=createQuery(async(url,{signal})=>{calls++;if(calls===1){started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}return new Response('{"status":"1","pois":[]}');},{key:'test',securityCode:'private'},{interval:0,sleep:async()=>{}});
 const first=query('/v3/place/text',{keywords:'first'},{signal:controller.signal}),queued=query('/v3/place/text',{keywords:'queued'},{signal:controller.signal});const settled=Promise.allSettled([first,queued]);await firstStarted;controller.abort();const result=await settled;assert.ok(result.every(r=>r.status==='rejected'&&r.reason.name==='AbortError'));assert.equal(calls,1);await query('/v3/place/text',{keywords:'new'});assert.equal(calls,2);
});

test('PNG 导出执行解码和 toBlob，失败与取消均释放 URL 和画布（模拟内核）',async t=>{
 const previous={document:globalThis.document,Image:globalThis.Image,create:URL.createObjectURL,revoke:URL.revokeObjectURL};t.after(()=>{globalThis.document=previous.document;globalThis.Image=previous.Image;URL.createObjectURL=previous.create;URL.revokeObjectURL=previous.revoke;});let mode='ok',revoked=0,canvas,blobCalls=0;
 URL.createObjectURL=()=> 'blob:unit-test';URL.revokeObjectURL=()=>revoked++;globalThis.Image=class{set src(v){if(v)queueMicrotask(()=>mode==='decode-error'?this.onerror?.():this.onload?.());}};
 globalThis.document={fonts:{ready:Promise.resolve()},createElement:()=>canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(fn,type){blobCalls++;assert.equal(type,'image/png');assert.equal(canvas.width,4800);assert.equal(canvas.height,3600);fn(mode==='null-blob'?null:new Blob(['png'],{type}));}}};
 const blob=new Blob(['<svg/>']),signal=new AbortController().signal;assert.equal((await pngFromSvg(blob,4800,3600,signal)).type,'image/png');assert.equal(blobCalls,1);assert.equal(canvas.width,1);assert.equal(revoked,1);
 mode='decode-error';await assert.rejects(pngFromSvg(blob,4800,3600,signal),/转换失败/);mode='null-blob';await assert.rejects(pngFromSvg(blob,4800,3600,signal),/图片导出失败/);const c=new AbortController();c.abort();await assert.rejects(pngFromSvg(blob,4800,3600,c.signal),{name:'AbortError'});assert.equal(revoked,3);
});
