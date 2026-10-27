const pt=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=85;
const text=(s,n=160)=>typeof s==='string'?s.slice(0,n):'';
const path=p=>{if(!Array.isArray(p)||p.length>20000||!p.every(pt))throw new Error('分析图坐标无效');return p.map(x=>[...x]);};
export function mergeAnalysisEdits(previous,next){
 if(!previous)return next;
 next.options={...next.options,...previous.options};if(!previous.autoRingDistances||JSON.stringify(previous.ringDistances)!==JSON.stringify(previous.autoRingDistances))next.ringDistances=[...previous.ringDistances];
 if(previous.site.name===next.site.name&&previous.site.labelPoint)next.site.labelPoint=[...previous.site.labelPoint];
 for(const f of next.features){
  // Never use positional ids or an edited display name as geographic identity.
  const matches=previous.features.filter(old=>old.kind===f.kind&&(old.poiId&&f.poiId?old.poiId===f.poiId:old.sourceName===f.sourceName&&Math.hypot(old.point[0]-f.point[0],old.point[1]-f.point[1])<.005));
  if(matches.length!==1)continue;const old=matches[0];
  f.name=old.name;if(typeof old.autoVisible!=='boolean'||old.visible!==old.autoVisible)f.visible=old.visible;f.radius=old.radius;f.schematic=f.kind==='region'&&f.radius>0;if(old.labelPoint)f.labelPoint=[...old.labelPoint];
 }return next;
}
export function cleanAnalysis(a){
 if(!a)return null;
 if(a.version!==1||a.coordinateSystem!=='GCJ02'||!pt(a.site?.point)||!pt(a.bounds?.sw)||!pt(a.bounds?.ne)||a.bounds.sw[0]>=a.bounds.ne[0]||a.bounds.sw[1]>=a.bounds.ne[1]||!Array.isArray(a.features)||a.features.length>60||!Array.isArray(a.districts)||a.districts.length>20)throw new Error('分析结果无效');
 const kinds=['region','commerce','public','transit','rail','airport','landscape'];
 let total=0;
 const districts=a.districts.map(d=>{if(!Array.isArray(d.polygons)||d.polygons.length>100||!pt(d.point))throw new Error('行政区边界无效');const polygons=d.polygons.map(p=>{total+=p.length;if(total>150000)throw new Error('行政边界过大');return path(p);});return{name:text(d.name),adcode:text(d.adcode,12),point:[...d.point],primary:d.primary===true,polygons};});
 const features=a.features.map(f=>{if(!kinds.includes(f.kind)||!pt(f.point)||!Number.isFinite(f.radius)||f.radius<0||f.radius>10000||!Number.isFinite(f.distanceKm))throw new Error('分析节点无效');return{id:text(f.id,80),poiId:text(f.poiId,80),name:text(f.name),...(pt(f.labelPoint)?{labelPoint:[...f.labelPoint]}:{}),kind:f.kind,point:[...f.point],radius:f.radius,schematic:f.kind==='region'&&f.radius>0,category:text(f.category,30),group:text(f.group,30),importance:['primary','secondary','context'].includes(f.importance)?f.importance:'secondary',score:Number.isFinite(f.score)?Math.max(0,Math.min(200,f.score)):0,source:text(f.source),sourceName:text(f.sourceName),sourceType:text(f.sourceType),confidence:text(f.confidence,30),note:text(f.note),distanceKm:f.distanceKm,visible:f.visible!==false,...(typeof f.autoVisible==='boolean'?{autoVisible:f.autoVisible}:{})};});
 return {version:1,city:text(a.city),coordinateSystem:'GCJ02',site:{name:text(a.site.name),point:[...a.site.point],sample:a.site.sample===true,...(pt(a.site.labelPoint)?{labelPoint:[...a.site.labelPoint]}:{})},bounds:{sw:[...a.bounds.sw],ne:[...a.bounds.ne]},ringDistances:(Array.isArray(a.ringDistances)?a.ringDistances:[3,5,10,20]).filter(n=>Number.isFinite(n)&&n>0&&n<=100).slice(0,8).sort((a,b)=>a-b),autoRingDistances:Array.isArray(a.autoRingDistances)?a.autoRingDistances.filter(n=>Number.isFinite(n)&&n>0&&n<=100).slice(0,8):null,boundary:path(a.boundary||[]),districts,features,warnings:(Array.isArray(a.warnings)?a.warnings:[]).slice(0,40).map(x=>text(x)),generatedAt:text(a.generatedAt,40),method:text(a.method,300),source:text(a.source),options:Object.fromEntries(['districts','regions','commerce','public','transit','landscape','rings','links'].map(k=>[k,a.options?.[k]!==false]))};
}
