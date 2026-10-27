import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {initialState} from '../dist/core.js';
import {renderScene,renderBackdrop,renderSatelliteOverlay} from '../dist/scene.js';
import {coversBounds} from '../dist/basemap.js';
const app=await fs.readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const meta=JSON.parse(await fs.readFile(new URL('../dist/basemap-meta.json',import.meta.url),'utf8'));
const bounds={sw:[120.05,30.15],ne:[120.40,30.40]};

test('实际按钮事件：没有分析结果也改变整张底图；卫星与线稿可以往返切换',()=>{
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,innerHTML:'',style:{},classList:{toggle(){}},querySelectorAll:()=>[],clientWidth:1200,clientHeight:900});return nodes.get(id);};
 const buttons=['light','moss','dark','satellite'].map(mode=>({dataset:{mode}}));
 const standard=[{type:'original-vector-layer'}],calls=[];
 const map={setLayers:layers=>calls.push({layers}),setMapStyle:style=>calls.push({style}),setFeatures(){},containerToLngLat(p){return [bounds.sw[0]+p.x/1200*(bounds.ne[0]-bounds.sw[0]),bounds.ne[1]-p.y/900*(bounds.ne[1]-bounds.sw[1])];}};
 class Satellite{type='satellite'}class RoadNet{type='roadnet'}class Pixel{constructor(x,y){this.x=x;this.y=y;}}
 const context=vm.createContext({backdropKey:'',queueBasemap(){},rangeLoading:false,rangeError:"",state:initialState(),map,AM:{TileLayer:{Satellite,RoadNet},Pixel},standardLayers:standard,satelliteLayer:null,satelliteRoads:null,$:get,document:{querySelectorAll:()=>buttons},stopTool(){},sync(){},save(){},frame:{x:0,y:0,w:1200,h:900},frameBounds:()=>bounds,analysisFresh:()=>false,basemapReady:true,basemapMeta:meta,tool:'select',editor:null,selected:null,selectedFeature:null,coords:p=>p,renderBackdrop,renderSatelliteOverlay,renderScene,coversBounds});
 const modeFunctions=app.slice(app.indexOf('function setMode(mode)'),app.indexOf('function searchMessage'));
 const draw=app.slice(app.indexOf('function drawAnalysis(){'),app.indexOf("let analysisPanelKey="));
 const binding=app.split('\n').find(l=>l.startsWith("document.querySelectorAll('[data-mode]').forEach(b=>b.onclick="));
 vm.runInContext(modeFunctions+draw+binding,context);
 const expected={light:'/basemap-full-light.png',moss:'/basemap-full-moss.png',dark:'/basemap-full-dark.png'};
 for(const button of buttons.slice(0,3)){button.onclick();const mode=button.dataset.mode;assert.equal(context.state.mode,mode);assert.equal(get('mapBackdrop').hidden,false);assert.equal(get('analysisOverlay').hidden,false);assert.ok(get('mapBackdrop').innerHTML.includes(expected[mode]));assert.ok(!get('analysisOverlay').innerHTML.includes('<image'));}
 assert.ok(calls.some(c=>c.style==='amap://styles/fresh'));assert.ok(calls.some(c=>c.style==='amap://styles/light'));assert.ok(calls.some(c=>c.style==='amap://styles/darkblue'));
 buttons[3].onclick();assert.equal(context.state.mode,'satellite');assert.equal(get('mapBackdrop').hidden,false);assert.ok(get('mapBackdrop').innerHTML.includes('satellite-water'));assert.ok(!get('mapBackdrop').innerHTML.includes('frame-basemap'));assert.ok(!get('analysisOverlay').innerHTML.includes('<image'));assert.ok(calls.some(c=>c.layers?.[0] instanceof Satellite));
 buttons[1].onclick();assert.equal(context.state.mode,'moss');assert.equal(calls.filter(c=>c.layers).at(-1).layers,standard);assert.ok(get('mapBackdrop').innerHTML.includes('/basemap-full-moss.png'));assert.ok(!get('analysisOverlay').innerHTML.includes('<image'));assert.equal(context.state.analysis,null);
});

test('仅底图也能出图，卫星保持透明叠加且不能偷偷导出深色线稿',()=>{
 const s=initialState();s.mode='moss';const svg=renderScene(s,bounds,meta);assert.ok(svg.includes('/basemap-full-moss.png'));assert.ok(!svg.includes('data-feature="site"'));
 s.mode='satellite';assert.ok(renderBackdrop(s,bounds,meta,1000,750).includes('satellite-water'));s.basemapStyle.water=false;assert.equal(renderBackdrop(s,bounds,meta,1000,750),'');assert.ok(!renderSatelliteOverlay(s,bounds).includes('frame-basemap'));assert.throws(()=>renderScene(s,bounds,meta),/卫星影像/);
});
