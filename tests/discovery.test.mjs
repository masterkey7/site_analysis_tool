import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {categories,candidate,selectCandidates,discover} from '../discovery.mjs';
import {analyze} from '../analysis.mjs';
import {initialState,validateProject} from '../dist/core.js';
import {cleanAnalysis,mergeAnalysisEdits} from '../dist/analysis-data.js';
import {renderAnalysis,labelLayout} from '../dist/analysis-svg.js';
import {harness} from './helpers/workbench-harness.mjs';

const bounds={sw:[121.4,31.1],ne:[121.6,31.3]},boundary=[[121.49,31.19],[121.51,31.19],[121.51,31.21],[121.49,31.21]],site={name:'设计场地',point:[121.5,31.2]};
const poi=(name,type,id='p',location='121.51,31.22')=>({name,type,id,location});
test('任意城市由逆地理编码决定；直辖市回退、范围过滤、无固定杭州列表',async()=>{
 const requests=[];const a=await analyze({name:site.name,boundary,bounds,siteConfirmed:true},async(path,p)=>{
  requests.push({path,p});if(path.includes('regeo'))return{regeocode:{addressComponent:{adcode:'310104',city:[],province:'上海市'}}};
  if(path.includes('district'))return{districts:[{name:'徐汇区',adcode:'310104',center:'121.5,31.2',polyline:'121.4,31.1;121.6,31.1;121.6,31.3'}]};
  if(p.types==='150200')return{count:'2',pois:[poi('上海南站','交通设施服务;火车站'),poi('外地站','火车站','outside','120.2,30.2')]};
  if(p.types==='110101|110200')return{count:'1',pois:[poi('城市公园','风景名胜;公园','park','121.48,31.24')]};
  return{count:'0',pois:[]};
 });
 assert.equal(a.city,'上海市');assert.equal(a.features.length,2);assert.ok(a.features.every(f=>f.radius===0&&!f.schematic));assert.ok(requests.filter(r=>r.path==='/v3/place/text').every(r=>r.p.city==='上海市'));assert.ok(requests.filter(r=>r.path==='/v3/place/polygon').every(r=>r.p.polygon==='121.400000,31.300000|121.600000,31.100000'));
 const restored=cleanAnalysis(a);assert.equal(restored.features[0].importance,'primary');assert.equal(restored.features[1].group,'landscape');
});
test('排除附属点、直升机场、同名误匹配；保留真实点位，不伪造范围',()=>{
 const rail=categories.find(c=>c.id==='rail'),air=categories.find(c=>c.id==='airport'),park=categories.find(c=>c.id==='landscape');
 for(const name of ['上海站停车场','上海站(北门)','上海站售票处'])assert.equal(candidate(poi(name,'火车站'),rail,site,bounds),null);
 assert.equal(candidate(poi('医院直升机场','飞机场'),air,site,bounds),null);
 assert.equal(candidate(poi('城市公园-观景台','公园'),park,site,bounds),null);
 assert.equal(candidate(poi('某幼儿园','风景名胜;公园'),park,site,bounds),null);
 const commerce=categories.find(c=>c.id==='commerce');assert.equal(candidate(poi('住宅购物中心','住宅小区'),commerce,site,bounds),null);
 const f=candidate(poi('区域购物中心','购物中心'),commerce,site,bounds);assert.equal(f.radius,0);assert.equal(f.schematic,false);
});
test('候选去重、分级、类别配额、公共设施子类保留，图面不超过22个标注',()=>{
 const raw=[];for(const [index,c]of categories.entries())for(let i=0;i<8;i++)raw.push({id:c.id+i,poiId:c.id+i,name:c.label+i,category:c.id,group:c.group,kind:c.kind,score:110-index-i,point:[121.42+i*.02,31.11+index*.015]});raw.push({...raw[0],id:'duplicate'});
 const result=selectCandidates(raw,bounds),shown=result.filter(f=>f.visible);assert.equal(result.length,48);assert.equal(shown.length,22);assert.equal(new Set(result.map(f=>f.poiId)).size,result.length);
 for(const c of categories){assert.ok(shown.some(f=>f.category===c.id),c.id);assert.ok(shown.filter(f=>f.category===c.id).length<=c.quota);}
});
test('拥挤范围分区补查，零结果仍能返回场地，分类失败明确提示，取消不继续查询',async()=>{
 let count=0;const warnings=[];await discover(site,bounds,async(path,p)=>{count++;return{count:path.endsWith('polygon')&&p.types==='150200'?'100':'0',pois:[]};},warnings,'上海市');assert.equal(count,26);assert.ok(warnings.some(w=>w.includes('分区候选')));
 const result=await discover(site,bounds,async()=>({count:'0',pois:[]}),[],'上海市');assert.deepEqual(result,[]);
 await assert.rejects(discover(site,bounds,async()=>{throw Error('权限异常');},[],'上海市'),/均未成功/);
 count=0;await assert.rejects(discover(site,bounds,async()=>{count++;throw new DOMException('cancel','AbortError');},[],'上海市'),{name:'AbortError'});assert.equal(count,1);
});
test('首次使用不加载示例；未确认阻止生成和导出，确认后提交真实红线，修改后需再确认',async()=>{
 const h=harness(null);await h.boot();await h.run('initialize()');assert.equal(h.state().analysis,null);assert.equal(h.state().siteConfirmed,false);assert.equal(h.get('sitePanel').hidden,false);assert.equal(h.get('generateAnalysis').disabled,true);
 let calls=0;const old=h.context.fetch;h.context.fetch=(url,opts)=>{if(url==='/api/location-analysis')calls++;return old(url,opts);};await h.run('generateAnalysis()');assert.equal(calls,0);assert.match(h.get('toast').textContent,/确认/);
 h.get('exportBtn').click();assert.equal(h.get('exportPng').disabled,true);
 h.run('state.boundary=[[120.2,30.2],[120.21,30.2],[120.21,30.21]];renderOverlays();');assert.equal(h.get('generateAnalysis').disabled,true);h.get('confirmSite').click();assert.equal(h.state().siteConfirmed,true);assert.equal(h.get('generateAnalysis').disabled,false);
 h.get('boundaryEdit').click();h.run('sitePolygon.setPath([[120.2,30.2],[120.22,30.2],[120.21,30.21]])');h.get('finishEditing').click();assert.equal(h.state().siteConfirmed,false);assert.equal(h.get('generateAnalysis').disabled,true);h.get('undoBtn').click();assert.equal(h.state().siteConfirmed,true);
 h.get('clearBoundary').click();assert.equal(h.state().siteConfirmed,false);
 const legacy={...initialState(),boundary};assert.equal(validateProject({app:'site-atlas',version:2,state:legacy}).siteConfirmed,false);
});
test('图例随行政区、类别与开关变化；新类别可保存、隐藏与导出，自动标签避让手动标签',()=>{
 const f=candidate(poi('图书馆','图书馆'),categories.find(c=>c.id==='culture'),site,bounds);f.visible=true;
 const a=cleanAnalysis({version:1,coordinateSystem:'GCJ02',city:'上海市',site,bounds,boundary,features:[f],districts:[{name:'徐汇区',adcode:'310104',point:site.point,polygons:[boundary],primary:true}],options:{},warnings:[]});
 let svg=renderAnalysis(a,{showTitle:false});assert.ok(svg.includes('徐汇区行政边界'));assert.ok(svg.includes('公共设施'));assert.ok(!svg.includes('交通枢纽'));assert.ok(!svg.includes('滨江区'));
 a.options.public=false;svg=renderAnalysis(a,{showTitle:false});assert.ok(!svg.includes('图书馆'));assert.ok(!svg.includes('公共设施'));
 const boxes=labelLayout([{xy:[500,350],w:130,h:32},{xy:[500,350],w:130,h:32,position:[512,334]}],1000,750);const [x,y]=boxes;assert.ok(!(x.x<y.x+y.w&&x.x+x.w>y.x&&x.y<y.y+y.h&&x.y+x.h>y.y));
});
test('正式页面没有杭州示例入口，场地输入、确认、自动分析入口齐全',async()=>{
 const html=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');assert.ok(!html.includes('杭州'));assert.ok(!html.includes('generateSample'));for(const id of ['searchInput','siteNameInput','confirmSite','generateCurrent'])assert.ok(html.includes(`id="${id}"`));
});
test('范围变化采用新的自动筛选和距离圈，同时保留用户显式隐藏与名称微调',()=>{
 const feature={id:'p',poiId:'p',name:'地点',sourceName:'地点',kind:'public',radius:0,visible:true,autoVisible:true};
 const previous={site:{name:'项目'},options:{},ringDistances:[1,2,3],autoRingDistances:[1,2,3],features:[{...feature}]};
 const next=()=>({site:{name:'项目'},options:{},ringDistances:[5,10,20],features:[{...feature,visible:false,autoVisible:false}]});
 let result=mergeAnalysisEdits(previous,next());assert.deepEqual(result.ringDistances,[5,10,20]);assert.equal(result.features[0].visible,false);
 previous.features[0].visible=false;previous.features[0].name='自定义';previous.ringDistances=[4,8];const fresh=next();fresh.features[0].visible=true;result=mergeAnalysisEdits(previous,fresh);assert.deepEqual(result.ringDistances,[4,8]);assert.equal(result.features[0].visible,false);assert.equal(result.features[0].name,'自定义');
});
