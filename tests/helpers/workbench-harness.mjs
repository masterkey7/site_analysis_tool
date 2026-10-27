import {pngFromSvg} from '../../dist/png-export.js';
// Controller integration harness. This is deliberately NOT a browser or an AMap
// rendering substitute: DOM layout, SDK drawing and real downloads need UI QA.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as core from '../../dist/core.js';
import * as scene from '../../dist/scene.js';
import * as basemap from '../../dist/basemap.js';
import {createProjectStorage} from '../../dist/project-storage.js';
import {cleanAnalysis,mergeAnalysisEdits} from '../../dist/analysis-data.js';

const source=await fs.readFile(new URL('../../dist/app.js',import.meta.url),'utf8');
const html=await fs.readFile(new URL('../../dist/index.html',import.meta.url),'utf8');
const metadata=JSON.parse(await fs.readFile(new URL('../../dist/basemap-meta.json',import.meta.url),'utf8'));
const fixture=JSON.parse(await fs.readFile(new URL('../../samples/liangzhu-flow/良渚文化艺术中心-测试项目.json',import.meta.url),'utf8'));
// Existing editing tests start after explicit site confirmation. Migration and
// first-use tests supply their own unconfirmed project instead.
fixture.state.siteConfirmed=true;

export function harness(saved=fixture){
 const timers=new Map(),frames=new Map(),downloads=[],urls=new Map(),storage=new Map(),nodes=new Map();let next=0;
 if(saved)storage.set('site-atlas-amap-v2',JSON.stringify(saved));
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.listeners={};this.attributes={};this.hidden=false;this.value='';this.textContent='';this.innerHTML='';this.clientWidth=1400;this.clientHeight=1000;this.captures=new Set();this.classList={toggle(){},add(){},remove(){}};}
  append(...items){this.children.push(...items);for(const item of items)if(item.tagName==='script')queueMicrotask(()=>item.onload?.());}
  replaceChildren(...items){this.children=[];this.append(...items);}
  setAttribute(k,v){this.attributes[k]=v;}getAttribute(k){return this.attributes[k];}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  async emit(k,event={}){for(const fn of this.listeners[k]||[])await fn({target:this,preventDefault(){},stopPropagation(){},...event});}
  querySelectorAll(selector){return this.children.flatMap(c=>[...(selector==='input'&&c.tagName==='input'?[c]:[]),...(c.querySelectorAll?.(selector)||[])]);}
  querySelector(){return new Element();}focus(){}matches(){return false;}
  click(){if(this.tagName==='a')downloads.push({name:this.download,blob:urls.get(this.href)});else return this.onclick?.({target:this});}
  showModal(){this.open=true;}close(value){if(value!==undefined)this.returnValue=value;this.open=false;return this.emit('close');}
  setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
 }
 for(const [,id]of html.matchAll(/id="([^"]+)"/g))nodes.set(id,new Element());
 const buttons=attr=>[...html.matchAll(new RegExp(`data-${attr}="([^"]+)"`,'g'))].map(([,v])=>{const e=new Element('button');e.dataset[attr]=v;return e;});
 const groups=Object.fromEntries(['mode','tool','panel','close'].map(k=>[`[data-${k}]`,buttons(k)]));
 const document=new Element('document');Object.assign(document,{getElementById:id=>{if(!nodes.has(id))throw Error('Unknown element '+id);return nodes.get(id);},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),head:new Element(),fonts:{ready:Promise.resolve()},querySelectorAll:s=>groups[s]||[],querySelector:s=>s==='dialog[open]'?[...nodes.values()].find(n=>n.open):null});
 class Overlay{
  constructor(options){this.options=options;this.path=options.path;this.position=options.position;this.listeners={};this.content=options.content;}
  on(k,fn){this.listeners[k]=fn;}emit(k,event){return this.listeners[k]?.(event);}setMap(map){this.map=map;}
  getPath(){return this.path;}setPath(p){this.path=p;}getPosition(){return this.position;}setPosition(p){this.position=p;}getContent(){return this.content;}setOptions(o){Object.assign(this.options,o);}setStyle(){}
 }
 class MapMock{
  constructor(_,options){this.center=options.center;this.zoom=options.zoom;this.layers=[];this.listeners={};this.status={dragEnable:true,zoomEnable:true};}
  on(k,fn){this.listeners[k]=fn;}emit(k,event){return this.listeners[k]?.(event);}
  getCenter(){return this.center;}getZoom(){return this.zoom;}setZoomAndCenter(z,c){this.zoom=z;this.center=c;}
  getLayers(){return this.layers;}setLayers(l){this.layers=l;}setMapStyle(){}setFeatures(){}addControl(){}setDefaultCursor(){}setStatus(s){Object.assign(this.status,s);}
  containerToLngLat(p){const c=core.project(this.center),scale=256*2**this.zoom;return core.unproject([c[0]+(p.x-700)/scale,c[1]+(p.y-500)/scale]);}
  zoomIn(){this.zoom++;}zoomOut(){this.zoom--;}setFitView(){}
 }
 class Mouse{constructor(map){this.map=map;this.listeners={};}on(k,fn){this.listeners[k]=fn;}rectangle(o){this.kind='rectangle';this.options=o;}polygon(o){this.kind='polygon';this.options=o;}polyline(o){this.kind='polyline';this.options=o;}close(){}draw(obj){this.listeners.draw({obj});}}
 class Editor{constructor(map,overlay){this.overlay=overlay;}open(){this.opened=true;}close(){this.opened=false;}}
 const AM={Map:MapMock,Marker:Overlay,Polygon:Overlay,Polyline:Overlay,Pixel:class{constructor(x,y){this.x=x;this.y=y;}},MouseTool:Mouse,PolygonEditor:Editor,PolylineEditor:Editor,Scale:class{},TileLayer:{Satellite:class{},RoadNet:class{}},plugin(_,fn){fn();}};
 const window=new Element();window.AMap=AM;
 const context=vm.createContext({...core,...scene,...basemap,cleanAnalysis,mergeAnalysisEdits,createProjectStorage,pngFromSvg,document,window,location:{origin:'http://test.invalid'},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},console,crypto:webcrypto,Blob,URL:class extends URL{static createObjectURL(blob){const u='blob:test-'+(++next);urls.set(u,blob);return u;}static revokeObjectURL(u){urls.delete(u);}},URLSearchParams,AbortController,AbortSignal,DOMException,structuredClone,confirm:()=>true,ResizeObserver:class{observe(){}},setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++next;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),captureSatellite:async()=>{throw Error('Real satellite unavailable in controller harness');},fetch:async url=>{if(url.startsWith('/_AMapService/v3/')){const items=[{name:fixture.state.name,location:fixture.state.analysis.site.point.join(','),adcode:'330110'}];return{ok:true,json:async()=>({status:'1',info:'OK',tips:items,pois:items})};}if(url==='/api/bootstrap')return{ok:true,json:async()=>({configured:true,key:'test-fixture-only',csrf:'test'})};if(url==='/api/location-analysis')return{ok:true,json:async()=>structuredClone(fixture.state.analysis)};if(url==='/basemap-meta.json')return{ok:true,json:async()=>structuredClone(metadata)};throw Error('Unexpected harness request '+url);}});
 const script=source.replace(/^import .*;\r?\n/gm,'').replace(/sync\(\);syncStyle\(\);loadBasemapPreview\(\);initialize\(\);\s*$/,'');
 vm.runInContext(script,context);
 const run=code=>vm.runInContext(code,context),get=id=>nodes.get(id);
 return {context,run,get,document,window,groups,downloads,storage,fixture:structuredClone(fixture),Element,Overlay,metadata,
  async boot(){run('sync();syncStyle();');await run('loadBasemapPreview();');await run('connect();');},
  flushFrames(){const current=[...frames.values()];frames.clear();for(const fn of current)fn();},
  flushSave(){for(const [id,t]of timers)if(t.ms===250){timers.delete(id);t.fn();}},
  state:()=>JSON.parse(run('JSON.stringify(state)')),
  // All pointer events here are synthetic and do not verify browser hit testing.
  async drag(id,{dx=70,dy=30,cancel=false}={}){const node=new Element();node.dataset={feature:id,labelX:'300',labelY:'200'};node.querySelector=()=>({getAttribute:()=>100});node.closest=s=>s==='[data-feature]'?node:null;const overlay=get('analysisOverlay');await overlay.emit('pointerdown',{target:node,button:0,pointerId:1,clientX:400,clientY:300});await overlay.emit('pointermove',{pointerId:1,clientX:400+dx,clientY:300+dy});await overlay.emit(cancel?'pointercancel':'pointerup',{pointerId:1});}
 };
}
