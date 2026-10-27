import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {coversBounds,cleanBasemapStyle,pointInRings,renderBasemap} from '../dist/basemap.js';
import {initialState,validateProject} from '../dist/core.js';
import {boundsProjection} from '../dist/analysis-svg.js';
import transform from '../vendor/coordtransform.cjs';

test('真实底图包含钱塘江、路网及建筑肌理，坐标统一且示例范围完整覆盖',async()=>{
 const base=JSON.parse(await fs.readFile(new URL('../dist/hangzhou-basemap.json',import.meta.url),'utf8'));
 const sample=JSON.parse((await fs.readFile(new URL('../samples/hangzhou-analysis.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 assert.equal(base.coordinateSystem,'GCJ02');assert.ok(coversBounds(base,sample.bounds));
 assert.ok(base.layers.roads.length>1000);assert.ok(base.layers.buildings.reduce((n,f)=>n+f.paths.length,0)>5000);assert.ok(base.layers.water.length>100);
 const river=base.labels.find(l=>l.name==='钱塘江');assert.ok(river);
 const inWater=p=>base.layers.water.some(f=>p[0]>=f.bbox[0]&&p[1]>=f.bbox[1]&&p[0]<=f.bbox[2]&&p[1]<=f.bbox[3]&&pointInRings(p,f.paths));
 assert.ok(inWater(river.point),'钱塘江标注必须落在真实水体内');assert.equal(inWater(sample.site.point),false,'奥体场馆不能错误落在水中');
 assert.ok(base.stats.bytes<50*1024*1024);assert.ok(base.stats.tiles<3000);
 assert.equal(coversBounds(base,{sw:[119,29],ne:[121,31]}),false);
});
test('坐标转换有偏移且可往返，水体岛洞不被错误填满',()=>{
 const gcj=transform.wgs84togcj02(116.404,39.915);assert.ok(Math.abs(gcj[0]-116.410244499)<1e-7);assert.ok(Math.abs(gcj[1]-39.916404281)<1e-7);
 const roundtrip=transform.gcj02towgs84(...gcj);assert.ok(Math.abs(roundtrip[0]-116.404)<.00001&&Math.abs(roundtrip[1]-39.915)<.00001);
 const rings=[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]];assert.equal(pointInRings([5,5],rings),false);assert.equal(pointInRings([2,2],rings),true);
});
test('底图开关影响实际图层，并随项目保存恢复',()=>{
 const bounds={sw:[120,30],ne:[120.1,30.1]},feature={name:'',paths:[[[120.01,30.01],[120.05,30.01],[120.05,30.05],[120.01,30.01]]],bbox:[120.01,30.01,120.05,30.05]};
 const base={bounds,labels:[],layers:{water:[feature],roads:[{...feature,kind:'primary'}],buildings:[feature],urban:[],green:[]}};
 const options={bounds,projectPoint:boundsProjection(bounds,1000,750),width:1000,height:750};
 assert.ok(renderBasemap(base,options).includes('#bad1d5'));assert.ok(!renderBasemap(base,{...options,style:cleanBasemapStyle({water:false})}).includes('#bad1d5'));
 const s=initialState();s.basemapStyle={water:false,roads:true,buildings:false,green:true};const restored=validateProject({app:'site-atlas',version:2,state:s});assert.deepEqual(restored.basemapStyle,s.basemapStyle);
 const {basemapStyle,...legacy}=s;assert.deepEqual(validateProject({app:'site-atlas',version:2,state:legacy}).basemapStyle,cleanBasemapStyle());
});
