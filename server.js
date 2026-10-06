const express=require("express");
const app=express(); const PORT=process.env.PORT||10000;
app.use(express.text({type:"*/*",limit:"64kb"}));
const UPSTREAM=process.env.UPSTREAM_URL||"https://avalanche-signal-bridge-4r0stw.v2.appdeploy.ai/api/tv/a8f4c1e7b62d49c3b1e0d7f6";
app.get("/",(_q,r)=>r.json({ok:true,service:"Avalanche Signal Bridge Relay"}));
app.get("/health",(_q,r)=>r.json({ok:true,status:"healthy"}));
app.get("/api/tv/a8f4c1e7b62d49c3b1e0d7f6",(_q,r)=>r.json({ok:true,endpoint:"tradingview-webhook-relay",method:"POST"}));
app.post("/api/tv/a8f4c1e7b62d49c3b1e0d7f6",async(q,r)=>{
 const body=typeof q.body==="string"?q.body:JSON.stringify(q.body??"");
 console.log(JSON.stringify({event:"tradingview_webhook_received",at:new Date().toISOString(),contentType:q.get("content-type")||null,bytes:Buffer.byteLength(body)}));
 try{
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),2200);
  const u=await fetch(UPSTREAM,{method:"POST",headers:{"content-type":q.get("content-type")||"text/plain; charset=utf-8","x-avalanche-relay":"render"},body,signal:c.signal}).finally(()=>clearTimeout(t));
  const x=await u.text(); console.log(JSON.stringify({event:"upstream_response",status:u.status}));
  r.status(u.status); const ct=u.headers.get("content-type"); if(ct)r.set("content-type",ct); r.send(x);
 }catch(e){console.error(JSON.stringify({event:"relay_error",error:e?.name,message:e?.message})); r.status(502).json({ok:false,error:"upstream_unreachable"});}
});
app.use((_q,r)=>r.status(404).json({ok:false,error:"not_found"}));
app.listen(PORT,"0.0.0.0",()=>console.log(`Avalanche relay listening on ${PORT}`));
