import {discover} from './discovery.mjs';
import {abortableStep} from './dist/png-export.js';
import {point,centerOf,area,distance,project,unproject} from './dist/core.js';

const SOURCE='高德地点检索 / 行政区划';
export function inBounds(p,b){return p[0]>=b.sw[0]&&p[0]<=b.ne[0]&&p[1]>=b.sw[1]&&p[1]<=b.ne[1];}
export function readPoint(value){const p=typeof value==='string'?value.split(',').map(Number):value;return point(p)?p:null;}
export function pickPoi(pois,spec){
 const target=spec.name.replace('商圈','广场').replace('未来科技城','杭州未来科技城');
 return pois.map(p=>{
  const location=readPoint(p.location),name=String(p.name||''),type=String(p.type||'');
  if(!location||/停车|出入口|进站口|出站口|地铁站|售票|公司|住宅小区|营业厅|便利店|公交车站/.test(type+' '+name)||/\([A-Z0-9]+口\)/.test(name))return null;
  if(spec.kind==='rail'&&!/火车站/.test(type))return null;
  if(spec.kind==='airport'&&(!/飞机场/.test(type)||/航站楼|候机|停车/.test(name)))return null;
  if(spec.kind==='region'&&!/热点地名|产业园区|楼宇|城市广场/.test(type))return null;
  const exact=name===spec.name||name===target;
  const score=(exact?100:0)+(spec.prefer&&new RegExp(spec.prefer).test(type)?40:0)+(name.includes(spec.name)?15:0)-name.length/100;
  if(!exact&&!name.includes(spec.name)&&!name.includes(target))return null;
  return {name:spec.name,point:location,sourceName:name,sourceType:type,score,poiId:String(p.id||''),confidence:spec.kind==='region'&&/楼宇/.test(type)?'anchor':'matched'};
 }).filter(Boolean).sort((a,b)=>b.score-a.score)[0]||null;
}
export function parsePolygons(polyline){return String(polyline||'').split('|').map(r=>r.split(';').map(readPoint).filter(Boolean)).filter(r=>r.length>=3).slice(0,100);}
export function fitBounds(bounds,ratio){const sw=project(bounds.sw),ne=project(bounds.ne),c=[(sw[0]+ne[0])/2,(sw[1]+ne[1])/2];let w=ne[0]-sw[0],h=sw[1]-ne[1];if(w/h<ratio)w=h*ratio;else h=w/ratio;return {sw:unproject([c[0]-w/2,c[1]+h/2]),ne:unproject([c[0]+w/2,c[1]-h/2])};}
export function validateInput(raw){
 if(!raw||typeof raw!=='object')throw new Error('分析参数无效');
 const boundary=raw.boundary||[];
 if(raw.siteConfirmed!==true)throw new Error('请先确认设计场地边界，再生成分析');
 if(!Array.isArray(boundary)||boundary.length>1000||!boundary.every(point)||boundary.length<3)throw new Error('请先圈定项目场地');
 const bounds=raw.bounds;
 if(!bounds||!point(bounds.sw)||!point(bounds.ne)||bounds.sw[0]>=bounds.ne[0]||bounds.sw[1]>=bounds.ne[1]||bounds.ne[0]-bounds.sw[0]>3||bounds.ne[1]-bounds.sw[1]>3)throw new Error('请选择不超过约 300 km 的城市展示范围');
 if(area(boundary)<1)throw new Error('设计场地边界面积太小');
 if(!inBounds(centerOf(boundary),bounds))throw new Error('出图范围需要包含项目场地');
 return {boundary,bounds,name:String(raw.name||'项目场地').slice(0,120)};
}

// Serial, bounded requests protect the account's per-second quota. Only successful responses are cached.
export function createQuery(fetcher,credentials,{interval=650,sleep=ms=>new Promise(r=>setTimeout(r,ms)),cache=new Map()}={}){
 let queue=Promise.resolve(),last=0;
 return (path,params={},options={})=>{
  const signal=options.signal;signal?.throwIfAborted();const wait=ms=>abortableStep(sleep(ms),signal,20000);
  const key=path+'?'+new URLSearchParams(params),hit=cache.get(key);if(hit&&Date.now()-hit.at<1800000)return Promise.resolve(hit.data);
  const job=queue.catch(()=>{}).then(async()=>{
   for(let attempt=0;attempt<3;attempt++){
    signal?.throwIfAborted();
    await wait(Math.max(0,interval-(Date.now()-last)));last=Date.now();
    const url=new URL(path,'https://restapi.amap.com');for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
    for(const [k,v]of Object.entries({platform:'JS',s:'rsv3',logversion:'2.0',key:credentials.key,jscode:credentials.securityCode}))url.searchParams.set(k,v);
    let data;try{const res=await fetcher(url,{redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(14000),...(signal?[signal]:[])])});if(!res.ok)throw new Error('地图服务暂时无法连接');data=await res.json();}catch{signal?.throwIfAborted();if(attempt<2){await wait(800*(attempt+1));continue;}throw new Error('地图查询超时');}
    signal?.throwIfAborted();if(data.status==='1'){cache.set(key,{at:Date.now(),data});return data;}
    const info=String(data.info||'查询失败').slice(0,100);
    if(/QPS|TOO_FREQUENT|UNKNOWN_ERROR|ENGINE_RESPONSE/.test(info)&&attempt<2){await wait(1200*(attempt+1));continue;}
    // Only report a fixed vocabulary, never echo upstream credentials or arbitrary errors.
    throw new Error(/QPS/.test(info)?'地图查询频率受限':/DAILY|OVER_LIMIT/.test(info)?'地图调用额度受限':/KEY|SCODE|PRIVILEGE|SERVICE/.test(info)?'地图凭证或服务权限异常':'地图查询未成功');
   }
  });queue=job;return job;
 };
}

export async function analyze(input,query){
 const {boundary,bounds,name}=validateInput(input),warnings=[];
 const site={name,point:centerOf(boundary),sample:false};
 const regeo=await query('/v3/geocode/regeo',{location:site.point.join(','),extensions:'base',radius:'1000'}),address=regeo.regeocode?.addressComponent;
 if(!address?.adcode)throw new Error('未能确定场地所属城区，请检查场地位置与地图服务');
 const city=(typeof address.city==='string'&&address.city)||address.province||address.district||'所在城市';
 const districts=[];
 try{
  const data=await query('/v3/config/district',{keywords:address.adcode,subdistrict:'0',extensions:'all'}),d=data.districts?.[0];
  if(!d?.polyline)throw new Error('无可用边界数据');
  const polygons=parsePolygons(d.polyline);if(!polygons.length)throw new Error('边界数据无效');
  districts.push({name:d.name,adcode:String(d.adcode),point:readPoint(d.center)||site.point,polygons,primary:true});
 }catch(e){if(e.name==='AbortError'||e.name==='TimeoutError')throw e;warnings.push(`场地所在行政区：${e.message}`);}
 const features=await discover(site,bounds,query,warnings,city);
 const reach=Math.max(distance(site.point,bounds.sw),distance(site.point,bounds.ne))/1000;
 const ringDistances=([.05,.1,.25,.5,1,2,3,5,10,20,50,100].filter(k=>k<reach*.9)).slice(-4);
 return {version:1,city,coordinateSystem:'GCJ02',site,bounds,boundary,districts,features,ringDistances,autoRingDistances:[...ringDistances],warnings,generatedAt:new Date().toISOString(),options:{districts:true,regions:true,commerce:true,public:true,transit:true,landscape:true,rings:true,links:true},source:SOURCE,method:`${city} · 当前出图范围分类检索；按类型、检索排序、距离与空间分布筛选分级。地点为定位点，不推断功能区边界；候选不代表完整普查`};
}
