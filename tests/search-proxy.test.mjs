import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/workbench-harness.mjs';

test('搜索使用本机 JSON 接口：解析高德字符串坐标，行政区建议可继续检索',async()=>{
 const h=harness();await h.boot();const requests=[];
 h.context.fetch=async url=>{requests.push(url);const items=[{name:'良渚',location:[],adcode:'330110'},{name:'良渚(地铁站)',location:'120.041654,30.358992',adcode:'330110'},{name:'坏坐标',location:'x,y'}];return{ok:true,json:async()=>({status:'1',tips:items,pois:items})};};
 h.get('searchInput').value='良渚';await h.run('searchPlaces(false)');assert.equal(h.get('searchResults').children.length,2);assert.match(requests[0],/^\/_AMapService\/v3\/assistant\/inputtips\?/);assert.ok(!requests[0].includes('key='));assert.ok(!requests[0].includes('jscode='));
 h.get('searchResults').children[0].click();for(let i=0;i<8;i++)await Promise.resolve();assert.match(requests[1],/place\/text/);assert.equal(new URL(requests[1],'http://test.invalid').searchParams.get('city'),'330110');assert.equal(h.get('searchResults').children.length,1);
 h.get('searchResults').children[0].click();assert.deepEqual(JSON.parse(h.run('JSON.stringify(map.getCenter())')),[120.041654,30.358992]);assert.equal(h.run('map.getZoom()'),16);
});

test('搜索失败给出具体提示，超时和服务端拒绝不会被吞成无结果',async()=>{
 const h=harness();await h.boot();h.get('searchInput').value='良渚';
 for(const [response,message]of [[{ok:true,json:async()=>({status:'0',info:'CUQPS_HAS_EXCEEDED_THE_LIMIT'})},/搜索过于频繁/],[{ok:false,status:503,json:async()=>({})},/配置地图凭证/],[{ok:true,json:async()=>({status:'1',pois:null})},/格式异常/]]){h.context.fetch=async()=>response;await h.run('searchPlaces(true)');assert.match(h.get('searchResults').children[0].textContent,message);}
 h.context.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};await h.run('searchPlaces(true)');assert.match(h.get('searchResults').children[0].textContent,/查询超时/);
});
