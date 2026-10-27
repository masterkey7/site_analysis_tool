import http from 'node:http';
import {createBasemapService} from './basemap-service.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {analyze,createQuery,validateInput} from './analysis.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png'};
const publicFiles = new Set(['png-export.js','project-storage.js','satellite-export.js','html2canvas.min.js','basemap-gray-water.png','basemap-gray-roads.png','basemap-gray-buildings.png','basemap-gray-green.png','basemap-full-light.png','basemap-full-moss.png','basemap-full-dark.png','workbench.css','scene.js','hangzhou-sample.json','basemap-dark-water.png','basemap-dark-roads.png','basemap-dark-buildings.png','basemap-dark-green.png','index.html','app.js','core.js','analysis-data.js','analysis-svg.js','basemap.js','hangzhou-basemap.json','basemap-meta.json','basemap-water.png','basemap-roads.png','basemap-buildings.png','basemap-green.png','base.css','style.css','settings.html','settings.js']);
const proxyPaths = new Set(['/v4/map/styles','/v3/assistant/inputtips','/v3/place/text','/v3/place/detail','/v3/place/around','/v3/place/polygon','/v3/config/district','/v3/geocode/regeo','/v3/geocode/geo']);
export function createApp({configDir = path.join(here,'.local'),fetcher = fetch} = {}) {
  const basemaps=createBasemapService({root:here,fetcher});
  const token = randomBytes(24).toString('hex');
  const configPath = path.join(configDir,'amap.json');
  let serial = Promise.resolve();
  let proxyResult = 'untested';
  let analysisBusy=false,queryClient=null,credentialIdentity='';
  const readConfig = async () => {try {return JSON.parse(await fs.readFile(configPath,'utf8'));} catch {return null;}};
  const json = (res,status,data) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  return http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    const port=req.socket.localPort;
    const hosts = [`127.0.0.1:${port}`,`localhost:${port}`];
    if (!hosts.includes(req.headers.host)) return json(res,403,{error:'仅允许本机访问'});
    const origin = `http://${req.headers.host}`;
    if ((req.headers.origin && req.headers.origin!==origin) || req.headers['sec-fetch-site']==='cross-site') return json(res,403,{error:'仅允许本机页面访问'});
    let url;
    try {url=new URL(req.url,origin);} catch {return json(res,400,{error:'请求无效'});}
    try {
      if(url.pathname==='/api/basemap'&&req.method==='GET'){
        try{const bounds={sw:[Number(url.searchParams.get('west')),Number(url.searchParams.get('south'))],ne:[Number(url.searchParams.get('east')),Number(url.searchParams.get('north'))]};return json(res,200,await basemaps.prepare(bounds));}catch(e){return json(res,502,{error:e.message});}
      }
      if(url.pathname==='/api/basemap-layer'&&req.method==='GET'){
        try{const png=url.searchParams.get('format')==='png',args=[url.searchParams.get('id'),url.searchParams.get('mode'),url.searchParams.get('layer')];const asset=png?await basemaps.rasterLayer(...args):basemaps.layer(...args);res.writeHead(200,{'Content-Type':png?'image/png':'image/svg+xml','Cache-Control':'private, max-age=3600'});return res.end(asset);}catch(e){return json(res,404,{error:e.message});}
      }
      if (url.pathname==='/api/status' && req.method==='GET') {
        const cfg=await readConfig();
        return json(res,200,{configured:!!cfg,proxyResult});
      }
      if (url.pathname==='/api/bootstrap' && req.method==='GET') {
        const cfg=await readConfig();
        return json(res,200,{configured:!!cfg,key:cfg?.key||'',csrf:token});
      }
      if(url.pathname==='/api/location-analysis'&&req.method==='POST'){
        if(req.headers.origin!==origin||req.headers['x-atlas-token']!==token)return json(res,403,{error:'页面已过期，请刷新后再试'});
        if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'请求格式无效'});
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>80000)return json(res,413,{error:'场地边界过大'});}
        let input;try{input=JSON.parse(raw);validateInput(input);}catch(e){return json(res,400,{error:e.message});}
        if(analysisBusy)return json(res,429,{error:'正在生成分析图，请等待当前任务完成'});
        const cfg=await readConfig();if(!cfg)return json(res,503,{error:'请先配置地图凭证'});
        if(analysisBusy)return json(res,429,{error:'正在生成分析图，请等待当前任务完成'});
        const identity=cfg.key+cfg.securityCode;if(identity!==credentialIdentity){queryClient=createQuery(fetcher,cfg);credentialIdentity=identity;}
        analysisBusy=true;const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort();};res.on('close',cancel);
        try{const data=await analyze(input,(path,params)=>queryClient(path,params,{signal:controller.signal}));if(!controller.signal.aborted)return json(res,200,data);}catch(e){if(!controller.signal.aborted)return json(res,502,{error:e.message});}finally{res.off('close',cancel);analysisBusy=false;}
      }
      if (url.pathname==='/api/config' && ['POST','DELETE'].includes(req.method)) {
        if(req.headers.origin!==origin || req.headers['x-atlas-token']!==token) return json(res,403,{error:'页面已过期，请刷新后再试'});
        if(req.method==='DELETE') {
          serial=serial.catch(()=>{}).then(()=>fs.rm(configPath,{force:true}));await serial;proxyResult='untested';return json(res,200,{configured:false});
        }
        if(!req.headers['content-type']?.startsWith('application/json')) return json(res,415,{error:'需要 JSON 配置'});
        let raw=''; for await(const chunk of req) {raw+=chunk;if(Buffer.byteLength(raw)>4096) return json(res,413,{error:'配置过长'});}
        let cfg; try {cfg=JSON.parse(raw);} catch {return json(res,400,{error:'配置格式无效'});}
        const key=String(cfg.key||'').trim(),securityCode=String(cfg.securityCode||'').trim();
        if(!/^[a-fA-F0-9]{32}$/.test(key)||!/^[a-fA-F0-9]{32}$/.test(securityCode)) return json(res,400,{error:'请检查 Key 与安全密钥，均应为 32 位字母数字串（0–9、a–f）'});
        serial=serial.catch(()=>{}).then(async()=>{await fs.mkdir(configDir,{recursive:true});await fs.writeFile(configPath+'.tmp',JSON.stringify({key,securityCode}),{mode:0o600});await fs.rename(configPath+'.tmp',configPath);});
        await serial;proxyResult='untested';return json(res,200,{configured:true});
      }
      if(url.pathname.startsWith('/_AMapService/')) {
        const suffix=url.pathname.slice('/_AMapService'.length);
        if(req.method!=='GET'||!proxyPaths.has(suffix)) return json(res,403,{error:'此地图接口未启用'});
        const cfg=await readConfig();if(!cfg) return json(res,503,{error:'请先配置地图凭证'});
        const remote=new URL(suffix,suffix==='/v4/map/styles'?'https://webapi.amap.com':'https://restapi.amap.com');
        remote.search=url.search;remote.searchParams.set('key',cfg.key);remote.searchParams.set('jscode',cfg.securityCode);
        try {
          const upstream=await fetcher(remote,{redirect:'error',signal:AbortSignal.timeout(18000)});
          const contentType=upstream.headers.get('content-type')||'application/json; charset=utf-8';
          const bytes=Buffer.from(await upstream.arrayBuffer());
          const isText=/json|javascript|text|xml/i.test(contentType);
          const body=isText?bytes.toString('utf8'):null;
          const knownError=body?.match(/INVALID_USER_(?:KEY|SCODE|DOMAIN)|USERKEY_PLAT_NOMATCH|SERVICE_NOT_AVAILABLE|INSUFFICIENT_PRIVILEGES|USER_DAILY_QUERY_OVER_LIMIT/);
          proxyResult=knownError?knownError[0]:(upstream.ok?'responding':'upstream_error');
          res.writeHead(upstream.status,{'Content-Type':contentType,'Cache-Control':'no-store'});
          // Never reflect a security credential, even if an upstream error echoes it.
          res.end(isText?body.replaceAll(cfg.securityCode,'[redacted]'):bytes);
        } catch {proxyResult='network_error';json(res,502,{error:'地图服务连接超时，请稍后重试'});}
        return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'不支持此请求'});
      const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(!publicFiles.has(name))return json(res,404,{error:'页面不存在'});
      const body=await fs.readFile(path.join(here,'dist',name));
      res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:body);
    } catch {json(res,500,{error:'本地服务操作失败，请检查目录是否可写'});}
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.ATLAS_PORT||4173);
  createApp().listen(port,'127.0.0.1',()=>console.log(`Site Atlas local: http://127.0.0.1:${port}/`));
}
