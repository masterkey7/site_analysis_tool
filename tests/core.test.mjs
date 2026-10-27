import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateProject,frameRect,viewForBounds,project,unproject,sameBounds,area,cleanPath} from '../dist/core.js';
const wrap=state=>({app:'site-atlas',version:2,state});
test('场地与出图范围独立，保存和导入不会混用坐标或包含凭证',()=>{
 const s=initialState();s.boundary=[[120.23,30.23],[120.231,30.23],[120.231,30.231],[120.23,30.231]];
 const boundary=structuredClone(s.boundary);s.output={sw:[120,30],ne:[120.5,30.4]};s.view={center:[120.2,30.2],zoom:10};s.mode='satellite';s.key='do-not-export';
 const restored=validateProject(JSON.parse(JSON.stringify(wrap(s))));assert.deepEqual(restored.boundary,boundary);assert.deepEqual(restored.output,s.output);assert.equal(restored.key,undefined);
 assert.throws(()=>validateProject(wrap({...s,coordinateSystem:'WGS84'})),/WGS84/);
});
test('每种常用画幅完整放入可见区，尺寸与比例匹配',()=>{
 for(const [w,h] of [[1100,740],[520,510],[390,500]])for(const ratio of [4/3,16/9,1]){const f=frameRect(w,h,ratio);assert.ok(f.x>0&&f.y>0&&f.x+f.w<w&&f.y+f.h<h);assert.ok(Math.abs(f.w/f.h-ratio)<1e-10);}
});
test('已保存地理范围在不同窗口大小下精确恢复，包含出图框偏移',()=>{
 const center=project([120.23,30.23]),dx=.001,dy=dx*3/4;const bounds={sw:unproject([center[0]-dx/2,center[1]+dy/2]),ne:unproject([center[0]+dx/2,center[1]-dy/2])};
 for(const [w,h] of [[1100,740],[520,510],[390,500]]){const frame=frameRect(w,h,4/3),view=viewForBounds(bounds,frame,w,h),c=project(view.center),scale=256*2**view.zoom;const coordinate=(x,y)=>unproject([c[0]+(x-w/2)/scale,c[1]+(y-h/2)/scale]);const recovered={sw:coordinate(frame.x,frame.y+frame.h),ne:coordinate(frame.x+frame.w,frame.y)};assert.ok(sameBounds(recovered,bounds));}
});
test('非法备份、过大图像、异常样式被拒绝',()=>{
 const s=initialState();assert.throws(()=>validateProject(wrap({...s,boundary:[[NaN,30],[120,30],[120,31]]})),/边界/);
 assert.throws(()=>validateProject(wrap({...s,width:8000,height:8000,ratio:'custom'})),/尺寸/);
 assert.throws(()=>validateProject(wrap({...s,output:{sw:[121,31],ne:[120,30]}})),/范围/);
 assert.throws(()=>validateProject(wrap({...s,shapes:[{id:'test',type:'line',points:[[120,30],[121,31]],style:{color:'url(evil)',width:4,dash:'solid',opacity:.2}}]})),/样式/);
});
test('虚线和区域透明度在项目往返中保留，坐标重复点被剔除',()=>{
 const s=initialState();s.shapes=[{id:'a',type:'polyline',points:[[120,30],[120.1,30.1]],style:{color:'#c75b40',width:4,dash:'dashed',opacity:.2}}];assert.deepEqual(validateProject(wrap(s)).shapes,s.shapes);
 assert.equal(cleanPath([[120,30],[120,30],[120.1,30.1]]).length,2);assert.ok(area([[120,30],[120.001,30],[120.001,30.001],[120,30.001]])>10000);
});
