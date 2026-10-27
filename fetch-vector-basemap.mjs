import fs from 'node:fs/promises';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import transform from './vendor/coordtransform.cjs';
const z=13,extent=[119.90,30.04,120.60,30.52];
const tileX=lon=>Math.floor((lon+180)/360*2**z),tileY=lat=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
const meta=JSON.parse(await fs.readFile('data/openfreemap-tiles.json','utf8')),template=meta.tiles[0],version=template.split('/').at(-4);
const tiles=[];for(let x=tileX(extent[0]);x<=tileX(extent[2]);x++)for(let y=tileY(extent[3]);y<=tileY(extent[1]);y++)tiles.push({x,y});
await fs.mkdir(`data/tiles/${version}`,{recursive:true});
const layers={water:[],roads:[],buildings:[],urban:[],green:[]},labels=[];let next=0,bytes=0,downloaded=0;
const target=(name,p)=>name==='water'?'water':name==='building'?'buildings':name==='transportation'?'roads':['landcover','park'].includes(name)?'green':name==='landuse'?(['residential','commercial','industrial','retail','construction'].includes(p.class)?'urban':['forest','grass','farmland','orchard','cemetery','recreation_ground'].includes(p.class)?'green':null):null;
const gcj=p=>transform.wgs84togcj02(...p).map(v=>+v.toFixed(6));
function convertTile(buffer,{x,y}){
 const tile=new VectorTile(new PbfReader(buffer));
 for(const name of ['water','building','transportation','landcover','landuse','park','water_name','waterway']){const layer=tile.layers[name];if(!layer)continue;
  for(let i=0;i<layer.length;i++){const f=layer.feature(i),p=f.properties,g=f.toGeoJSON(x,y,z).geometry;
   if(name==='water_name'||name==='waterway'){const name=p['name:zh']||p.name;if(/钱塘江|西湖$|湘湖$/.test(name)){const pts=g.type==='Point'?[g.coordinates]:g.type==='LineString'?g.coordinates:g.type==='MultiLineString'?g.coordinates.flat():[];if(pts.length)labels.push({name,point:gcj(pts[Math.floor(pts.length/2)])});}continue;}
   const dest=target(name,p);if(!dest)continue;
   let kind=p.class||name;if(dest==='roads'){if(kind==='minor')kind='residential';if(kind==='service')kind='unclassified';if(kind==='track'||kind==='path'||kind==='transit')continue;if(p.subclass==='rail')kind='rail';}
   if(dest==='green'){if(kind==='wood')kind='forest';if(kind==='grassland')kind='grass';if(name==='park')kind='park';}
   let paths=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
   if(!paths.length)continue;paths=paths.map(r=>r.map(gcj));const bbox=[Infinity,Infinity,-Infinity,-Infinity];for(const ring of paths)for(const [xx,yy] of ring){bbox[0]=Math.min(bbox[0],xx);bbox[1]=Math.min(bbox[1],yy);bbox[2]=Math.max(bbox[2],xx);bbox[3]=Math.max(bbox[3],yy);}
   layers[dest].push({id:`${x}/${y}/${name}/${f.id??i}`,name:String(p['name:zh']||p.name||''),kind,paths,bbox,bridge:p.brunnel==='bridge',tunnel:p.brunnel==='tunnel'});
  }
 }
}
async function worker(){while(next<tiles.length){const t=tiles[next++],file=`data/tiles/${version}/${t.x}-${t.y}.pbf`;let buffer;try{buffer=await fs.readFile(file);}catch{const url=template.replace('{z}',z).replace('{x}',t.x).replace('{y}',t.y);const r=await fetch(url,{headers:{'User-Agent':'SiteAtlasLocal/0.2 (Hangzhou architectural diagram prototype; bounded offline extract)'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Tile HTTP '+r.status);buffer=Buffer.from(await r.arrayBuffer());await fs.writeFile(file,buffer);}
 bytes+=buffer.length;if(bytes>48*1024*1024)throw new Error('Offline download budget exceeded');convertTile(buffer,t);downloaded++;if(downloaded%30===0)console.log(`Vector data ${downloaded}/${tiles.length}, ${(bytes/1048576).toFixed(1)} MB`);
}}
await Promise.all(Array.from({length:4},worker));
const output={version:1,id:'hangzhou-openfreemap-'+version,coordinateSystem:'GCJ02',originalCoordinateSystem:'WGS84',bounds:{sw:[119.91,30.05],ne:[120.59,30.51]},source:'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors',license:'ODbL-1.0',sourceUrl:'https://www.openstreetmap.org/copyright',fetchedAt:new Date().toISOString(),dataTimestamp:version,layers,labels,stats:{tiles:tiles.length,bytes,counts:Object.fromEntries(Object.entries(layers).map(([k,v])=>[k,v.length]))}};
await fs.writeFile('dist/hangzhou-basemap.json',JSON.stringify(output));console.log(JSON.stringify(output.stats));
