import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { materializeWebAppIcons } from './prepare-pages-site.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const iconTarget=path.resolve(root,'icons');
if(path.dirname(iconTarget)!==path.resolve(root))throw Error('Invalid icon output');
await materializeWebAppIcons({outputDir:iconTarget});
const allowTests=process.argv.includes('--test');
const known=['index.html','styles.css','firebase-config.js','service-worker.js','manifest.webmanifest','release.json'];
const server=http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
    const allowed=known.includes(name)||/^(src|icons)\/[a-zA-Z0-9_/.-]+\.(js|css|png)$/.test(name)||allowTests&&/^tests\/browser\/(fixtures|support)\/[a-zA-Z0-9_/.-]+\.(html|js|mjs)$/.test(name);
    if(!allowed||name.split('/').some(p=>p==='..'||p==='.')||name.includes('\\'))throw Error('not found');
    const target=await realpath(path.join(root,name));
    if(!target.startsWith(path.resolve(root)+path.sep))throw Error('not found');
    const body=await readFile(target);
    const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
    res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.PORT||4173);
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`${port} 포트가 사용 중입니다. 기존 실행 창을 확인하세요.`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{const url=`http://127.0.0.1:${port}`;console.log(`Life Manager: ${url}`);if(process.argv.includes('--open')&&process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],()=>{});});
