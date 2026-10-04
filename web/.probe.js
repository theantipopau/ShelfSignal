const http=require('http'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const html=fs.readFileSync('web/index.html');
const s=http.createServer((q,r)=>{r.setHeader('content-type','text/html; charset=utf-8');r.end(html);});
s.listen(0,'127.0.0.1',()=>{
  const port=s.address().port;
  const url=`http://127.0.0.1:${port}/index.html#/household`;
  const tries=[
    ['--headless=new'],
    ['--headless'],
    ['--headless=old'],
    ['--headless','--disable-gpu','--no-sandbox','--no-first-run','--disable-extensions','--no-proxy-server'],
  ];
  let i=0;
  const run=()=>{
    if(i>=tries.length){s.close();process.exit(1);}
    const flags=tries[i++];
    const udd=path.join(os.tmpdir(),'ss-probe-'+i);
    const child=cp.spawn(CHROME,[...flags,'--user-data-dir='+udd,'--dump-dom',url],{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    const t=setTimeout(()=>{try{child.kill()}catch(e){}},20000);
    child.stdout.on('data',d=>out+=d);
    child.stderr.on('data',d=>err+=d);
    child.on('exit',c=>{clearTimeout(t);console.log(JSON.stringify(flags),'exit',c,'bytes',out.length,'err:',err.split(/\r?\n/).filter(Boolean).slice(0,3).join(' | ').slice(0,300));if(out.length>500){fs.writeFileSync('web/.verify/household.html',out);s.close();process.exit(0);}run();});
  };
  run();
});
