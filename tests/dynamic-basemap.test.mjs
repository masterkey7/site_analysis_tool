import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {planTiles,createBasemapService} from '../basemap-service.mjs';
import {coversBounds} from '../dist/basemap.js';
import {renderScene} from '../dist/scene.js';
import {initialState} from '../dist/core.js';
test('大范围自动降低瓦片级别，近景增加细节，覆盖当前取景且数量受控',()=>{
 const near=planTiles({sw:[120.2,30.2],ne:[120.24,30.24]}),wide=planTiles({sw:[119.55,29.78],ne:[120.95,30.70]}),region=planTiles({sw:[118,29],ne:[122,32]});
 assert.equal(near.z,14);assert.ok(wide.z<near.z);assert.ok(region.z<wide.z);
 for(const p of [near,wide,region])assert.ok(p.tiles.length>0&&p.tiles.length<=80);
 assert.ok(coversBounds(wide,{sw:[119.55,29.78],ne:[120.95,30.70]}));
 for(const b of [null,{}, {sw:[120,30],ne:[119,31]}, {sw:[120,NaN],ne:[121,32]}])assert.throws(()=>planTiles(b),/范围无效/);
});
test('范围资源去重缓存，三种样式可独立下载，预览与导出都使用动态资源',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-map-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/openfreemap-tiles.json'),JSON.stringify({tiles:['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf']}));
 let calls=0;const service=createBasemapService({root,fetcher:async url=>{assert.ok(url.startsWith('https://tiles.openfreemap.org/planet/'));calls++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};}}),bounds={sw:[119.5,29.7],ne:[121,30.8]};
 const [a,b]=await Promise.all([service.prepare(bounds),service.prepare(bounds)]);assert.deepEqual(a,b);assert.equal(calls,a.tiles);await service.prepare(bounds);assert.equal(calls,a.tiles);
 const s=initialState();for(const mode of ['light','moss','dark']){s.mode=mode;const asset=service.layer(a.id,mode,'full');assert.ok(asset.startsWith('<svg'));assert.match(a.previewAssetUrls[mode].full,/format=png/);const png=await service.rasterLayer(a.id,mode,'full');assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.ok(png.readUInt32BE(16)<=2400);assert.ok(png.readUInt32BE(20)<=2400);assert.equal(await service.rasterLayer(a.id,mode,'full'),png);const preview=renderScene(s,bounds,a);assert.ok(preview.includes('/api/basemap-layer?'));assert.ok(!preview.includes('/basemap-full-'));const output=renderScene(s,bounds,a,{images:{full:'data:image/svg+xml;base64,'+Buffer.from(asset).toString('base64')},pixelWidth:4800,pixelHeight:3600});assert.ok(output.includes('data:image/svg+xml'));assert.ok(!output.includes('href="/'));}
 assert.throws(()=>service.layer(a.id,'unknown','full'),/图层无效/);assert.throws(()=>service.layer('missing','light','full'),/缓存/);
});
test('视图加载完成或失败后不会反复请求同一范围，移动后才重新加载',async()=>{
 const source=await fs.readFile(new URL('../dist/app.js',import.meta.url),'utf8'),bounds={sw:[119,29],ne:[121,31]},meta={bounds:{sw:[120,30],ne:[120.4,30.4]},zoom:13};let scheduled=0;
 const context=vm.createContext({map:{getZoom:()=>15},basemapReady:true,rangeLoading:false,basemapMeta:meta,frameBounds:()=>bounds,worldBounds:()=>bounds,coversBounds,loadedRange:'',failedRange:'',rangeTimer:null,clearTimeout(){},setTimeout(){scheduled++;},expandBasemap(){}});
 vm.runInContext(source.slice(source.indexOf('function queueBasemap()'),source.indexOf('async function expandBasemap')),context);context.queueBasemap();assert.equal(scheduled,1);context.loadedRange=JSON.stringify(bounds);context.queueBasemap();assert.equal(scheduled,1);context.loadedRange='';context.failedRange=JSON.stringify(bounds);context.queueBasemap();assert.equal(scheduled,1);context.failedRange='';context.rangeLoading=true;context.queueBasemap();assert.equal(scheduled,1);
});
