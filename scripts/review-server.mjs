import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openWorkspace, DEFAULT_REVIEW } from './review-workspace.mjs';

const assets = {
  '/': ['review-ui/index.html','text/html; charset=utf-8'],
  '/client.js': ['review-ui/client.js','text/javascript; charset=utf-8'],
  '/style.css': ['review-ui/style.css','text/css; charset=utf-8'],
  '/review-fields.mjs': ['review-fields.mjs','text/javascript; charset=utf-8'],
};
export async function startReviewServer({directory=DEFAULT_REVIEW,port=4319}={}) {
  const workspace=await openWorkspace(directory);
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    try {
      const origin=`http://127.0.0.1:${server.address().port}`;
      if(req.headers.host!==new URL(origin).host || req.headers['sec-fetch-site']==='cross-site')return reply(403,{error:'Use the local review URL'});
      const url=new URL(req.url,origin),path=url.pathname;
      if(req.method==='GET'){
        if(assets[path]){const [file,type]=assets[path];res.writeHead(200,{'Content-Type':type});return res.end(await readFile(new URL(file,import.meta.url)));}
        if(path==='/api/session')return reply(200,workspace.overview());
        if(path.startsWith('/api/case/'))return reply(200,workspace.publicCase(decodeURIComponent(path.slice(10))));
        if(path==='/api/export'){
          res.setHeader('Content-Disposition','attachment; filename="human-calibration-review.json"');
          return reply(200,workspace.exportReview());
        }
        if(path==='/favicon.ico'){res.writeHead(204);return res.end();}
        return reply(404,{error:'Not found'});
      }
      if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
      if(req.headers.origin!==origin || !req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'Review writes require a same-origin JSON request'});
      let bytes=0;const chunks=[];
      for await(const chunk of req){bytes+=chunk.length;if(bytes>262144){reply(413,{error:'Review is too large'});req.destroy();return;}chunks.push(chunk);}
      let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'Invalid JSON'});}
      if(path==='/api/profile')return reply(200,await workspace.mutate('profile',null,value));
      const match=path.match(/^\/api\/case\/([^/]+)\/(draft|blind|final)$/);
      if(!match)return reply(404,{error:'Not found'});
      return reply(200,await workspace.mutate(match[2],decodeURIComponent(match[1]),value));
    }catch(error){if(!res.headersSent)reply(error.status ?? 400,{error:error.message});else res.end();}
  });
  server.requestTimeout=15000;
  try {await new Promise((yes,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',yes);});}
  catch(error){await workspace.close();throw error;}
  return {server,workspace,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{
    await new Promise((yes,no)=>{server.close(e=>e?no(e):yes());server.closeIdleConnections?.();});await workspace.close();
  }};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
  const app=await startReviewServer({directory:option('--workspace',DEFAULT_REVIEW),port:Number(option('--port','4319'))});
  console.log(`Address review is ready at ${app.url}\nPrivate workspace: ${app.workspace.directory}`);
  let stopping=false;for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,async()=>{if(stopping)return;stopping=true;await app.close();process.exit(0);});
}
