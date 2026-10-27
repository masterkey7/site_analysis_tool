import {pngFromSvg} from './png-export.js';
import {captureSatellite} from './satellite-export.js';
import {initialState,centerOf,area,distance,frameRect,cleanPath,validateProject,viewForBounds,sameBounds} from './core.js';
import {createProjectStorage} from './project-storage.js';
import {cleanAnalysis,mergeAnalysisEdits} from './analysis-data.js';
import {renderScene,renderBackdrop,renderSatelliteOverlay,baseLayers,layerUrl,fullUrl,imageUrl} from './scene.js';
import {cleanBasemapStyle,coversBounds} from './basemap.js';
const $=id=>document.getElementById(id),STORE='site-atlas-amap-v2';
let state=initialState(),connecting=false;
const projectStorage=createProjectStorage({storage:localStorage,key:STORE,locks:globalThis.navigator?.locks,onIssue:storageIssue});
try {const saved=JSON.parse(projectStorage.raw);if(saved){state=validateProject(saved);}}catch{}
let standardLayers=null,satelliteLayer=null,satelliteRoads=null;
let map,AM,mouse,sitePolygon,siteMarker,searchMarker,editor,editorTarget;
let online=false,tool='select',selected=null,pendingText=null,searchSerial=0,searchTimer,toastTimer,saveTimer,frame;
let shapeOverlays=new Map(),history=[],future=[],viewDirty=!!state.output,editingBefore=null;
let analysisBusy=false,analysisSerial=0,analysisFrame=0,analysisController=null;
let basemapMeta=null,basemapReady=false,basemapError='',selectedFeature=null,labelDrag=null,exportSnapshot=null;
let backdropKey='',rangeRecoveryId='';
let exportController=null;
let rangeTimer,rangeLoading=false,rangeSerial=0,rangeError='',failedRange='',loadedRange='';
const style={color:'#c75b40',width:4,dash:'solid',opacity:.2};
const coords=p=>[Number(p.getLng?.()??p.lng??p[0]),Number(p.getLat?.()??p.lat??p[1])];
const pathOf=o=>cleanPath(o.getPath().map(coords));
const geoSnapshot=()=>JSON.stringify({name:state.name,siteConfirmed:state.siteConfirmed,boundary:state.boundary,shapes:state.shapes,analysis:state.analysis});
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
projectStorage.markClean(state);
function storageIssue(kind){const text=kind==='conflict'?'另一窗口已更新项目，本窗口已停止自动保存。请先下载本页备份，再重新打开最新项目。':'自动保存失败，当前修改尚未保存。请下载项目备份，暂时不要关闭页面。';$('saveStatus').textContent='尚未保存';$('storageMessage').textContent=text;$('storageWarning').hidden=false;notify(text);}
function save(){if(connecting)return;clearTimeout(saveTimer);if(!projectStorage.changed(state))return;$('saveStatus').textContent='有修改待保存';saveTimer=setTimeout(async()=>{if(await projectStorage.save(state)){$('saveStatus').textContent='已保存到本机';$('storageWarning').hidden=true;}},250);}
window.addEventListener('storage',event=>{if(event.key===STORE||event.key===null)projectStorage.observe(event.newValue);});
$('backupUnsaved').onclick=()=>downloadProject();
$('reloadProject').onclick=()=>{if(projectStorage.dirty&&!confirm('本窗口修改尚未保存。请先下载项目备份；确定重新打开另一窗口的最新项目？'))return;projectStorage.markClean(state);location.reload();};
function checkpoint(snapshot=geoSnapshot()){history.push(snapshot);while(history.length>1&&(history.length>50||history.reduce((sum,x)=>sum+x.length*2,0)>16*1024*1024))history.shift();future=[];sync();}
function undo(redo=false){stopTool();const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(geoSnapshot());Object.assign(state,JSON.parse(from.pop()));analysisPanelKey='';renderOverlays();sync();save();}
function sync(){
 const confirmed=state.siteConfirmed===true&&state.boundary.length>=3;
 $('confirmSite').disabled=!online||state.boundary.length<3||confirmed||!!editor;
 $('confirmSite').textContent=confirmed?'设计场地已确认':'确认这块设计场地';
 $('siteConfirmStatus').textContent=confirmed?'已确认。现在缩放地图，选择城市展示范围。':state.boundary.length?'边界已圈定，请核对红线后点击确认。':'请先搜索地址，再圈定实际设计地块。';
 $('searchStep').textContent=confirmed?'搜索地点 / 重新定位':'01 / 搜索场地或周边参照地点';
 $('mapWorkspace').classList.toggle('needs-site',!confirmed);
 if(document.activeElement!==$('siteNameInput'))$('siteNameInput').value=state.name==='未命名场地'?'':state.name;

 $('siteName').textContent=state.boundary.length?state.name:'尚未圈定项目场地';
 $('siteDetails').textContent=state.boundary.length?`${state.boundary.length} 个边界点 · 约 ${(area(state.boundary)/10000).toFixed(2)} 公顷`:'搜索后圈选你要研究的实际地块。';
 $('frameSite').textContent=state.boundary.length?state.name:'请先圈定项目场地';
 for(const id of ['boundaryEdit','fitSite','renameSite','clearBoundary'])$(id).disabled=!online||!state.boundary.length;
 $('restoreView').disabled=!online||!state.output;$('undoBtn').disabled=!history.length;$('redoBtn').disabled=!future.length;
 $('deleteShape').disabled=!selected;$('shapeCount').textContent=`${state.shapes.length} 个标绘`;
 $('ratio').value=state.ratio;$('customWidth').value=state.width;$('customHeight').value=state.height;$('customSize').hidden=state.ratio!=='custom';
 $('exportDimensions').textContent=`${state.width} × ${state.height} px`;$('frameTag').textContent=`出图框 · ${state.ratio==='custom'?state.width+' × '+state.height:state.ratio}`;
 $('frameTitle').hidden=true;$('north').hidden=!state.showNorth;
 for(const id of ['baseLabels','showNorth','showLegend'])$(id).checked=state[id];
 document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
 $('mapWorkspace').classList.toggle('dark-view',['dark','satellite'].includes(state.mode));$('modeNotice').hidden=state.mode!=='satellite';$('mapWorkspace').classList.toggle('satellite-mode',state.mode==='satellite');
 $('viewStatus').textContent=state.mode==='satellite'?'卫星图 · 可试导出':'当前框内即为导出内容';
 if(!online)$('viewStatus').textContent=state.output?'已保存范围 · 等待连接':'尚未确定范围';
 $('selectedLabel').textContent=selectedFeature?'编辑分析标注':selected?'编辑选中标绘':'标绘样式';
 $('propertiesPanel').hidden=!selectedFeature&&!selected&&tool==='select';$('featureProperties').hidden=!selectedFeature;$('manualProperties').hidden=!!selectedFeature;
 $('editingNotice').hidden=tool==='select'&&!editor&&!selected;$('cancelDrawing').hidden=tool==='select'&&!editor&&!selected;$('finishEditing').hidden=!editor;
 layoutFrame();syncAnalysis();syncBasemapControls();
}
function layoutFrame(){const box=$('mapWorkspace');frame=frameRect(box.clientWidth,box.clientHeight,state.width/state.height);Object.assign($('outputFrame').style,{left:frame.x+'px',top:frame.y+'px',width:frame.w+'px',height:frame.h+'px'});updateFrameInfo();scheduleAnalysis();}
function frameBounds(){if(!map||!frame)return null;return {sw:coords(map.containerToLngLat(new AM.Pixel(frame.x,frame.y+frame.h))),ne:coords(map.containerToLngLat(new AM.Pixel(frame.x+frame.w,frame.y)))};}
function updateFrameInfo(){if(!online)return;const b=frameBounds();if(!b)return;const w=distance(b.sw,[b.ne[0],b.sw[1]])/1000,h=distance(b.sw,[b.sw[0],b.ne[1]])/1000;$('frameInfo').textContent=`当前覆盖约 ${w.toFixed(1)} × ${h.toFixed(1)} km`;$('zoomValue').textContent=map.getZoom().toFixed(1);}
function syncView(){if(!online)return;state.view={center:coords(map.getCenter()),zoom:map.getZoom()};viewDirty=!!state.output&&!sameBounds(frameBounds(),state.output);sync();save();}
function finishEditor(cancel=false){
 if(!editor)return;const target=editorTarget,active=editor;editor=null;editorTarget=null;active.close();
 if(cancel){if(target==='boundary')sitePolygon?.setPath(state.boundary);else{const shape=state.shapes.find(s=>s.id===target);if(shape)shapeOverlays.get(target)?.setPath(shape.points);}editingBefore=null;$('boundaryEdit').classList.remove('active');$('boundaryEdit').textContent='编辑边界';sync();return;}
 if(target==='boundary'&&sitePolygon){const next=pathOf(sitePolygon);if(next.length>=3&&area(next)>1){if(JSON.stringify(next)!==JSON.stringify(state.boundary))state.siteConfirmed=false;state.boundary=next;siteMarker?.setPosition(centerOf(next));}else{sitePolygon.setPath(state.boundary);notify('边界面积太小，已保留原场地边界。');}}
 else if(target){const shape=state.shapes.find(x=>x.id===target),overlay=shapeOverlays.get(target);if(shape&&overlay)shape.points=pathOf(overlay);}
 if(editingBefore&&editingBefore!==geoSnapshot())checkpoint(editingBefore);editingBefore=null;
 $('boundaryEdit').classList.remove('active');$('boundaryEdit').textContent='编辑边界';if(target==='boundary'&&!state.siteConfirmed)$('sitePanel').hidden=false;sync();save();
}
function stopTool(cancel=false){finishEditor(cancel);selected=null;selectedFeature=null;mouse?.close(true);tool='select';pendingText=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='select'));$('cancelDrawing').hidden=true;if(map)map.setDefaultCursor('default');$('toolHint').textContent=online?'拖动平移 · 滚轮缩放 · 出图框即导出范围 · 拖动文字微调':'先连接地图，再搜索项目位置。';sync();}
function strokeOptions(st){return{strokeColor:st.color,strokeWeight:st.width,strokeOpacity:1,strokeStyle:st.dash,strokeDasharray:[8,6],fillColor:st.color,fillOpacity:st.opacity,bubble:false};}
function applyShapeStyle(overlay,s){if(s.type==='text')overlay.setStyle({color:s.style.color,fontSize:'14px',backgroundColor:state.mode==='dark'?'#243543e8':'#fffffff0',border:'1px solid '+s.style.color,padding:'4px 7px'});else overlay.setOptions(strokeOptions(s.style));}
function makeShape(s){let overlay;
 if(s.type==='text'){const text=document.createElement('span');text.textContent=s.text;overlay=new AM.Marker({position:s.points[0],content:text,draggable:true,bubble:false,zIndex:120});text.className='map-text';text.style.color=s.style.color;overlay.on('dragstart',()=>{editingBefore=geoSnapshot();});overlay.on('dragend',()=>{s.points=[coords(overlay.getPosition())];if(editingBefore){checkpoint(editingBefore);editingBefore=null;}save();});}
 else if(s.type==='polygon')overlay=new AM.Polygon({path:s.points,...strokeOptions(s.style),zIndex:80});
 else overlay=new AM.Polyline({path:s.points,...strokeOptions(s.style),showDir:s.type==='arrow',zIndex:90});
 overlay.setMap(map);overlay.on('click',()=>{if(tool==='select')selectShape(s.id);});shapeOverlays.set(s.id,overlay);
 return overlay;
}
function renderOverlays(){if(!map)return;finishEditor();for(const o of shapeOverlays.values())o.setMap(null);shapeOverlays.clear();sitePolygon?.setMap(null);siteMarker?.setMap(null);sitePolygon=null;siteMarker=null;selected=null;
 if(state.boundary.length){sitePolygon=new AM.Polygon({path:state.boundary,strokeColor:'#d24f3e',strokeWeight:2,fillColor:'#d65742',fillOpacity:.2,zIndex:70,bubble:true});sitePolygon.setMap(map);const pin=document.createElement('div');pin.className='site-pin';siteMarker=new AM.Marker({position:centerOf(state.boundary),content:pin,offset:new AM.Pixel(-6,-6),zIndex:110,bubble:true});siteMarker.setMap(map);}
 for(const s of state.shapes)makeShape(s);sync();
}
function selectShape(id){finishEditor();selectedFeature=null;selected=id;const s=state.shapes.find(x=>x.id===id),o=shapeOverlays.get(id);if(!s)return;Object.assign(style,s.style);syncStyle();sync();
 if(s.type!=='text'){editingBefore=geoSnapshot();editorTarget=id;editor=s.type==='polygon'?new AM.PolygonEditor(map,o):new AM.PolylineEditor(map,o);editor.open();sync();$('cancelDrawing').hidden=false;$('toolHint').textContent='拖动节点修改形状，点击“完成编辑”提交，Esc 或“取消”恢复原状。';}
 else $('toolHint').textContent='拖动文字改变位置；修改颜色，或按 Delete 删除。';scheduleAnalysis();
}
function startTool(next){closePanels();if(!online)return notify('请先连接地图');stopTool();selected=null;tool=next;sync();document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===next));if(next==='select')return;$('cancelDrawing').hidden=false;
 if(next==='text'){map.setDefaultCursor('crosshair');$('toolHint').textContent='点击地图放置文字，Esc 取消。';return;}
 const options=strokeOptions(next.startsWith('boundary')?{color:'#d24f3e',width:2,dash:'dashed',opacity:.2}:style);
 if(next==='boundaryRect'){mouse.rectangle(options);$('toolHint').textContent='按住鼠标拖出矩形，松开完成场地圈选。';}
 else if(next==='boundaryPolygon'||next==='polygon'){mouse.polygon(options);$('toolHint').textContent='沿边界逐点点击，双击完成；Esc 取消。';}
 else {mouse.polyline({...options,showDir:next==='arrow'});$('toolHint').textContent='点击起点与折点，双击终点完成；Esc 取消。';}
}
function acceptDrawing(event){const kind=tool,obj=event.obj;let points;if(!['boundaryRect','boundaryPolygon','line','polyline','arrow','polygon'].includes(kind)){obj.setMap(null);return;}
 if(kind==='boundaryRect'){const b=obj.getBounds(),sw=coords(b.getSouthWest()),ne=coords(b.getNorthEast());points=[sw,[ne[0],sw[1]],ne,[sw[0],ne[1]]];}
 else points=pathOf(obj);
 const min=kind.startsWith('boundary')||kind==='polygon'?3:2,metresPerPixel=points.length?156543.034*Math.cos(centerOf(points)[1]*Math.PI/180)/2**map.getZoom():1,minArea=kind.startsWith('boundary')?Math.max(1,25*metresPerPixel**2):1;if(points.length<min||(min===3&&area(points)<minArea)){obj.setMap(null);stopTool();return notify('范围太小，请重新圈选。');}
 checkpoint();if(kind.startsWith('boundary')){state.boundary=points;state.siteConfirmed=false;notify('场地边界已圈定，请核对红线并确认设计场地。');}
 else state.shapes.push({id:crypto.randomUUID(),type:kind,points:kind==='line'?[points[0],points.at(-1)]:points,style:{...style}});
 obj.setMap(null);stopTool();renderOverlays();if(kind.startsWith('boundary'))$('sitePanel').hidden=false;save();
}
function syncStyle(){$('shapeColor').value=style.color;$('lineDash').value=style.dash;$('lineWidth').value=style.width;$('fillOpacity').value=Math.round(style.opacity*100);}
function updateStyle(){finishEditor();const st={color:$('shapeColor').value,dash:$('lineDash').value,width:Number($('lineWidth').value),opacity:Number($('fillOpacity').value)/100};Object.assign(style,st);if(selected){checkpoint();const s=state.shapes.find(x=>x.id===selected);if(s){s.style={...style};const o=shapeOverlays.get(selected);if(s.type==='text')o.getContent().style.color=style.color;else applyShapeStyle(o,s);}save();}sync();}
function setMode(mode){if(!['light','moss','dark','satellite'].includes(mode))return;stopTool();state.mode=mode;setReferenceMap();sync();drawAnalysis();save();}
function setReferenceMap(){if(!map)return;
 if(state.mode==='satellite'){satelliteLayer??=new AM.TileLayer.Satellite();satelliteRoads??=new AM.TileLayer.RoadNet();map.setLayers([satelliteLayer,...(state.baseLabels?[satelliteRoads]:[])]);}
 else {if(standardLayers)map.setLayers(standardLayers);map.setMapStyle({light:'amap://styles/light',moss:'amap://styles/fresh',dark:'amap://styles/darkblue'}[state.mode]);}
 map.setFeatures(['bg','road','building',...(state.baseLabels?['point']:[])]);
}
function searchMessage(text){$('searchResults').hidden=false;$('searchResults').replaceChildren();const p=document.createElement('p');p.textContent=text;$('searchResults').append(p);}
function errorText(code){const messages={INVALID_USER_KEY:'Key 无效，请检查是否复制完整。',INVALID_USER_SCODE:'安全密钥不匹配，请使用与 Key 对应的安全密钥。',INVALID_USER_DOMAIN:'域名白名单不匹配，请在高德控制台允许当前本机地址。',USERKEY_PLAT_NOMATCH:'Key 平台类型不匹配，请使用 Web 端（JS API）Key。',SERVICE_NOT_AVAILABLE:'当前账号尚未开通所需地图服务。',USER_DAILY_QUERY_OVER_LIMIT:'地图服务今日调用额度已用完。',ACCESS_TOO_FREQUENT:'搜索过于频繁，请稍后重试。',CUQPS_HAS_EXCEEDED_THE_LIMIT:'搜索过于频繁，请稍后重试。',INSUFFICIENT_PRIVILEGES:'当前账号尚未开通地点搜索服务。'};return messages[code]||'地图查询暂不可用，请检查连接或账号服务权限。';}
// Use the same local JSON proxy that powers the verified analysis queries.
// AMap's UI search plugin has a separate callback transport and is not required.
async function queryPlaces(query,full=false,city=''){
 const params=new URLSearchParams({keywords:query,city:city||'全国',citylimit:'false',platform:'JS',s:'rsv3',logversion:'2.0',...(full?{offset:'8',extensions:'base'}:{datatype:'all'})});
 let response,data;
 try{response=await fetch('/_AMapService/v3/'+(full?'place/text':'assistant/inputtips')+'?'+params,{signal:AbortSignal.timeout(20000)});data=await response.json();}
 catch(e){throw new Error(e.name==='TimeoutError'?'地点查询超时，请稍后重试。':'无法连接地点搜索服务，请检查本机服务和网络后重试。');}
 if(!response.ok)throw new Error(response.status===503?'请先配置地图凭证。':'地点搜索服务暂不可用，请稍后重试。');
 if(String(data.status)!=='1'){
  const code=typeof data.info==='string'&&/^[A-Z_0-9]{1,80}$/.test(data.info)?data.info:'';
  throw new Error(errorText(code)+(code?'（'+code+'）':''));
 }
 const items=full?data.pois:data.tips;
 if(!Array.isArray(items))throw new Error('地点搜索返回格式异常，请稍后重试。');
 return items.map(item=>{
  const values=typeof item.location==='string'?item.location.split(',').map(Number):item.location;
  const location=Array.isArray(values)&&values.length===2&&values.every(Number.isFinite)&&Math.abs(values[0])<=180&&Math.abs(values[1])<=85?values:null;
  return {name:String(item.name||'未命名地点'),location,district:item.district,pname:item.pname,cityname:item.cityname,adname:item.adname,address:item.address,adcode:item.adcode};
 }).filter(item=>item.location||(!full&&/^\d{6}$/.test(String(item.adcode||''))));
}
async function searchPlaces(full=false,city=''){const text=$('searchInput').value.trim();const serial=++searchSerial;if(!text){$('searchResults').hidden=true;return;}searchMessage('正在查找…');try{const items=await queryPlaces(text,full,city);if(serial!==searchSerial)return;$('searchResults').replaceChildren();if(!items.length)return searchMessage('没有找到匹配地点，请补充城市或更详细的地址。');for(const item of items){const b=document.createElement('button');b.type='button';const name=document.createElement('span'),address=document.createElement('small');name.className='search-title';name.textContent=item.name||'未命名地点';address.textContent=[item.district,item.pname,item.cityname,item.adname,typeof item.address==='string'?item.address:''].filter(Boolean).join(' ');b.append(name,address);b.onclick=()=>chooseResult(item);$('searchResults').append(b);}}catch(e){if(serial===searchSerial)searchMessage(e.message);}}
function chooseResult(item){if(!online){notify('已找到地点，但地图组件尚未加载。请先重试连接地图，再点击定位。');return;}++searchSerial;clearTimeout(searchTimer);const p=item.location?coords(item.location):null;if(!p||!p.every(Number.isFinite)){$('searchInput').value=item.name;searchPlaces(true,String(item.adcode||''));return;}
 stopTool();searchMarker?.setMap(null);searchMarker=new AM.Marker({position:p,title:item.name});searchMarker.setMap(map);map.setZoomAndCenter(16,p);$('searchResults').hidden=true;$('searchInput').value=item.name;$('sitePanel').hidden=false;notify(state.boundary.length?'已定位参照地点，项目名称和原场地边界保留。':'已定位参照地点。移动地图找到设计场地，圈定边界后单独填写项目名称。');
}
function fitToOutput(){if(!map||!state.output)return;stopTool();const box=$('mapWorkspace'),view=viewForBounds(state.output,frame,box.clientWidth,box.clientHeight);map.setZoomAndCenter(view.zoom,view.center);syncView();}
function downloadProject(){stopTool();const clean=validateProject({app:'site-atlas',version:2,state});const blob=new Blob([JSON.stringify({app:'site-atlas',version:2,state:clean})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='场地Atlas-'+state.name.replace(/[<>:"/\\|?*]/g,'_')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('项目已保存，包含场地边界、出图范围与手绘标注。');}
async function connect(){
 if(connecting||online)return;connecting=true;$('retryMap').disabled=true;
 try {const response=await fetch('/api/bootstrap');if(!response.ok)throw new Error('本机配置服务不可用');const cfg=await response.json();if(!cfg.configured){$('emptyTitle').textContent='连接你的地图';$('emptyMessage').textContent='配置高德地图后即可搜索地址、圈定设计场地并生成分析图。';sync();return;}
 $('emptyTitle').textContent='正在连接高德地图';$('emptyMessage').textContent='加载底图与搜索服务…';$('emptyAction').textContent='检查地图配置';
 window._AMapSecurityConfig={serviceHost:location.origin+'/_AMapService'};
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('地图组件加载超时。请检查网络，或允许浏览器访问 webapi.amap.com 后重试。')),18000);const script=document.createElement('script');script.src='https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(cfg.key);script.onload=()=>{clearTimeout(timer);window.AMap?resolve():reject(new Error('地图初始化失败，请检查 Key 的平台类型。'));};script.onerror=()=>{clearTimeout(timer);reject(new Error('高德地图组件加载失败，可能被浏览器扩展或网络策略拦截。请检查 webapi.amap.com 的访问设置；地址搜索仍可使用。'));};document.head.append(script);});
 AM=window.AMap;
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('地图工具加载超时，请刷新后重试。')),15000);AM.plugin(['AMap.MouseTool','AMap.PolygonEditor','AMap.PolylineEditor','AMap.Scale'],()=>{clearTimeout(timer);resolve();});});
 map=new AM.Map('map',{center:state.view.center,zoom:state.view.zoom,zooms:[3,20],viewMode:'2D',WebGLParams:{preserveDrawingBuffer:true},pitch:0,rotation:0,rotateEnable:false,pitchEnable:false,resizeEnable:true,animateEnable:false,jogEnable:false,mapStyle:'amap://styles/whitesmoke'});
 standardLayers=map.getLayers().slice();
 map.addControl(new AM.Scale({position:'LB',offset:new AM.Pixel(15,40)}));mouse=new AM.MouseTool(map);mouse.on('draw',acceptDrawing);

 map.on('mapmove',scheduleAnalysis);map.on('zoomchange',scheduleAnalysis);map.on('moveend',syncView);map.on('zoomend',syncView);map.on('click',e=>{if(tool==='text'){pendingText=coords(e.lnglat);$('textTitle').textContent='添加文字';$('textInput').value='';$('textDialog').returnValue='';$('textDialog').showModal();$('textInput').focus();}});
 online=true;document.querySelectorAll('[data-map-required]').forEach(b=>b.disabled=false);$('connectionEmpty').hidden=true;$('connectionBtn').classList.add('connected');$('connectionBtn').querySelector('span').textContent='地图配置';$('mapStatus').textContent='高德地图已加载 · 搜索待验证';
 setMode(state.mode);renderOverlays();stopTool();layoutFrame();sync();
 $('mapStatus').textContent='高德地图已加载 · 地址搜索按需查询';
 }catch(e){$('emptyTitle').textContent='地图还没有连接成功';$('emptyMessage').textContent=e.message;$('emptyAction').textContent='检查地图配置 ↗';$('mapStatus').textContent='地图组件未加载 · 可先搜索地址';}finally{connecting=false;if(projectStorage.changed(state))save();$('retryMap').disabled=false;}
}
$('retryMap').onclick=()=>connect();
$('searchForm').onsubmit=e=>{e.preventDefault();clearTimeout(searchTimer);searchPlaces(true);};$('searchInput').oninput=()=>{++searchSerial;clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchPlaces(false),450);};$('locateSite').onclick=()=>{$('searchInput').focus();};
function setSiteName(name){state.name=name;if(state.analysis)state.analysis.site.name=name;}
$('siteNameInput').onchange=()=>{const name=$('siteNameInput').value.trim();if(!name){$('siteNameInput').value=state.name==='未命名场地'?'':state.name;return;}checkpoint();setSiteName(name.slice(0,120));sync();save();};
$('confirmSite').onclick=()=>{stopTool();if(!online||state.boundary.length<3||area(state.boundary)<=1)return notify('请先圈定有效的设计场地边界');checkpoint();state.siteConfirmed=true;sync();save();notify('设计场地已确认。缩放地图选择城市展示范围，再点击生成分析。');};
$('boundaryRect').onclick=()=>startTool('boundaryRect');$('boundaryPolygon').onclick=()=>startTool('boundaryPolygon');
$('boundaryEdit').onclick=()=>{closePanels();if(editorTarget==='boundary'){stopTool();renderOverlays();return;}stopTool();if(!sitePolygon)return;editingBefore=geoSnapshot();editorTarget='boundary';editor=new AM.PolygonEditor(map,sitePolygon);editor.open();sync();$('boundaryEdit').classList.add('active');$('boundaryEdit').textContent='完成编辑';$('cancelDrawing').hidden=false;$('toolHint').textContent='拖动节点修改场地边界，点击“完成编辑”保存。';};
$('fitSite').onclick=()=>{stopTool();if(sitePolygon)map.setFitView([sitePolygon],false,[90,70,90,70],18);};
$('clearBoundary').onclick=()=>{stopTool();checkpoint();state.boundary=[];state.siteConfirmed=false;renderOverlays();$('sitePanel').hidden=false;save();};
$('renameSite').onclick=()=>{stopTool();$('textTitle').textContent='重命名场地';$('textInput').value=state.name;pendingText='rename';$('textDialog').returnValue='';$('textDialog').showModal();};
$('textDialog').addEventListener('close',()=>{const text=$('textInput').value.trim(),target=pendingText;if($('textDialog').returnValue==='ok'&&text&&target){checkpoint();if(target==='rename'){setSiteName(text);}else state.shapes.push({id:crypto.randomUUID(),type:'text',points:[target],text,style:{...style}});stopTool();renderOverlays();save();}pendingText=null;});
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>startTool(b.dataset.tool));$('cancelDrawing').onclick=()=>{stopTool(true);renderOverlays();};$('finishEditing').onclick=()=>{stopTool();renderOverlays();};
$('deleteShape').onclick=()=>{finishEditor();if(!selected)return;checkpoint();state.shapes=state.shapes.filter(x=>x.id!==selected);selected=null;renderOverlays();sync();save();};
for(const id of ['shapeColor','lineDash','lineWidth','fillOpacity'])$(id).onchange=updateStyle;
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('baseLabels').onchange=e=>{state.baseLabels=e.target.checked;setMode(state.mode);};
for(const id of ['showNorth','showLegend'])$(id).onchange=e=>{state[id]=e.target.checked;sync();save();};
function changeRatio(){const ratio=$('ratio').value,customWidth=Number($('customWidth').value),customHeight=Number($('customHeight').value);stopTool();let w=4800,h;if(ratio==='custom'){w=customWidth;h=customHeight;}else{const [a,b]=ratio.split(':').map(Number);h=Math.round(w*b/a);}if(![w,h].every(n=>Number.isInteger(n)&&n>=600&&n<=8000)||w*h>40000000){notify('尺寸需为 600–8000 像素，总像素不超过 4000 万。');sync();return;}state.ratio=ratio;state.width=w;state.height=h;viewDirty=!!state.output;sync();save();}
$('ratio').onchange=changeRatio;$('customWidth').onchange=changeRatio;$('customHeight').onchange=changeRatio;
$('captureView').onclick=()=>{stopTool();state.output=frameBounds();viewDirty=false;sync();save();notify('出图范围已保存，场地边界保持不变。');};$('restoreView').onclick=fitToOutput;
$('zoomIn').onclick=()=>map?.zoomIn();$('zoomOut').onclick=()=>map?.zoomOut();$('undoBtn').onclick=()=>undo();$('redoBtn').onclick=()=>undo(true);
$('saveProject').onclick=downloadProject;$('importProject').onclick=()=>$('projectFile').click();
$('projectFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>64*1024*1024)throw new Error('项目文件过大');const imported=validateProject(JSON.parse(await file.text()));if((state.boundary.length||state.shapes.length)&&!confirm('导入会替换当前项目。请确认已保存需要保留的内容。'))return;stopTool();++searchSerial;clearTimeout(searchTimer);searchMarker?.setMap(null);$('searchResults').hidden=true;state=imported;$('searchInput').value='';analysisPanelKey='';history=[];future=[];if(map){map.setZoomAndCenter(state.view.zoom,state.view.center);setMode(state.mode);renderOverlays();}viewDirty=!!state.output;sync();if(!state.siteConfirmed)$('sitePanel').hidden=false;save();notify('项目已导入。');}catch(err){notify(err.message||'无法读取项目');}finally{e.target.value='';}};
$('newProject').onclick=()=>{if((state.boundary.length||state.shapes.length)&&!confirm('新建项目将清空当前编辑内容。已下载的项目备份不会受影响。'))return;stopTool();++searchSerial;clearTimeout(searchTimer);$('searchResults').hidden=true;$('searchInput').value='';state=initialState();$('sitePanel').hidden=false;$('searchInput').focus();analysisPanelKey='';history=[];future=[];searchMarker?.setMap(null);viewDirty=false;if(map){map.setZoomAndCenter(state.view.zoom,state.view.center);setMode(state.mode);renderOverlays();}sync();save();};
for(const id of ['exportTop','exportBtn'])$(id).onclick=openExport;$('closeExport').onclick=()=>$('exportDialog').close();$('exportDialog').addEventListener('close',()=>exportController?.abort());
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){stopTool(true);renderOverlays();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}if(e.key==='Delete'&&selected)$('deleteShape').click();});
new ResizeObserver(()=>{layoutFrame();if(online&&state.output){viewDirty=true;sync();}}).observe($('mapWorkspace'));
window.addEventListener('beforeunload',event=>{if(projectStorage.changed(state)||editingBefore||labelDrag){event.preventDefault();event.returnValue='';}});
function analysisFresh(){const a=state.analysis;return state.siteConfirmed===true&&!!a&&JSON.stringify(state.boundary)===JSON.stringify(a.boundary);}
function syncBasemapControls(){
 state.basemapStyle=cleanBasemapStyle(state.basemapStyle);
 if(!$('basemapOptions').children.length)for(const [key,label]of [['water','钱塘江与湖泊'],['roads','道路、桥梁与铁路'],['buildings','建筑与街区肌理'],['green','绿地与山林']]){const row=document.createElement('label');row.className='check-row';const input=document.createElement('input');input.type='checkbox';input.dataset.basemap=key;input.onchange=()=>{state.basemapStyle[key]=input.checked;scheduleAnalysis();save();};row.append(input,document.createTextNode(label));$('basemapOptions').append(row);}
 for(const input of $('basemapOptions').querySelectorAll('input'))input.checked=state.basemapStyle[input.dataset.basemap];
 $('basemapStatus').textContent=basemapError||(!basemapReady?'正在加载城市底图…':map&&!coversBounds(basemapMeta,frameBounds())?'当前范围需要加载新底图，正在自动准备。':'当前范围底图已就绪 · 可随分析图导出');
}
async function loadBasemapPreview(){
 try{const r=await fetch('/basemap-meta.json');if(!r.ok)throw new Error('底图暂未加载，请刷新页面重试。');basemapMeta=await r.json();if(basemapMeta.coordinateSystem!=='GCJ02')throw new Error('底图坐标配置不匹配');
 basemapReady=true;scheduleAnalysis();
 }catch(e){basemapError=e.message;}finally{syncBasemapControls();}
}
async function embeddedImages(st,metadata,signal){
 const layers=st.mode==='satellite'?(st.basemapStyle.water?['water']:[]):baseLayers.every(k=>st.basemapStyle[k])?['full']:baseLayers.filter(k=>st.basemapStyle[k]);
 return Object.fromEntries(await Promise.all(layers.map(async layer=>{
  const url=imageUrl(metadata,st.mode==='satellite'?'moss':st.mode,layer),response=await fetch(url,{signal:AbortSignal.any([AbortSignal.timeout(45000),...(signal?[signal]:[])])});
  if(!response.ok){const error=new Error('底图加载失败');error.status=response.status;throw error;}
  const blob=await response.blob(),value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('底图读取失败'));reader.readAsDataURL(blob);});return [layer,value];
 })));
}
async function prepareExportAssets(snapshot,signal){
 try{return await embeddedImages(snapshot.state,snapshot.metadata,signal);}
 catch(e){
  if(e.status!==404||!snapshot.metadata?.dynamic)throw e;
  const b=snapshot.bounds,response=await fetch('/api/basemap?'+new URLSearchParams({west:b.sw[0],south:b.sw[1],east:b.ne[0],north:b.ne[1]}),{signal}),metadata=await response.json();
  if(!response.ok||!coversBounds(metadata,b))throw new Error('底图缓存恢复失败，请重试');
  snapshot.metadata=metadata;if(map&&coversBounds(metadata,frameBounds())){basemapMeta=metadata;loadedRange='';failedRange='';backdropKey='';scheduleAnalysis();}
  return embeddedImages(snapshot.state,metadata,signal);
 }
}
$('mapBackdrop').addEventListener('error',()=>{
 if(!basemapMeta?.dynamic||rangeLoading)return;if(rangeRecoveryId===basemapMeta.id){rangeError='底图预览加载失败，请检查本机服务后点击重试';scheduleAnalysis();return;}
 rangeRecoveryId=basemapMeta.id;loadedRange='';failedRange='';backdropKey='';expandBasemap(true);
},true);

function worldBounds(){const box=$('mapWorkspace');return {sw:coords(map.containerToLngLat(new AM.Pixel(0,box.clientHeight))),ne:coords(map.containerToLngLat(new AM.Pixel(box.clientWidth,0)))};}
function queueBasemap(){if(!map||!basemapReady||rangeLoading)return;const b=frameBounds(),needs=!coversBounds(basemapMeta,b)||((basemapMeta.zoom||13)<14&&map.getZoom()>(basemapMeta.zoom||13)+1);clearTimeout(rangeTimer);if(!needs)return;const key=JSON.stringify(worldBounds());if(key===loadedRange||key===failedRange)return;rangeTimer=setTimeout(()=>expandBasemap(),650);}
async function expandBasemap(force=false){if(!map||rangeLoading)return;const b=worldBounds(),key=JSON.stringify(b);if((failedRange===key||loadedRange===key)&&!force)return;rangeLoading=true;rangeError='';const serial=++rangeSerial;drawAnalysis();
 try{const params=new URLSearchParams({west:b.sw[0],south:b.sw[1],east:b.ne[0],north:b.ne[1]});const response=await fetch('/api/basemap?'+params,{signal:AbortSignal.timeout(180000)}),data=await response.json();if(!response.ok)throw new Error(data.error||'网络连接失败');if(serial!==rangeSerial)return;if(data.coordinateSystem!=='GCJ02'||!data.assetUrls||!coversBounds(data,b))throw new Error('底图数据格式不正确');basemapMeta=data;basemapReady=true;failedRange='';loadedRange=key;}
 catch(e){rangeError=e.name==='TimeoutError'?'网络超时，请重试':e.message;failedRange=key;}
 finally{rangeLoading=false;syncBasemapControls();scheduleAnalysis();if($('exportDialog').open&&!exportSnapshot&&!rangeError)openExport();}
}
$('coverageWarning').onclick=()=>{rangeRecoveryId='';backdropKey='';expandBasemap(true);};
const analysisInputSignature=()=>JSON.stringify({name:state.name,boundary:state.boundary,bounds:map?frameBounds():null,ratio:state.ratio,width:state.width,height:state.height});
function scheduleAnalysis(){if(analysisFrame)return;analysisFrame=requestAnimationFrame(()=>{analysisFrame=0;drawAnalysis();});}
function drawAnalysis(){
 const el=$('analysisOverlay'),backdrop=$('mapBackdrop');if(!map||!frame){el.hidden=true;backdrop.hidden=true;return;}
 const bounds=frameBounds();queueBasemap();const satellite=state.mode==='satellite',editing=tool!=='select'||!!editor||!!selected;
 const viewState=analysisFresh()?state:{...state,analysis:null};
 const covered=basemapReady&&coversBounds(basemapMeta,bounds);
 backdrop.hidden=!basemapReady||editing||!covered;
 if(!backdrop.hidden){const box=$('mapWorkspace'),world={sw:coords(map.containerToLngLat(new AM.Pixel(0,box.clientHeight))),ne:coords(map.containerToLngLat(new AM.Pixel(box.clientWidth,0)))};const key=JSON.stringify([world,state.mode,state.basemapStyle,basemapMeta.id||'static',box.clientWidth,box.clientHeight]);if(key!==backdropKey){const previewMeta=basemapMeta.previewAssetUrls?{...basemapMeta,assetUrls:basemapMeta.previewAssetUrls}:basemapMeta;backdrop.innerHTML=renderBackdrop(state,world,previewMeta,box.clientWidth,box.clientHeight);backdropKey=key;}}
 $('coverageWarning').hidden=!rangeLoading&&!rangeError&&(satellite||covered||!basemapReady);
 $('coverageWarning').textContent=rangeError?'底图加载未完成：'+rangeError+' · 点击重试':'正在加载当前范围的底图…';
 el.hidden=false;
 Object.assign(el.style,{left:frame.x+'px',top:frame.y+'px',width:frame.w+'px',height:frame.h+'px'});
 el.classList.toggle('editing',editing);el.classList.toggle('satellite-view',true);
 el.innerHTML=renderSatelliteOverlay(viewState,bounds,{interactive:true});
 $('frameTitle').hidden=true;$('north').hidden=true;
 for(const node of el.querySelectorAll('[data-feature]'))node.classList.toggle('is-selected',node.dataset.feature===selectedFeature);
}

let analysisPanelKey='';
function syncAnalysis(){
 const a=state.analysis,fresh=analysisFresh();
 $('generateAnalysis').disabled=!online||analysisBusy||!state.siteConfirmed||state.boundary.length<3;$('generateCurrent').disabled=analysisBusy;
 $('cancelAnalysis').hidden=!analysisBusy;
 $('generateAnalysis').textContent=analysisBusy?'正在识别并排图…':'生成当前场地区位图';
 $('analysisStatus').textContent=analysisBusy?'正在按范围查询交通、商业、公园与公共设施，通常需要 20–90 秒。':!state.siteConfirmed?'请先确认设计场地边界。':!a?'已确认场地，请调整城市范围后生成分析。':!fresh?'场地边界已改变，请重新生成。':`已显示 ${a.features.filter(f=>f.visible).length} / ${a.features.length} 个候选 · ${a.warnings.length?'部分查询受限，见识别依据':'按类别与重要性筛选，可手动微调'}`;
 $('analysisStatus').classList.toggle('is-stale',!!a&&!fresh);
 $('analysisCount').textContent=a?`${a.features.filter(f=>f.visible).length} / ${a.features.length}`:'尚未生成';
 $('clearAnalysis').hidden=!a;$('analysisDetails').hidden=!a;
 $('frameTitle').hidden=true;$('north').hidden=!state.showNorth||fresh;
 if(a?.site.sample&&!state.boundary.length){$('siteDetails').textContent='旧示例已保留。请圈定并确认你自己的设计场地后重新生成。';}
 const key=JSON.stringify(a?{at:a.generatedAt,features:a.features.map(f=>[f.id,f.name,f.visible,f.radius]),options:a.options,rings:a.ringDistances}:null);
 if(key===analysisPanelKey)return;analysisPanelKey=key;
 $('ringDistances').value=(a?.ringDistances||[3,5,10,20]).join(', ');$('analysisOptions').replaceChildren();$('analysisFeatures').replaceChildren();$('analysisSources').replaceChildren();if(!a)return;
 const checks=[['districts','场地所在城区边界'],['regions','商务与产业片区'],['commerce','商业中心'],['public','重要公共设施'],['transit','交通枢纽'],['landscape','公园与景观'],['rings','距离圈'],['links','枢纽联系 · 直线']];
 for(const [key,title]of checks){const row=document.createElement('label');row.className='check-row';const input=document.createElement('input');input.type='checkbox';input.checked=a.options[key];input.onchange=()=>{checkpoint();state.analysis.options[key]=input.checked;syncAnalysis();scheduleAnalysis();save();};row.append(input,document.createTextNode(title));$('analysisOptions').append(row);}
 for(const f of a.features){const row=document.createElement('div');row.className='analysis-feature';const input=document.createElement('input');input.type='checkbox';input.checked=f.visible;input.onchange=()=>{checkpoint();const current=featureById(f.id);if(current)current.visible=input.checked;syncAnalysis();scheduleAnalysis();save();};const text=document.createElement('button');text.type='button';text.onclick=()=>selectFeature(f.id);const name=document.createElement('strong'),sub=document.createElement('small');name.textContent=f.name;sub.textContent=(f.schematic?'范围示意 · ':({primary:'优先',secondary:'次级',context:'补充'}[f.importance]||'节点')+' · ')+`直线 ${f.distanceKm.toFixed(1)} km`;text.append(name,sub);row.append(input,text);$('analysisFeatures').append(row);}
 const description=document.createElement('p');description.textContent=a.method+'。圈选范围只控制取景，不修改片区位置。';$('analysisSources').append(description);
 for(const f of a.features){const p=document.createElement('p');p.textContent=`${f.name} · ${f.note||''} ← ${f.sourceName}（${f.sourceType}）${f.confidence==='anchor'?'；仅作名称定位锚点，不代表法定范围':''}`;$('analysisSources').append(p);}
 for(const warning of a.warnings){const p=document.createElement('p');p.className='error-text';p.textContent=warning;$('analysisSources').append(p);}
}
async function generateAnalysis(){
 if(!online)return notify('请先连接地图');if(analysisBusy)return;
 stopTool();
 if(!state.siteConfirmed||state.boundary.length<3){$('sitePanel').hidden=false;return notify('请先圈定并确认设计场地边界');}
 const requestBounds=frameBounds(),controller=new AbortController();analysisController=controller;
 const signature=analysisInputSignature(),serial=++analysisSerial;analysisBusy=true;syncAnalysis();
 try{
  const boot=await(await fetch('/api/bootstrap',{signal:controller.signal})).json();
  const response=await fetch('/api/location-analysis',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Token':boot.csrf},body:JSON.stringify({siteConfirmed:true,name:state.name,boundary:state.boundary,bounds:requestBounds}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'分析生成失败');
  if(serial!==analysisSerial||signature!==analysisInputSignature()||!state.siteConfirmed)return notify('生成期间场地或范围已改变，本次结果未应用。请确认新场地和范围后重新生成。');
  controller.signal.throwIfAborted();const result=mergeAnalysisEdits(state.analysis,cleanAnalysis(data));checkpoint();
  state.analysis=result;analysisPanelKey='';sync();save();closePanels();notify(`已生成 ${result.features.filter(f=>f.visible).length} 个标注，可拖动文字，或在图层中编辑候选。`);
 }catch(e){notify(e.name==='AbortError'?'已取消生成，原有分析已保留。':e.name==='TimeoutError'?'地图查询用时较长，请稍后重试。':e.message);}finally{analysisController=null;analysisBusy=false;syncAnalysis();scheduleAnalysis();}
}
function openExport(){
 if(exportController)return;stopTool();sync();drawAnalysis();const bounds=frameBounds(),needsBase=state.mode!=='satellite'||state.basemapStyle.water,ready=online&&state.siteConfirmed&&state.boundary.length>=3&&(!state.analysis||analysisFresh())&&bounds&&(!needsBase||(basemapReady&&coversBounds(basemapMeta,bounds)));
 exportSnapshot=ready?{state:structuredClone(state),bounds:structuredClone(bounds),metadata:structuredClone(basemapMeta)}:null;
 $('exportNote').textContent=!state.siteConfirmed?'请先圈定并确认设计场地，再生成或导出图面。':ready?`输出 ${state.width} × ${state.height} px；当前图面已锁定。${state.mode==='satellite'?'卫星导出为试用功能，将重新加载当前范围的影像，可能需要约一分钟。':''}`:'当前范围底图正在准备，加载完成后可导出；场地边界改变时请重新生成分析。';
 $('exportPng').disabled=!ready;$('exportSvg').disabled=!ready;if(!$('exportDialog').open)$('exportDialog').showModal();
}

function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportAnalysis(format){
 if(!exportSnapshot||exportController)return;const snapshot=exportSnapshot,controller=new AbortController();exportController=controller;$('exportPng').disabled=true;$('exportSvg').disabled=true;$('exportNote').textContent='正在准备高清图片…';
 try{const st=snapshot.state,images=await prepareExportAssets(snapshot,controller.signal);controller.signal.throwIfAborted();if(st.mode==='satellite')images.satellite=await captureSatellite({AM,bounds:snapshot.bounds,width:st.width,height:st.height,baseLabels:st.baseLabels,signal:controller.signal,onProgress:text=>$('exportNote').textContent=text});controller.signal.throwIfAborted();const svg=renderScene(st,snapshot.bounds,snapshot.metadata,{images,pixelWidth:st.width,pixelHeight:st.height}),blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),name=st.name.replace(/[<>:"/\\|?*]/g,'_')+'-城市区位';
 if(format==='svg')saveBlob(blob,name+'.svg');else{const png=await pngFromSvg(blob,st.width,st.height,controller.signal);controller.signal.throwIfAborted();saveBlob(png,name+'.png');}
 $('exportDialog').close();notify('已导出当前出图框中的图面。');
 }catch(e){if(e.name!=='AbortError'){notify(e.message);$('exportNote').textContent=e.message;}}finally{exportController=null;$('exportPng').disabled=false;$('exportSvg').disabled=false;}
}

$('generateAnalysis').onclick=()=>generateAnalysis();$('generateCurrent').onclick=()=>{closePanels();$('sitePanel').hidden=false;if(!state.siteConfirmed)$('searchInput').focus();};
$('cancelAnalysis').onclick=()=>analysisController?.abort();
$('clearAnalysis').onclick=()=>{if(!state.analysis||!confirm('清除当前自动分析及其微调？清除后可撤销。'))return;analysisController?.abort();++analysisSerial;checkpoint();state.analysis=null;sync();save();scheduleAnalysis();};
$('exportPng').onclick=()=>exportAnalysis('png');$('exportSvg').onclick=()=>exportAnalysis('svg');
function closePanels(){document.querySelectorAll('.floating-panel').forEach(p=>p.hidden=true);document.querySelectorAll('[data-panel]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-expanded','false');});}
document.querySelectorAll('[data-panel]').forEach(button=>{button.setAttribute('aria-expanded','false');button.onclick=()=>{const panel=$(button.dataset.panel),open=panel.hidden;closePanels();panel.hidden=!open;button.classList.toggle('active',open);button.setAttribute('aria-expanded',String(open));};});
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=closePanels);
$('closeProperties').onclick=()=>{stopTool();sync();};

function featureById(id){return id==='site'?state.analysis?.site:state.analysis?.features.find(f=>f.id===id);}
function selectFeature(id){stopTool();const f=featureById(id);if(!f)return;selectedFeature=id;sync();$('featureName').value=f.name;$('featureRadius').value=f.radius??0;$('radiusField').hidden=f.kind!=='region';$('hideFeature').hidden=id==='site';$('featureNote').textContent=f.kind==='region'?'默认只标地点。半径为 0 不画圈；可手动增加示意圈，不代表真实边界。':'拖动文字调整位置，地理定位点保持原位。';}
function mutateFeature(change){const f=featureById(selectedFeature);if(!f)return;checkpoint();change(f);sync();save();}
$('featureName').onchange=()=>{const name=$('featureName').value.trim();if(!name){$('featureName').value=featureById(selectedFeature)?.name||'';return;}mutateFeature(f=>{f.name=name;if(selectedFeature==='site')state.name=name;});};
$('featureRadius').onchange=()=>{const radius=Number($('featureRadius').value);if(!Number.isFinite(radius)||(radius!==0&&radius<100)||radius>10000){notify('示意半径为 0（不画圈）或 100–10000 米');$('featureRadius').value=featureById(selectedFeature)?.radius||1000;return;}mutateFeature(f=>{if(f.kind==='region'){f.radius=radius;f.schematic=radius>0;}});};
$('resetLabel').onclick=()=>mutateFeature(f=>{delete f.labelPoint;});
$('hideFeature').onclick=()=>{if(selectedFeature==='site')return;mutateFeature(f=>{f.visible=false;});selectedFeature=null;sync();};
$('ringDistances').onchange=()=>{const values=$('ringDistances').value.split(/[,，\s]+/).filter(Boolean).map(Number);if(!values.length||values.length>8||values.some(n=>!Number.isFinite(n)||n<=0||n>100)){notify('请输入 1–8 个距离，每个大于 0 且不超过 100 km');$('ringDistances').value=(state.analysis?.ringDistances||[3,5,10,20]).join(', ');return;}if(!state.analysis)return;checkpoint();state.analysis.ringDistances=[...new Set(values)].sort((a,b)=>a-b);sync();save();};
const overlay=$('analysisOverlay');
overlay.addEventListener('pointerdown',event=>{
 if(tool!=='select'||editor||!online||event.button!==0)return;
 const shape=event.target.closest('[data-shape]');if(shape){event.preventDefault();event.stopPropagation();selectShape(shape.dataset.shape);return;}
 const node=event.target.closest('[data-feature]');if(!node)return;
 event.preventDefault();event.stopPropagation();
 const id=node.dataset.feature,x=Number(node.dataset.labelX),y=Number(node.dataset.labelY),box=node.querySelector('rect');
 selectFeature(id);const f=featureById(id);
 labelDrag={id,pointer:event.pointerId,start:[event.clientX,event.clientY],origin:[x,y],width:Number(box.getAttribute('width')),before:geoSnapshot(),old:f.labelPoint?[...f.labelPoint]:null,moved:false};
 map.setStatus({dragEnable:false,zoomEnable:false});overlay.setPointerCapture(event.pointerId);
});
overlay.addEventListener('pointermove',event=>{
 if(!labelDrag||event.pointerId!==labelDrag.pointer)return;event.preventDefault();event.stopPropagation();const d=labelDrag,dx=event.clientX-d.start[0],dy=event.clientY-d.start[1];if(Math.hypot(dx,dy)<3&&!d.moved)return;d.moved=true;
 const x=Math.max(0,Math.min(1000-d.width,d.origin[0]+dx*1000/frame.w)),y=Math.max(0,Math.min(1000*frame.h/frame.w-27,d.origin[1]+dy*1000/frame.w));
 featureById(d.id).labelPoint=coords(map.containerToLngLat(new AM.Pixel(frame.x+x*frame.w/1000,frame.y+y*frame.w/1000)));scheduleAnalysis();
});
function finishLabelDrag(cancel=false){if(!labelDrag)return;const d=labelDrag;labelDrag=null;const f=featureById(d.id);if(cancel){if(d.old)f.labelPoint=d.old;else delete f.labelPoint;}else if(d.moved){checkpoint(d.before);save();}if(overlay.hasPointerCapture(d.pointer))overlay.releasePointerCapture(d.pointer);map.setStatus({dragEnable:true,zoomEnable:true});sync();}
overlay.addEventListener('pointerup',event=>{if(labelDrag){event.stopPropagation();finishLabelDrag();}});
overlay.addEventListener('pointercancel',()=>finishLabelDrag(true));
overlay.addEventListener('lostpointercapture',()=>{if(labelDrag)finishLabelDrag(true);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){finishLabelDrag(true);closePanels();sync();}});
async function initialize(){
 if(!state.siteConfirmed){$('sitePanel').hidden=false;$('searchInput').focus();}
 await connect();
}
sync();syncStyle();loadBasemapPreview();initialize();
