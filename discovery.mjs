import {point,distance} from './dist/core.js';

// Provider POI categories, never a list of city-specific destinations.
export const categories=[
 {id:'rail',label:'铁路枢纽',types:'150200',kind:'rail',group:'transit',weight:95,quota:3},
 {id:'airport',label:'机场',types:'150100',kind:'airport',group:'transit',weight:100,quota:2},
 {id:'transit',label:'客运枢纽',types:'150400',kind:'transit',group:'transit',weight:65,quota:2},
 {id:'commerce',label:'商业中心',types:'060100',kind:'commerce',group:'commerce',weight:68,quota:4},
 {id:'region',label:'商务与商业片区',types:'190700',keywords:'商务区|商业区|商圈|CBD|金融',kind:'region',group:'commerce',weight:82,quota:3},
 {id:'industry',label:'产业园区',types:'120100',kind:'region',group:'commerce',weight:52,quota:1},
 {id:'landscape',label:'公园与景区',types:'110101|110200',kind:'landscape',group:'landscape',weight:72,quota:4},
 {id:'culture',label:'文化与会展设施',types:'140100|140200|140300|140400|140500|140600',kind:'public',group:'public',weight:72,quota:4},
 {id:'university',label:'高等院校',types:'141201',kind:'public',group:'public',weight:70,quota:2},
 {id:'hospital',label:'综合医院',types:'090100',kind:'public',group:'public',weight:65,quota:2},
 {id:'sports',label:'体育场馆',types:'080100',kind:'public',group:'public',weight:66,quota:2},
];
export const inside=(p,b)=>p[0]>=b.sw[0]&&p[0]<=b.ne[0]&&p[1]>=b.sw[1]&&p[1]<=b.ne[1];
const cleanName=s=>String(s||'').replace(/[（(][^()（）]*[)）]/g,'').replace(/\s/g,'');
const excluded=/停车场|停车库|出入口|进站口|出站口|售票|检票|候车|候机|航站楼|便利店|营业厅|服务区|服务亭|观景台|公共厕所|卫生间|售楼|住宅小区|宿舍|教学楼|住院部|门诊部|急诊|健身|台球|棋牌|培训|游泳馆|幼儿园|小学|中学|会议厅|大酒店|博览会|货运|货场|编组站|[0-9一二三四五六七八九十]+[栋幢号楼]|[A-Z]馆/;
export function candidate(p,spec,site,bounds,rank=0){
 const location=typeof p.location==='string'?p.location.split(',').map(Number):p.location;
 const name=typeof p.name==='string'?p.name.trim():'',type=String(p.type||'');
 if(!point(location)||!inside(location,bounds)||!name||name.length>60||excluded.test(name+' '+type)||/[（(]?[东西南北A-Z0-9]+门[)）]?$|[（(][A-Z0-9]+口[)）]$/.test(name))return null;
 if(spec.kind==='rail'&&!/火车站|铁路客运/.test(type))return null;
 if(spec.kind==='airport'&&(!/飞机场|机场/.test(type)||/直升|通用|军用/.test(name)))return null;
 if(spec.kind==='commerce'&&!/商场|购物中心/.test(type))return null;
 if(spec.kind==='region'&&(!/产业园区|热点地名/.test(type)||!/商务|商业区|商圈|CBD|金融|产业园|科技城|工业园|园区/i.test(name)))return null;
 if(spec.kind==='landscape'&&!/公园|风景|景区/.test(type))return null;
 if(spec.id==='sports'&&!/体育场|体育馆|体育中心|奥体|运动场/.test(name))return null;
 if(spec.id==='hospital'&&!/综合医院/.test(type))return null;
 if(spec.id==='university'&&(!/高等院校/.test(type)||/研究所|学部|系$|学院.*楼|大学.*学院/.test(name)))return null;
 if(spec.id==='culture'&&/大学.*图书馆|街道|社区|文化站|服务中心|公司|国际展览$/.test(name))return null;
 const km=distance(site.point,location)/1000;
 // Do not label the design site twice under a provider category.
 if(km<.2&&cleanName(name)===cleanName(site.name))return null;
 const span=Math.max(distance(bounds.sw,[bounds.ne[0],bounds.sw[1]])/1000,1);
 const prominence=/国家|国际|省博物馆|市博物馆|奥体|会展中心|大学|中心医院|人民医院|[45]A/.test(name+' '+String(p.biz_ext?.level||''))?10:0;
 const score=spec.weight+prominence+Math.max(0,12-rank*.6)+Math.max(0,10-km/span*20)+(p.cityRank===true?18:0);
 return {id:'poi-'+String(p.id||spec.id+'-'+location.join('-')),poiId:String(p.id||''),name,sourceName:name,sourceType:type,source:'高德范围地点检索',kind:spec.kind,category:spec.id,group:spec.group,point:location,radius:0,schematic:false,confidence:'poi',importance:score>=120?'primary':score>=100?'secondary':'context',score:Math.round(score),distanceKm:Math.round(km*10)/10,visible:false,note:`${spec.label}；按类型、检索排序和与场地距离综合筛选，仅表示地点位置`};
}
export function selectCandidates(raw,bounds){
 const unique=[];
 for(const f of [...raw].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))){
  if(unique.some(g=>(g.poiId&&f.poiId&&g.poiId===f.poiId)||(cleanName(g.name)===cleanName(f.name)&&distance(g.point,f.point)<1500)))continue;
  unique.push(f);
 }
 const selected=[],counts={},span=Math.max(bounds.ne[0]-bounds.sw[0],.00001);
 for(const spec of categories){const f=unique.find(f=>f.category===spec.id);if(f){selected.push(f);counts[spec.id]=1;}}
 // Round-robin groups ensures public facilities survive competition with hubs.
 for(let pass=0;pass<8;pass++)for(const group of ['transit','commerce','landscape','public']){
  if(selected.length>=22)break;
  const choices=unique.filter(f=>f.group===group&&!selected.includes(f)&&(counts[f.category]||0)<categories.find(c=>c.id===f.category).quota);
  choices.sort((a,b)=>adjust(b)-adjust(a)||a.id.localeCompare(b.id));
  function adjust(f){const crowded=selected.filter(g=>Math.hypot((f.point[0]-g.point[0])/span,(f.point[1]-g.point[1])/(bounds.ne[1]-bounds.sw[1]))<.075).length;return f.score-crowded*18;}
  const f=choices[0];if(f){selected.push(f);counts[f.category]=(counts[f.category]||0)+1;}
 }
 for(const f of unique){f.visible=selected.includes(f);f.autoVisible=f.visible;}
 return [...selected,...unique.filter(f=>!selected.includes(f)).slice(0,48-selected.length)].sort((a,b)=>Number(b.visible)-Number(a.visible)||b.score-a.score);
}
const polygon=b=>`${b.sw[0].toFixed(6)},${b.ne[1].toFixed(6)}|${b.ne[0].toFixed(6)},${b.sw[1].toFixed(6)}`;
export async function discover(site,bounds,query,warnings,city){
 const found=[],mid=[(bounds.sw[0]+bounds.ne[0])/2,(bounds.sw[1]+bounds.ne[1])/2];
 const cells=[{sw:bounds.sw,ne:mid},{sw:[mid[0],bounds.sw[1]],ne:[bounds.ne[0],mid[1]]},{sw:[bounds.sw[0],mid[1]],ne:[mid[0],bounds.ne[1]]},{sw:mid,ne:bounds.ne}];
 let successful=0;
 for(const spec of categories){
  // City-ranked candidates supplement spatial search, whose first page may be local-detail heavy.
  try{const data=await query('/v3/place/text',{city,citylimit:'true',types:spec.types,...(spec.keywords?{keywords:spec.keywords}:{}),offset:'25',page:'1',extensions:'all'});if(!Array.isArray(data.pois))throw Error('地点结果格式异常');successful++;data.pois.forEach((p,i)=>{const f=candidate({...p,cityRank:true},spec,site,bounds,i);if(f)found.push(f);});}
  catch(e){if(e.name==='AbortError'||e.name==='TimeoutError')throw e;warnings.push(`${spec.label}城市候选：${e.message}`);}
  try{
   const request=async b=>{const data=await query('/v3/place/polygon',{polygon:polygon(b),types:spec.types,...(spec.keywords?{keywords:spec.keywords}:{}),offset:'25',page:'1',extensions:'all'});if(!Array.isArray(data.pois))throw Error('地点结果格式异常');successful++;data.pois.forEach((p,i)=>{const f=candidate(p,spec,site,bounds,i);if(f)found.push(f);});return Number(data.count)>25;};
   const crowded=await request(bounds);
   if(crowded){let capped=false;for(const cell of cells)capped=(await request(cell))||capped;if(capped)warnings.push(`${spec.label}：范围内地点较多，采用分区候选筛选，未穷尽所有地点`);}
  }catch(e){if(e.name==='AbortError'||e.name==='TimeoutError')throw e;warnings.push(`${spec.label}：${e.message}，该类别可能不完整`);}
 }
 if(!successful)throw Error('重要地点查询均未成功，请检查地图服务权限或稍后重试');
 if(!found.length)warnings.push('当前范围没有符合类别的地点；可扩大出图范围或手动补充标注');
 return selectCandidates(found,bounds);
}
