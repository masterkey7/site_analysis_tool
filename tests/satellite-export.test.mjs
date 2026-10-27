import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {captureSatellite,satelliteView,assertSatellitePixels} from '../dist/satellite-export.js';
import {initialState,project,unproject} from '../dist/core.js';
import {renderScene} from '../dist/scene.js';
const bounds={sw:[119.7,30.1],ne:[120.5,30.6]};
test('高清卫星重新渲染相同范围，增加输出尺寸会增加缩放级别而非放大截图',()=>{
 const small=satelliteView(bounds,1200,900),large=satelliteView(bounds,4800,3600);assert.ok(Math.abs(large.zoom-small.zoom-2)<1e-9);assert.deepEqual(large.center,small.center);
 const scale=256*2**large.zoom,c=project(large.center),actual={sw:unproject([c[0]-2400/scale,c[1]+1800/scale]),ne:unproject([c[0]+2400/scale,c[1]-1800/scale])};assert.ok(actual.sw[0]<=bounds.sw[0]+1e-9&&actual.ne[0]>=bounds.ne[0]-1e-9);assert.throws(()=>satelliteView(bounds,9000,600),/尺寸/);
});
function samples(){return new Uint8ClampedArray(Array.from({length:64},(_,i)=>[i*4,i*3,240-i*2,255]).flat());}
test('空白或透明截图明确失败，不当作成功出图',()=>{
 assert.throws(()=>assertSatellitePixels(new Uint8ClampedArray(256)),/空白/);assert.throws(()=>assertSatellitePixels(new Uint8ClampedArray(256).fill(255)),/空白/);assert.doesNotThrow(()=>assertSatellitePixels(samples()));
});
test('卫星合成保留真实影像输入、水体和手绘，无影像时拒绝；不会混入线稿底图',async()=>{
 const s=initialState();s.mode='satellite';s.analysis=JSON.parse(await fs.readFile(new URL('../dist/hangzhou-sample.json',import.meta.url),'utf8'));s.shapes=[{id:'text',type:'text',text:'新项目标注',points:[s.analysis.site.point],style:{color:'#ffffff',width:2,dash:'solid',opacity:.2}}];
 const meta=JSON.parse(await fs.readFile(new URL('../dist/basemap-meta.json',import.meta.url),'utf8')),images={satellite:'data:image/png;base64,fixture',water:'data:image/svg+xml;base64,fixture-water'};
 const svg=renderScene(s,s.analysis.bounds,meta,{images,pixelWidth:4800,pixelHeight:3600});assert.ok(svg.includes('data-layer="satellite-imagery"'));assert.ok(svg.includes('data-layer="satellite-water"'));assert.ok(svg.includes('新项目标注'));assert.ok(!svg.includes('/basemap-'));assert.ok(!svg.includes('HANGZHOU /'));assert.ok(!svg.includes('分析：高德地点'));assert.ok(svg.includes('OpenStreetMap contributors'));assert.throws(()=>renderScene(s,s.analysis.bounds,meta),/卫星影像/);
 s.basemapStyle.water=false;assert.ok(!renderScene(s,s.analysis.bounds,null,{images}).includes('data-layer="satellite-water"'));
});
test('卫星截图隔离地图实例、精确尺寸与署名保留，跨域失败和取消均释放资源',async t=>{
 const previous={window:globalThis.window,document:globalThis.document,raf:globalThis.requestAnimationFrame};t.after(()=>{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.requestAnimationFrame=previous.raf;});
 let removed=0,destroyed=0,created=0,options;
 const context={drawImage(){},getImageData:()=>({data:samples()})};const canvas=()=>({width:4800,height:3600,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,captured'});
 globalThis.document={body:{append(){}},createElement:tag=>tag==='canvas'?canvas():{style:{},setAttribute(){},remove(){removed++;}}};globalThis.requestAnimationFrame=callback=>queueMicrotask(callback);
 const render=async(host,opts)=>{assert.equal(opts.scale,1);assert.equal(opts.allowTaint,false);assert.equal(opts.width,4800);assert.equal(opts.height,3600);assert.ok(!opts.ignoreElements,'Must retain AMap attribution');return canvas();};globalThis.window={html2canvas:render};
 class Map{constructor(host,opts){created++;options=opts;this.handlers={};}on(name,fn){this.handlers[name]=fn;queueMicrotask(()=>this.handlers[name]?.());}off(name){delete this.handlers[name];}getBounds(){return {getSouthWest:()=>({getLng:()=>bounds.sw[0],getLat:()=>bounds.sw[1]}),getNorthEast:()=>({getLng:()=>bounds.ne[0],getLat:()=>bounds.ne[1]})};}destroy(){destroyed++;}}
 const AM={Map,TileLayer:{Satellite:class{},RoadNet:class{}}};
 assert.match(await captureSatellite({AM,bounds,width:4800,height:3600}),/^data:image\/png/);assert.equal(options.WebGLParams.preserveDrawingBuffer,true);assert.equal(options.layers.length,1);assert.equal(removed,1);assert.equal(destroyed,1);
 window.html2canvas=async()=>{throw new DOMException('Tainted','SecurityError');};await assert.rejects(captureSatellite({AM,bounds,width:4800,height:3600}),/不允许浏览器读取/);assert.equal(removed,2);assert.equal(destroyed,2);
 const controller=new AbortController();window.html2canvas=async()=>{controller.abort();return canvas();};await assert.rejects(captureSatellite({AM,bounds,width:4800,height:3600,signal:controller.signal}),{name:'AbortError'});assert.equal(removed,3);assert.equal(destroyed,3);assert.equal(created,3);
});
