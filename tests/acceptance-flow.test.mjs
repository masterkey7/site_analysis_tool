import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/workbench-harness.mjs';

test('控制器：搜索良渚后矩形与多边形圈选、无效范围拒绝及撤销重做',async()=>{
 const h=harness();await h.boot();h.get('searchInput').value='良渚文化艺术中心';await h.run('searchPlaces(true)');await h.get('searchResults').children[0].click();assert.equal(h.run('map.getZoom()'),16);
 h.get('boundaryRect').click();assert.equal(h.run('mouse.kind'),'rectangle');
 h.context.drawn={getBounds:()=>({getSouthWest:()=>[120.031,30.364],getNorthEast:()=>[120.034,30.367]}),setMap(){}};h.run('mouse.draw(drawn)');const rectangle=h.state().boundary;assert.equal(rectangle.length,4);assert.equal(h.state().name,'良渚文化艺术中心');assert.equal(h.run('analysisFresh()'),false);
 h.get('undoBtn').click();assert.deepEqual(h.state().boundary,h.fixture.state.boundary);h.get('redoBtn').click();assert.deepEqual(h.state().boundary,rectangle);
 h.get('boundaryPolygon').click();h.context.drawn=new h.Overlay({path:[[120.031,30.364],[120.034,30.364],[120.032,30.367]]});h.run('mouse.draw(drawn)');assert.equal(h.state().boundary.length,3);
 const before=h.state().boundary;h.get('boundaryRect').click();h.context.drawn={getBounds:()=>({getSouthWest:()=>[120,30],getNorthEast:()=>[120,30]}),setMap(){}};h.run('mouse.draw(drawn)');assert.deepEqual(h.state().boundary,before);assert.match(h.get('toast').textContent,/范围太小/);
});

test('控制器：标签拖动只移动文字，取消恢复，撤销重做与保存恢复',async()=>{
 const h=harness();await h.boot();const f=h.state().analysis.features[1];await h.drag(f.id);const moved=h.state().analysis.features[1];assert.deepEqual(moved.point,f.point);assert.notDeepEqual(moved.labelPoint,f.labelPoint);
 h.get('undoBtn').click();assert.deepEqual(h.state().analysis.features[1],f);h.get('redoBtn').click();assert.deepEqual(h.state().analysis.features[1],moved);
 await h.drag(f.id,{dx:120,cancel:true});assert.deepEqual(h.state().analysis.features[1],moved);
 assert.equal(h.run('map.status.dragEnable'),true);assert.equal(h.run('map.status.zoomEnable'),true);
 h.flushSave();const reload=harness(JSON.parse(h.storage.get('site-atlas-amap-v2')));await reload.boot();assert.deepEqual(reload.state().analysis.features[1],moved);
});

test('控制器：虚线箭头、编辑节点、删除及撤销，文字取消不会误保存',async()=>{
 const h=harness();await h.boot();h.get('lineDash').value='dashed';h.get('lineDash').onchange();h.run("startTool('arrow')");h.context.drawn=new h.Overlay({path:[[120.03,30.36],[120.04,30.37]]});h.run('mouse.draw(drawn)');const shape=h.state().shapes.at(-1);assert.equal(shape.style.dash,'dashed');
 h.context.id=shape.id;h.run('selectShape(id)');h.run('editor.overlay.setPath([[120.03,30.36],[120.05,30.38]])');h.get('finishEditing').click();assert.deepEqual(h.state().shapes.at(-1).points.at(-1),[120.05,30.38]);
 h.run('selectShape(id)');h.get('deleteShape').click();assert.ok(!h.state().shapes.some(s=>s.id===shape.id));h.get('undoBtn').click();assert.equal(h.state().shapes.at(-1).id,shape.id);
 h.run("startTool('text');map.emit('click',{lnglat:[120.03,30.36]})");h.get('textInput').value='保留文字';await h.get('textDialog').close('ok');const count=h.state().shapes.length;
 h.run("startTool('text');map.emit('click',{lnglat:[120.04,30.36]})");h.get('textInput').value='按 Esc 应取消';await h.get('textDialog').close();assert.equal(h.state().shapes.length,count);
});

test('控制器：重开保留当前视图，保存取景只作为恢复书签',async()=>{
 const h=harness();await h.boot();h.run('map.setZoomAndCenter(14,[120.031,30.365]);syncView();');h.flushSave();const saved=JSON.parse(h.storage.get('site-atlas-amap-v2'));assert.notEqual(saved.state.view.zoom,10);
 const reload=harness(saved);await reload.boot();assert.deepEqual(JSON.parse(reload.run('JSON.stringify(state.view)')),saved.state.view);assert.equal(reload.run('map.getZoom()'),14);
 reload.get('restoreView').click();assert.notEqual(reload.run('map.getZoom()'),14);
});

test('控制器：项目备份真实 JSON 内容、导入完整恢复、拒绝损坏文件、不继承旧搜索名称',async()=>{
 const h=harness();await h.boot();h.get('saveProject').click();const file=h.downloads.at(-1);assert.match(file.name,/良渚/);const backup=JSON.parse(await file.blob.text());assert.ok(!JSON.stringify(backup).includes('test-fixture-only'));
 h.run("chooseResult({name:'附近小学',location:[120.03,30.36]});");const imported={...backup,state:{...backup.state,name:'导入的良渚项目'}};await h.get('projectFile').onchange({target:{files:[{size:100,text:async()=>JSON.stringify(imported)}],value:'file'}});assert.equal(h.state().name,imported.state.name);assert.equal(h.get('searchInput').value,'');
 const before=h.state();await h.get('projectFile').onchange({target:{files:[{size:100,text:async()=>'{bad'}],value:'file'}});assert.deepEqual(h.state(),before);
});

test('控制器：图层隐藏、半径、距离圈校验、改名与撤销可执行',async()=>{
 const h=harness();await h.boot();const f=h.state().analysis.features.find(f=>f.kind==='region');h.context.id=f.id;h.run('selectFeature(id)');h.get('featureName').value='新的片区名称';h.get('featureName').onchange();assert.equal(h.state().analysis.features.find(f=>f.id===h.context.id).name,'新的片区名称');
 h.get('featureRadius').value='1800';h.get('featureRadius').onchange();assert.equal(h.state().analysis.features.find(f=>f.id===h.context.id).radius,1800);h.get('featureRadius').value='-1';h.get('featureRadius').onchange();assert.equal(h.state().analysis.features.find(f=>f.id===h.context.id).radius,1800);h.get('featureRadius').value='0';h.get('featureRadius').onchange();assert.equal(h.state().analysis.features.find(f=>f.id===h.context.id).radius,0);assert.equal(h.state().analysis.features.find(f=>f.id===h.context.id).schematic,false);
 h.get('ringDistances').value='8, 2, 2';h.get('ringDistances').onchange();assert.deepEqual(h.state().analysis.ringDistances,[2,8]);h.get('ringDistances').value='-1';h.get('ringDistances').onchange();assert.deepEqual(h.state().analysis.ringDistances,[2,8]);
 h.get('hideFeature').click();assert.equal(h.state().analysis.features.find(f=>f.id===h.context.id).visible,false);h.get('undoBtn').click();assert.equal(h.state().analysis.features.find(f=>f.id===h.context.id).visible,true);
});

test('控制器：当前取景锁定到 SVG 下载内容，排除工具和标题，场地改变阻止旧分析出图',async()=>{
 const h=harness();await h.boot();h.run('map.setZoomAndCenter(12,[120.22,30.25]);syncView();');
 // Actual SVG composition and Blob/download binding; the image fixture replaces
 // only asset loading. This does not claim a real browser file download.
 h.run("embeddedImages=async()=>({full:'data:image/png;base64,iVBORw0KGgo='});");h.get('exportBtn').click();assert.equal(h.get('exportSvg').disabled,false);
 h.run("state.name='导出窗口打开后的新名称';map.setZoomAndCenter(13,[120.25,30.26]);");await h.get('exportSvg').click();const d=h.downloads.at(-1),svg=await d.blob.text();assert.match(d.name,/良渚/);assert.match(svg,/width="4800" height="3600"/);assert.match(svg,/手动标注测试/);assert.match(svg,/stroke-dasharray="8 6"/);assert.ok(!svg.includes('导出窗口打开后的新名称'));assert.ok(!svg.includes('HANGZHOU /'));assert.ok(!svg.includes('分析：高德地点'));assert.ok(!svg.includes('data-feature='));assert.ok(!svg.includes('href="/'));assert.ok(!svg.includes('searchForm'));
 h.run('state.boundary[0][0]+=.001;');h.get('exportBtn').click();assert.equal(h.get('exportSvg').disabled,true);assert.equal(h.run('exportSnapshot'),null);
});

test('控制器：生成使用实际边界和当前取景，查询中更改场地不会应用旧结果',async()=>{
 const h=harness();await h.boot();h.get('confirmSite').click();let resolve;let request;const oldFetch=h.context.fetch;h.context.fetch=async(url,opts)=>url==='/api/location-analysis'?(request=JSON.parse(opts.body),new Promise(r=>{resolve=r;})):oldFetch(url,opts);
 const pending=h.get('generateAnalysis').click();for(let i=0;i<8&&!resolve;i++)await Promise.resolve();assert.ok(resolve);assert.equal(request.siteConfirmed,true);assert.deepEqual(request.boundary,h.fixture.state.boundary);assert.deepEqual(request.bounds,JSON.parse(h.run('JSON.stringify(frameBounds())')));assert.equal(h.get('generateAnalysis').disabled,true);
 h.run("state.name='查询途中改名';");resolve({ok:true,json:async()=>h.fixture.state.analysis});await pending;assert.match(h.get('toast').textContent,/本次结果未应用/);assert.equal(h.get('generateAnalysis').disabled,false);
 h.context.fetch=async(url,opts)=>url==='/api/location-analysis'?{ok:false,json:async()=>({error:'重要地点查询未成功'})}:oldFetch(url,opts);const before=h.state().analysis;await h.get('generateAnalysis').click();assert.match(h.get('toast').textContent,/查询未成功/);assert.deepEqual(h.state().analysis,before);
});

test('控制器：输出比例、超限尺寸拒绝，保存/恢复取景不改场地',async()=>{
 const h=harness();await h.boot();const boundary=h.state().boundary;h.get('ratio').value='16:9';h.get('ratio').onchange();assert.equal(h.state().height,2700);h.get('ratio').value='1:1';h.get('ratio').onchange();assert.equal(h.state().height,4800);
 h.get('ratio').value='custom';h.get('customWidth').value='8000';h.get('customHeight').value='8000';h.get('ratio').onchange();assert.equal(h.state().ratio,'1:1');assert.match(h.get('toast').textContent,/4000 万/);
 h.get('ratio').value='custom';h.get('customWidth').value='6000';h.get('customHeight').value='3000';h.get('ratio').onchange();assert.equal(h.state().width,6000);assert.equal(h.state().height,3000);
 h.get('captureView').click();const saved=h.state().output;h.run('map.setZoomAndCenter(16,[120.1,30.3]);syncView();');h.get('restoreView').click();assert.deepEqual(h.state().boundary,boundary);assert.ok(h.run('sameBounds(frameBounds(),state.output)'));assert.deepEqual(h.state().output,saved);
});

test('控制器：直线、折线、面绘制与场地边界编辑的提交和无效回退',async()=>{
 const h=harness();await h.boot();for(const kind of ['line','polyline','polygon']){h.context.kind=kind;h.run('startTool(kind)');h.context.drawn=new h.Overlay({path:[[120.03,30.36],[120.04,30.36],[120.04,30.37]]});h.run('mouse.draw(drawn)');const s=h.state().shapes.at(-1);assert.equal(s.type,kind);assert.equal(s.points.length,kind==='line'?2:3);}
 h.get('boundaryEdit').click();h.run('sitePolygon.setPath([[120.03,30.36],[120.04,30.36],[120.04,30.37]])');h.get('boundaryEdit').click();assert.equal(h.state().boundary.length,3);assert.equal(h.run('analysisFresh()'),false);const before=h.state().boundary;
 h.get('boundaryEdit').click();h.run('sitePolygon.setPath([[120.03,30.36],[120.03,30.36],[120.03,30.36]])');h.get('boundaryEdit').click();assert.deepEqual(h.state().boundary,before);assert.match(h.get('toast').textContent,/面积太小/);
});

test('控制器：搜索无结果、服务失败与旧请求晚返回不会混淆当前搜索',async()=>{
 const h=harness();await h.boot();h.get('searchInput').value='未找到地点';h.context.fetch=async()=>({ok:true,json:async()=>({status:'1',pois:[]})});await h.run('searchPlaces(true)');assert.match(h.get('searchResults').children[0].textContent,/没有找到/);
 h.context.fetch=async()=>({ok:true,json:async()=>({status:'0',info:'INVALID_USER_KEY'})});await h.run('searchPlaces(true)');assert.match(h.get('searchResults').children[0].textContent,/Key 无效/);
 let done;h.context.fetch=()=>new Promise(r=>{done=r;});const pending=h.run('searchPlaces(true)');h.get('searchInput').value='新的地点';h.get('searchInput').oninput();done({ok:true,json:async()=>({status:'1',pois:[{name:'过期搜索',location:'120,30'}]})});await pending;assert.ok(!h.get('searchResults').children.some(n=>n.children.some(c=>c.textContent==='过期搜索')));
});

test('控制器：新建空白项目重新打开后仍为空白，不自动换回杭州奥体示例',async()=>{
 const h=harness();await h.boot();h.get('newProject').click();h.flushSave();const reload=harness(JSON.parse(h.storage.get('site-atlas-amap-v2')));let sampleRequested=false;const fetch=reload.context.fetch;reload.context.fetch=async(url,options)=>{if(url==='/hangzhou-sample.json'){sampleRequested=true;return {ok:true,json:async()=>h.fixture.state.analysis};}return fetch(url,options);};await reload.run('initialize()');assert.equal(sampleRequested,false);assert.equal(reload.state().analysis,null);assert.equal(reload.state().shapes.length,0);
});
