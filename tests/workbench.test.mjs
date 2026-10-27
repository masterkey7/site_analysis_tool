import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {initialState,validateProject} from '../dist/core.js';
import {cleanAnalysis} from '../dist/analysis-data.js';
import {renderScene,baseLayers,layerUrl,fullUrl} from '../dist/scene.js';
import {boundsProjection} from '../dist/analysis-svg.js';
const sample=cleanAnalysis(JSON.parse(await fs.readFile(new URL('../dist/hangzhou-sample.json',import.meta.url),'utf8')));
const meta=JSON.parse(await fs.readFile(new URL('../dist/basemap-meta.json',import.meta.url),'utf8'));
const state=()=>({...initialState(),analysis:structuredClone(sample),output:sample.bounds,name:'杭州奥体中心'});

test('当前取景而非历史保存范围决定导出；预览与下载仅像素尺寸和资源地址不同',()=>{
 const s=state(),b={sw:[120.10,30.15],ne:[120.42,30.36]};
 for(const mode of ['light','moss','dark']){s.mode=mode;
  const images=Object.fromEntries(baseLayers.map(k=>[k,'data:image/png;base64,test-'+k]));
  images.full='data:image/png;base64,test-full';
  const preview=renderScene(s,b,meta),download=renderScene(s,b,meta,{images,pixelWidth:4800,pixelHeight:3600});
  let normalized=download.replace('width="4800" height="3600"','width="1000" height="750"');for(const k of baseLayers)normalized=normalized.replace(images[k],layerUrl(k,mode));
  normalized=normalized.replace(images.full,fullUrl(mode));assert.equal(normalized,preview);assert.notEqual(preview,renderScene(s,s.output,meta));
  assert.ok(download.includes('data:image/png'));assert.ok(!download.includes('href="/'));assert.ok(!download.includes('data-feature='));
 }
 assert.throws(()=>renderScene(s,{sw:[118,29],ne:[121,31]},meta),/超出/);
});
test('手动名称、文字位置、示意半径和距离圈可保存恢复，几何定位不随文字移动',()=>{
 const s=state(),f=s.analysis.features.find(f=>f.kind==='region'),point=[...f.point];f.name='自定义 & 片区';f.labelPoint=[120.3,30.31];f.radius=2300;s.analysis.ringDistances=[2,8];s.showLegend=false;
 const restored=validateProject({app:'site-atlas',version:2,state:s});const r=restored.analysis.features.find(x=>x.id===f.id);
 assert.deepEqual(r.point,point);assert.deepEqual(r.labelPoint,f.labelPoint);assert.equal(r.name,f.name);assert.equal(r.radius,2300);assert.deepEqual(restored.analysis.ringDistances,[2,8]);assert.equal(restored.showLegend,false);
 const svg=renderScene(restored,s.output,meta,{interactive:true}),p=boundsProjection(s.output,1000,750)(f.labelPoint);
 assert.ok(svg.includes('自定义 &amp; 片区'));assert.ok(svg.includes(`data-label-x="${p[0]}" data-label-y="${p[1]}"`));assert.ok(!svg.includes('重点片区（示意）'));
 assert.ok(svg.includes('OpenStreetMap contributors'));r.visible=false;assert.ok(!renderScene(restored,s.output,meta).includes('自定义 &amp; 片区'));
});
test('标题、指北针和图例独立控制，隐藏底图层不残留于导出',()=>{
 const s=state();s.showTitle=false;s.showNorth=false;s.showLegend=false;s.basemapStyle.water=false;
 const svg=renderScene(s,s.output,meta);assert.ok(!svg.includes('HANGZHOU /'));assert.ok(!svg.includes('>N</text>'));assert.ok(!svg.includes('重点片区（示意）'));assert.ok(!svg.includes('data-basemap="water"'));assert.ok(svg.includes('data-basemap="roads"'));
 const migrated=validateProject({app:'site-atlas',version:2,state:{...s,mode:'satellite'}});assert.equal(migrated.mode,'satellite');
});
test('浮动工作台包含所有事件绑定，并保持图层与属性面板收起',async()=>{
 const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8'),app=await fs.readFile(new URL('../dist/app.js',import.meta.url),'utf8');
 for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(html.includes(`id="${m[1]}"`),m[1]);
 for(const m of html.matchAll(/data-(?:panel|close)="([^"]+)"/g))assert.ok(html.includes(`id="${m[1]}"`));
 assert.ok(!html.includes('left-panel'));assert.ok(!html.includes('right-panel'));assert.ok(html.includes('id="propertiesPanel" class="properties-panel floating" hidden'));
 for(const mode of ['light','moss','dark'])for(const layer of baseLayers){const file=await fs.readFile(new URL('../dist'+layerUrl(layer,mode),import.meta.url));assert.equal(file.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(file.readUInt32BE(16),6400);}
});
