import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './helpers/workbench-harness.mjs';
import {renderSatelliteOverlay} from '../dist/scene.js';

test('搜索金华附近小学、平移并圈地不把参照地点写入项目名；生成和备份使用独立名称',async()=>{
 const h=harness(null);await h.boot();h.run("chooseResult({name:'附近实验小学',location:[119.64,29.08]})");assert.equal(h.state().name,'未命名场地');assert.equal(h.get('siteNameInput').value,'');
 h.run('map.setZoomAndCenter(16,[119.645,29.082]);');h.get('boundaryRect').click();h.context.drawn={getBounds:()=>({getSouthWest:()=>[119.644,29.081],getNorthEast:()=>[119.646,29.083]}),setMap(){}};h.run('mouse.draw(drawn)');assert.equal(h.state().name,'未命名场地');
 h.get('siteNameInput').value='金华住宅项目';h.get('siteNameInput').onchange();h.get('confirmSite').click();assert.equal(h.state().siteConfirmed,true);
 h.run("chooseResult({name:'另一个参照学校',location:[119.645,29.082]})");assert.equal(h.state().name,'金华住宅项目');
 let body;const oldFetch=h.context.fetch;h.context.fetch=async(url,opts)=>{if(url!=='/api/location-analysis')return oldFetch(url,opts);body=JSON.parse(opts.body);return{ok:true,json:async()=>({...h.fixture.state.analysis,city:'金华市',site:{name:body.name,point:[119.645,29.082],sample:false},boundary:body.boundary,bounds:body.bounds,features:[],districts:[]})};};
 await h.get('generateAnalysis').click();assert.equal(body.name,'金华住宅项目');assert.equal(h.state().analysis.site.name,'金华住宅项目');
 const svg=renderSatelliteOverlay(h.state(),body.bounds);assert.ok(svg.includes('金华住宅项目'));assert.ok(!svg.includes('附近实验小学'));assert.ok(!svg.includes('另一个参照学校'));
 h.get('saveProject').click();const backup=JSON.parse(await h.downloads.at(-1).blob.text());assert.equal(backup.state.name,'金华住宅项目');assert.equal(backup.state.analysis.site.name,'金华住宅项目');
});

test('已有误命名项目可直接改名，标注、属性和备份同步；重新搜索和圈地不覆盖，撤销可恢复',async()=>{
 const h=harness();await h.boot();const oldName=h.state().name;
 h.get('siteNameInput').value='金华设计地块';h.get('siteNameInput').onchange();assert.equal(h.state().analysis.site.name,'金华设计地块');h.run("selectFeature('site')");assert.equal(h.get('featureName').value,'金华设计地块');
 h.get('undoBtn').click();assert.equal(h.state().name,oldName);assert.equal(h.state().analysis.site.name,oldName);h.get('redoBtn').click();
 h.run("chooseResult({name:'附近小学',location:[120.032,30.365]})");h.get('boundaryRect').click();h.context.drawn={getBounds:()=>({getSouthWest:()=>[120.031,30.364],getNorthEast:()=>[120.034,30.367]}),setMap(){}};h.run('mouse.draw(drawn)');assert.equal(h.state().name,'金华设计地块');
 h.get('siteNameInput').value=' ';h.get('siteNameInput').onchange();assert.equal(h.state().name,'金华设计地块');assert.equal(h.get('siteNameInput').value,'金华设计地块');
});
