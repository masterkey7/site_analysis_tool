import {loadSharp} from './sharp-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import transform from './vendor/coordtransform.cjs';
import {renderBasemap} from './dist/basemap.js';
import {boundsProjection} from './dist/analysis-svg.js';
import {project} from './dist/core.js';
export function planTiles(bounds){
 if(!bounds||!Array.isArray(bounds.sw)||!Array.isArray(bounds.ne)||bounds.sw.length!==2||bounds.ne.length!==2||![...bounds.sw,...bounds.ne].every(Number.isFinite)||bounds.sw[0]<-179||bounds.ne[0]>179||bounds.sw[1]<-80||bounds.ne[1]>80||bounds.ne[0]<=bounds.sw[0]||bounds.ne[1]<=bounds.sw[1])throw new Error('地图范围无效');
 // Include a margin for panning and the GCJ/WGS offset; coordinate conversion
 // is applied to every vertex before displaying it on the AMap viewport.
 const dx=(bounds.ne[0]-bounds.sw[0])*.18+.015,dy=(bounds.ne[1]-bounds.sw[1])*.18+.015;
 const extent={sw:[Math.max(-179,bounds.sw[0]-dx),Math.max(-80,bounds.sw[1]-dy)],ne:[Math.min(179,bounds.ne[0]+dx),Math.min(80,bounds.ne[1]+dy)]};
 let result;
 for(let z=14;z>=0;z--){const x=lon=>Math.floor((lon+180)/360*2**z),y=lat=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);const tiles=[];
  const x0=x(extent.sw[0]),x1=x(extent.ne[0]),y0=y(extent.ne[1]),y1=y(extent.sw[1]);
  if((x1-x0+1)*(y1-y0+1)>80)continue;
  for(let xx=x0;xx<=x1;xx++)for(let yy=y0;yy<=y1;yy++)tiles.push({x:xx,y:yy,z});result={bounds:extent,z,tiles};break;
 }return result;
}
const target=(name,p)=>name==='water'?'water':name==='building'?'buildings':name==='transportation'?'roads':['landcover','park'].includes(name)?'green':name==='landuse'?(['residential','commercial','industrial','retail','construction'].includes(p.class)?'urban':['forest','grass','farmland','orchard','cemetery','recreation_ground'].includes(p.class)?'green':null):null;
function decode(buffer,{x,y,z},layers,labels){const tile=new VectorTile(new PbfReader(buffer));
 for(const name of ['water','building','transportation','landcover','landuse','park','water_name']){const layer=tile.layers[name];if(!layer)continue;
  for(let i=0;i<layer.length;i++){const f=layer.feature(i),p=f.properties,g=f.toGeoJSON(x,y,z).geometry;
   if(name==='water_name'){if(g.type==='Point'&&(p['name:zh']||p.name))labels.push({name:String(p['name:zh']||p.name),point:transform.wgs84togcj02(...g.coordinates)});continue;}
   const dest=target(name,p);if(!dest)continue;let kind=p.class||name;
   if(dest==='roads'){if(kind==='minor')kind='residential';if(kind==='service')kind='unclassified';if(['track','path','transit'].includes(kind))continue;if(p.subclass==='rail')kind='rail';}
   if(dest==='green'){if(kind==='wood')kind='forest';if(kind==='grassland')kind='grass';if(name==='park')kind='park';}
   let paths=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];if(!paths.length)continue;
   paths=paths.map(r=>r.map(pt=>transform.wgs84togcj02(...pt).map(v=>+v.toFixed(6))));const bbox=[Infinity,Infinity,-Infinity,-Infinity];for(const ring of paths)for(const [xx,yy]of ring){bbox[0]=Math.min(bbox[0],xx);bbox[1]=Math.min(bbox[1],yy);bbox[2]=Math.max(bbox[2],xx);bbox[3]=Math.max(bbox[3],yy);}
   layers[dest].push({kind,paths,bbox});
  }
 }
}
export function createBasemapService({root,fetcher=fetch,rasterize}){
 const cache=new Map(),pending=new Map();let running=0;
 async function prepare(bounds){const plan=planTiles(bounds),id=createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0,20);if(cache.has(id))return cache.get(id).meta;if(pending.has(id))return pending.get(id);
  if(running>=2)throw new Error('正在加载另一处底图，请稍候重试');running++;
  const promise=(async()=>{const config=JSON.parse(await fs.readFile(path.join(root,'data/openfreemap-tiles.json'),'utf8')),template=config.tiles[0];if(!template.startsWith('https://tiles.openfreemap.org/planet/'))throw new Error('底图来源配置无效');
   const version=template.split('/').at(-4),layers={water:[],roads:[],buildings:[],urban:[],green:[]},labels=[];let cursor=0,bytes=0;
   await fs.mkdir(path.join(root,'data/dynamic-tiles',version),{recursive:true});
   async function worker(){while(cursor<plan.tiles.length){const t=plan.tiles[cursor++],file=path.join(root,'data/dynamic-tiles',version,`${t.z}-${t.x}-${t.y}.pbf`);let buffer;
    try{buffer=await fs.readFile(t.z===13?path.join(root,'data/tiles',version,`${t.x}-${t.y}.pbf`):file);}catch{try{buffer=await fs.readFile(file);}catch{const url=template.replace('{z}',t.z).replace('{x}',t.x).replace('{y}',t.y);let error;for(let attempt=0;attempt<2;attempt++){try{const response=await fetcher(url,{signal:AbortSignal.timeout(25000),redirect:'error'});if(!response.ok)throw new Error('底图请求失败 '+response.status);buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>8*1024*1024)throw new Error('地图数据异常');break;}catch(e){error=e;}}if(!buffer)throw error;await fs.writeFile(file,buffer);}}
    bytes+=buffer.length;if(bytes>64*1024*1024)throw new Error('当前范围数据量较大，请稍后重试');decode(buffer,t,layers,labels);
   }}const results=await Promise.allSettled(Array.from({length:3},worker));const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
   const meta={version:1,id,coordinateSystem:'GCJ02',bounds:plan.bounds,dynamic:true,zoom:plan.z,tiles:plan.tiles.length,assetUrls:{},previewAssetUrls:{}};
   for(const mode of ['light','moss','dark']){meta.assetUrls[mode]={};for(const layer of ['full','water','roads','buildings','green'])meta.assetUrls[mode][layer]=`/api/basemap-layer?id=${id}&mode=${mode}&layer=${layer}`;}
   for(const mode of ['light','moss','dark'])meta.previewAssetUrls[mode]=Object.fromEntries(Object.entries(meta.assetUrls[mode]).map(([layer,url])=>[layer,url+'&format=png']));
   cache.set(id,{meta,base:{bounds:plan.bounds,layers,labels},svg:new Map(),png:new Map()});while(cache.size>8)cache.delete(cache.keys().next().value);return meta;
  })().finally(()=>{running--;pending.delete(id);});pending.set(id,promise);return promise;
 }
 function layer(id,mode,key){const entry=cache.get(id);if(!entry)throw new Error('底图缓存已更新，请重新加载当前范围');if(!['light','moss','dark'].includes(mode)||!['full','water','roads','buildings','green'].includes(key))throw new Error('底图图层无效');const k=mode+'/'+key;if(entry.svg.has(k))return entry.svg.get(k);
  const sw=project(entry.meta.bounds.sw),ne=project(entry.meta.bounds.ne),width=1000,height=1000*(sw[1]-ne[1])/(ne[0]-sw[0]);
  const content=renderBasemap(entry.base,{bounds:entry.meta.bounds,projectPoint:boundsProjection(entry.meta.bounds,width,height),width,height,dark:mode==='dark',style:Object.fromEntries(['water','roads','buildings','green'].map(l=>[l,key==='full'||key===l]))});
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="4800" height="${Math.round(height*4.8)}" viewBox="0 0 ${width} ${height}"><defs><filter id="gray" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter></defs><g font-family="Microsoft YaHei,sans-serif" ${mode==='light'?'filter="url(#gray)"':''}>${content}</g></svg>`;entry.svg.set(k,svg);while(entry.svg.size>2)entry.svg.delete(entry.svg.keys().next().value);return svg;
 }
 async function rasterLayer(id,mode,key){
  const entry=cache.get(id);if(!entry)throw new Error('底图缓存已更新，请重新加载当前范围');
  const k=mode+'/'+key;if(entry.png.has(k))return entry.png.get(k);
  const svg=layer(id,mode,key),job=(async()=>{
   if(rasterize)return rasterize(svg);
   return loadSharp()(Buffer.from(svg),{limitInputPixels:64000000}).resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  })().catch(e=>{entry.png.delete(k);throw e;});entry.png.set(k,job);while(entry.png.size>3)entry.png.delete(entry.png.keys().next().value);return job;
 }return {prepare,layer,rasterLayer};
}
