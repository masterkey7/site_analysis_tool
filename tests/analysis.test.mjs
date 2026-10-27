import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pickPoi,analyze,createQuery,validateInput} from '../analysis.mjs';
import {cleanAnalysis} from '../dist/analysis-data.js';
import {renderAnalysis,labelLayout} from '../dist/analysis-svg.js';
import {initialState,validateProject} from '../dist/core.js';

test('片区消歧：排除同名住宅、车站、公司和包含“广场”分类的公园',()=>{
 const pois=[{name:'钱江新城',type:'商务住宅;住宅小区',location:'120.2,30.2'},{name:'钱江新城(地铁站)',type:'地铁站',location:'120.2,30.2'},{name:'钱江新城',type:'地名地址信息;热点地名',location:'120.21,30.25'}];
 assert.equal(pickPoi(pois,{name:'钱江新城',kind:'region'}).sourceType,'地名地址信息;热点地名');
 assert.equal(pickPoi([{name:'城东新城中央公园',type:'风景名胜;公园广场;公园',location:'120.2,30.3'}],{name:'城东新城',kind:'region'}),null);
 assert.equal(pickPoi([{name:'杭州西站停车场',type:'停车场',location:'120,30'}],{name:'杭州西站',kind:'rail'}),null);
});
test('实时分析尊重取景、保留部分成功、行政边界与示意片区分开',async()=>{
 const boundary=[[120.22,30.22],[120.24,30.22],[120.24,30.24]],bounds={sw:[120.1,30.1],ne:[120.4,30.4]};
 const result=await analyze({boundary,bounds,name:'项目',siteConfirmed:true},async(path,p)=>{
  if(path.includes('regeo'))return{regeocode:{addressComponent:{adcode:'330108',district:'滨江区',city:'杭州市'}}};
  if(path.includes('district'))return{districts:[{name:'测试城区',adcode:p.keywords,center:'120.2,30.2',polyline:'120.1,30.1;120.3,30.1;120.3,30.3'}]};
  if(p.types==='190700')return{pois:[{name:'滨江科技城',type:'热点地名',location:'120.21,30.25'}]};
  if(p.types==='150200')return{pois:[{name:'杭州西站',type:'火车站',location:'119.98,30.29'}]};
  if(p.types==='150100')throw new Error('地图查询频率受限');
  return{pois:[]};
 });
 assert.deepEqual(result.bounds,bounds);assert.equal(result.features.length,1);assert.equal(result.features[0].schematic,false);assert.equal(result.features[0].radius,0);assert.ok(result.districts.some(d=>d.primary));assert.ok(result.warnings.some(x=>x.includes('频率受限')));
 const s=initialState();s.analysis=result;s.boundary=boundary;s.output=bounds;const saved=validateProject({app:'site-atlas',version:2,state:s});assert.equal(saved.analysis.features.length,1);
 assert.throws(()=>validateInput({siteConfirmed:true,boundary,bounds:{sw:[110,20],ne:[111,21]}}),/包含/);
 assert.throws(()=>cleanAnalysis({...result,features:[{...result.features[0],point:[NaN,30]}]}),/节点/);
});
test('地图查询串行限频、仅重试暂时失败，并缓存成功数据',async()=>{
 let calls=0,active=0,peak=0;const waits=[];
 const query=createQuery(async url=>{active++;peak=Math.max(peak,active);assert.equal(url.searchParams.get('s'),'rsv3');await Promise.resolve();active--;calls++;return new Response(JSON.stringify(calls===1?{status:'0',info:'CUQPS_HAS_EXCEEDED_THE_LIMIT'}:{status:'1',pois:[]}));},{key:'test',securityCode:'private'},{sleep:async ms=>{waits.push(ms);},interval:650});
 await Promise.all([query('/v3/place/text',{keywords:'a'}),query('/v3/place/text',{keywords:'b'})]);assert.equal(peak,1);assert.equal(calls,3);assert.ok(waits.includes(1200));await query('/v3/place/text',{keywords:'a'});assert.equal(calls,3);
});
test('拒绝非法规模、未确认场地与零面积边界',async()=>{
 assert.throws(()=>validateInput({siteConfirmed:true,boundary:[[120,30],[121,30],[121,31]],bounds:{sw:[110,20],ne:[130,40]}}),/300/);
 await assert.rejects(analyze({boundary:[[120,30],[120.01,30],[120,30.01]],bounds:{sw:[119,29],ne:[121,31]}},async()=>{throw Error('Must not query');}),/确认/);
 assert.throws(()=>validateInput({siteConfirmed:true,boundary:[[120,30],[120,30],[120,30]],bounds:{sw:[119,29],ne:[121,31]}}),/面积/);
});
test('渲染转义文本，标签避让，样例可以持久化且不包含外部图片',async()=>{
 const raw=JSON.parse((await fs.readFile(new URL('../samples/hangzhou-analysis.json',import.meta.url),'utf8')).replace(/^\uFEFF/,''));
 const a=cleanAnalysis(raw);a.site.name='<script>alert(1)</script>';const svg=renderAnalysis(a,{standalone:true,pixelWidth:4800,pixelHeight:3600});
 assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<image'));assert.ok(svg.includes('width="4800"'));assert.ok(!svg.includes('分析：高德地点'));assert.ok(svg.includes('重点片区（示意）'));
 const labels=labelLayout([{xy:[500,350]},{xy:[510,350]},{xy:[500,360]}],1000,750);for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j];assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y));}
 const state=initialState();state.analysis=a;const clean=validateProject({app:'site-atlas',version:2,state:{...state,secret:'not-kept'}});assert.equal(clean.secret,undefined);assert.equal(clean.analysis.site.name,a.site.name);
});
test('页面控件与代码绑定齐全，新增模块可以静态加载',async()=>{
 const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8'),app=await fs.readFile(new URL('../dist/app.js',import.meta.url),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const match of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(match[1]),'Missing control '+match[1]);
});
