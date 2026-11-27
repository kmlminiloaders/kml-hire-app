import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
const cors = (env) => ({
  "Access-Control-Allow-Origin": env.APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-KML-Key",
  "Access-Control-Max-Age": "86400"
});
const json = (data, status=200, env={}) => new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json",...cors(env)}});
const html = (body,status=200) => new Response(body,{status,headers:{"Content-Type":"text/html;charset=UTF-8","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const aud = n => new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(n)||0);
const now = () => new Date().toISOString();
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,"0")).join("");
// Cloudflare Access verification for the future same-origin management host.
const ACCESS_HOST="app.kmlminiloaders.com.au";
const ACCESS_ISSUER="https://quiet-paper-7c30.cloudflareaccess.com";
const ACCESS_AUD="7d87ccd8a3327cd5bf8e85788ad63121f79fb446470f6f2a0822b5aecc30165a";
function accessBytes(s){if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error("Invalid token");return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0))}
async function verifyAccess(req){
 try{
  const raw=req.headers.get("Cf-Access-Jwt-Assertion")||"";
  if(!raw||raw.length>16384)return false;
  const parts=raw.split(".");if(parts.length!==3)return false;
  const decode=s=>JSON.parse(new TextDecoder().decode(accessBytes(s)));
  const h=decode(parts[0]),p=decode(parts[1]),t=Math.floor(Date.now()/1000);
  if(h.alg!=="RS256"||typeof h.kid!=="string"||p.iss!==ACCESS_ISSUER||!Array.isArray(p.aud)||!p.aud.includes(ACCESS_AUD)||!Number.isFinite(p.exp)||p.exp<=t||!Number.isFinite(p.iat)||p.iat>t+60||(p.nbf!==undefined&&(!Number.isFinite(p.nbf)||p.nbf>t))||typeof p.email!=="string"||!p.email||typeof p.sub!=="string"||!p.sub)return false;
  const res=await fetch(ACCESS_ISSUER+"/cdn-cgi/access/certs",{redirect:"error"});if(!res.ok)return false;
  const {keys}=await res.json();const jwk=keys.find(k=>k.kid===h.kid&&k.kty==="RSA");if(!jwk)return false;
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  return await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,accessBytes(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
 }catch{return false}
}
async function admin(req,env){if(new URL(req.url).hostname===ACCESS_HOST)return verifyAccess(req);const got=req.headers.get("X-KML-Key")||"",want=env.KML_ADMIN_KEY||"";if(!want||got.length!==want.length)return false;let diff=0;for(let i=0;i<got.length;i++)diff|=got.charCodeAt(i)^want.charCodeAt(i);return diff===0;}
async function sendEmail(env,to,subject,htmlBody,textBody,attachments,idem){
 if(!env.RESEND_API_KEY||!to)return false;
 const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json",...(idem?{"Idempotency-Key":idem}:{})},body:JSON.stringify({attachments,from:env.EMAIL_FROM||"KML Mini Loaders <quotes@kmlminiloaders.com.au>",to:[to],subject,html:htmlBody,text:textBody})});
 return r.ok;
}
async function sendSms(env,to,body){
 if(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||!env.TWILIO_PHONE||!to)return false;
 const auth=btoa(env.TWILIO_ACCOUNT_SID+":"+env.TWILIO_AUTH_TOKEN);
 let recipient=String(to).replace(/[^0-9+]/g,"");if(recipient.startsWith("0"))recipient="+61"+recipient.slice(1);else if(recipient.startsWith("61"))recipient="+"+recipient;const form=new URLSearchParams({From:env.TWILIO_PHONE,To:recipient,Body:body});
 const r=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+env.TWILIO_ACCOUNT_SID+"/Messages.json",{method:"POST",headers:{"Authorization":"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},body:form});
 return r.ok;
}
const brandLogo="<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 300 150\" role=\"img\" aria-label=\"Kendenup Mini Loaders\"><path d=\"M8 76 L83 14 L111 38 L150 3 L185 36 L203 22 L292 76\" fill=\"#101719\" stroke=\"#19b7b0\" stroke-width=\"5\"/><path d=\"M60 40 L83 20 L99 37 L83 31 Z M120 35 L150 9 L177 36 L151 25 Z M185 42 L203 28 L224 46 L203 38 Z\" fill=\"white\"/><text x=\"150\" y=\"91\" text-anchor=\"middle\" font-family=\"Georgia,serif\" font-weight=\"bold\" font-size=\"76\" fill=\"#101719\" stroke=\"white\" stroke-width=\"1\">KML</text><text x=\"150\" y=\"118\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-weight=\"bold\" font-size=\"23\" fill=\"#101719\">KENDENUP</text><text x=\"150\" y=\"140\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-weight=\"bold\" font-size=\"19\" fill=\"#087c79\">MINI LOADERS</text></svg>";
function quotePage(q,env){
 const items=JSON.parse(q.items_json||"[]");
 const rows=items.map(x=>'<tr><td>'+esc(x.description)+'</td><td>'+esc(x.quantity||1)+'</td><td>'+aud(x.amount)+'</td></tr>').join("");
 const accepted=q.status==="accepted";
 return html(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101719"><title>KML Quote ${esc(q.quote_number)}</title>
 <style>*{box-sizing:border-box}body{margin:0;background:#101719;color:#f4f7f7;font:16px system-ui;padding:18px}.wrap{max-width:680px;margin:auto}.card{background:#192326;border:1px solid #344447;border-radius:16px;padding:20px;margin:14px 0}.brand{color:#16b7ad;font-weight:800;letter-spacing:1px}.muted{color:#a9b8b8;font-size:13px}h1{font-size:24px;margin:8px 0}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{text-align:left;padding:12px 6px;border-bottom:1px solid #344447}th{color:#a9b8b8}.total{font-size:28px;font-weight:800;color:#16b7ad;text-align:right}.btn{background:#16b7ad;color:#062321;border:0;border-radius:10px;padding:14px 18px;font-size:17px;font-weight:800;width:100%;margin-top:14px}input{width:100%;padding:13px;border-radius:9px;border:1px solid #344447;background:#0d1416;color:white;margin:7px 0 14px}label{font-size:14px;color:#c7d2d2}.success{color:#75d6a5;font-weight:800}</style>
 <div class="wrap"><div class="card"><div style="background:white;border-radius:10px;padding:12px;max-width:270px;margin-bottom:18px">${brandLogo}</div><p class="muted">QUOTE ${esc(q.quote_number)}</p><h1>Hire quote</h1><p>Prepared for <b>${esc(q.customer)}</b></p><p class="muted">Quote date: ${esc(q.created_at.slice(0,10))} · Job date: ${esc(q.job_date||"To be confirmed")}</p><p>${esc(q.description||"Mini loader hire")}</p><p class="muted">${esc(q.location||"")}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total: ${aud(q.total)}</div><p class="muted">GST is not charged unless shown and KML is registered for GST.</p>${q.notes?'<p><b>Notes:</b> '+esc(q.notes)+'</p>':""}${q.terms?'<p><b>Terms:</b><br>'+esc(q.terms).replace(/\n/g,"<br>")+'</p>':""}<p class="muted">Questions? Call ${esc(env.BUSINESS_PHONE||"KML Mini Loaders")}.</p></div>
 <div class="card">${accepted?'<p class="success">✓ QUOTE ACCEPTED</p><p>Thank you, '+esc(q.accepted_by)+'. Your acceptance was recorded on '+esc(q.accepted_at)+'.</p>':q.status==="declined"?'<p>This quote has been declined.</p>':'<h2>Accept this quote</h2><p class="muted">By accepting, you confirm that you agree to the quote and the terms shown above.</p><form id="accept"><label>Your full name</label><input name="name" required maxlength="120" autocomplete="name"><label><input type="checkbox" name="agree" required style="width:auto"> I accept this quote and the terms above.</label><button class="btn">ACCEPT QUOTE</button><p id="msg" class="muted"></p></form>'}</div>
 <p class="muted" style="text-align:center">KML Mini Loaders · Kendenup, Western Australia · ${esc(env.BUSINESS_PHONE||"")}</p></div>
 ${accepted||q.status==="declined"?"":'<script>document.getElementById("accept").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const b=document.querySelector("button");b.disabled=true;b.textContent="Submitting...";try{const r=await fetch("/api/accept/'+q.token+'",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:f.get("name"),agree:f.get("agree")==="on"})});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not submit");location.reload()}catch(x){document.getElementById("msg").textContent=x.message;b.disabled=false;b.textContent="ACCEPT QUOTE"}})</script>'}
 </html>`);
}
async function invoicePDF(i,n){
 const doc=await PDFDocument.create(),page=doc.addPage([595,842]),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),serif=await doc.embedFont(StandardFonts.TimesRomanBold);
 const dark=rgb(.06,.12,.13),teal=rgb(.03,.48,.47),white=rgb(1,1,1),pale=rgb(.92,.96,.96);
 const clean=v=>String(v??"").replace(/[^\x20-\x7E]/g,"?");
 const draw=(v,x,y,size=12,f=font,color=dark,max=510)=>{const t=clean(v);while(size>6&&f.widthOfTextAtSize(t,size)>max)size-=.5;page.drawText(t,{x,y,size,font:f,color});};
 const rect=(x,y,width,height,color)=>page.drawRectangle({x,y,width,height,color});
 const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4):v;
 rect(0,710,595,132,dark);rect(0,710,595,5,teal);
 page.drawSvgPath("M 0 45 L 48 5 L 72 23 L 106 0 L 134 23 L 151 12 L 204 45 Z",{x:35,y:826,color:teal});
 draw("KML",75,759,47,serif,white);draw("KENDENUP MINI LOADERS",35,738,12,bold,white);draw("WET OR DRY HIRE",35,721,9,bold,white);
 draw("INVOICE",365,782,29,bold,white);draw(n,365,751,19,bold,white);
 draw("ABN: "+i.abn,35,688,10);
 rect(35,568,270,103,pale);rect(315,568,245,103,pale);rect(35,647,270,24,teal);rect(315,647,245,24,teal);
 draw("BILL TO",46,655,11,bold,white);draw("INVOICE DETAILS",326,655,11,bold,white);
 draw(i.customer,46,625,15,bold,dark,248);draw(i.email,46,601,11,font,dark,248);
 draw("Issued: "+date(i.date),326,625,11);draw("Due: "+date(i.due),326,605,11);draw("Job date: "+date(i.jobDate),326,585,11);
 rect(35,516,525,28,dark);draw("DESCRIPTION",46,526,11,bold,white);draw("AMOUNT",465,526,11,bold,white);
 rect(35,466,525,50,pale);draw(i.description,46,487,12,bold,dark,375);draw(aud(i.total),440,487,13,bold,dark,110);
 draw("No GST charged",35,437,11);rect(300,410,260,43,teal);draw("TOTAL DUE",311,426,13,bold,white);draw(aud(i.total),435,425,18,bold,white,115);
 rect(35,245,525,130,pale);rect(35,350,525,25,teal);draw("PAYMENT DETAILS - BANK TRANSFER",46,359,11,bold,white);
 draw("Account name: "+i.accountName,46,329,12);draw("BSB: "+i.bsb,46,307,12);draw("Account number: "+i.account,46,285,12);draw("Payment reference: "+n,46,263,12,bold);
 rect(0,0,595,88,dark);rect(0,88,595,4,teal);
 draw("Thank you for supporting a local business!",35,61,16,bold,white);
 draw("0413 195 915 | shaun@kmlminiloaders.com.au",35,38,11,font,white);
 draw("www.kmlminiloaders.com.au | Kendenup, Western Australia",35,19,10,font,white);
 return doc.saveAsBase64();
}
export default {
 async fetch(req,env){
  const url=new URL(req.url);const path=url.pathname;
  if(req.method==="OPTIONS")return new Response(null,{headers:cors(env)});
  if(path==="/api/health")return json({ok:true,service:"KML Hire API"},200,env);
  if(path.startsWith("/q/")&&req.method==="GET"){
   const t=path.slice(3);const q=await env.DB.prepare("SELECT * FROM quotes WHERE token=? AND status!='deleted'").bind(t).first();
   return q?quotePage(q,env):html("<h2>Quote not found or link expired.</h2>",404);
  }
  if(path.startsWith("/api/accept/")&&req.method==="POST"){
   const t=path.slice("/api/accept/".length);let b;try{b=await req.json()}catch{return json({error:"Invalid request"},400,env)}
   if(!b.agree||!String(b.name||"").trim())return json({error:"Enter your name and accept the terms."},400,env);
   const q=await env.DB.prepare("SELECT * FROM quotes WHERE token=? AND status!='deleted'").bind(t).first();
   if(!q)return json({error:"Quote not found"},404,env);
   if(q.status==="accepted")return json({ok:true,status:"accepted"},200,env);
   if(q.status!=="sent")return json({error:"This quote is not currently open for acceptance."},409,env);
   const at=now();await env.DB.prepare("UPDATE quotes SET status='accepted',accepted_at=?,accepted_by=? WHERE id=? AND status='sent'").bind(at,String(b.name).trim().slice(0,120),q.id).run();
   const subject="KML quote accepted: "+q.quote_number;
   const body="<p>Quote <b>"+esc(q.quote_number)+"</b> has been accepted by "+esc(String(b.name).trim())+".</p><p>Customer: "+esc(q.customer)+"<br>Total: "+aud(q.total)+"<br>Accepted: "+esc(at)+"</p>";
   await sendEmail(env,env.OWNER_EMAIL,subject,body,"Quote "+q.quote_number+" accepted by "+b.name+". Total "+aud(q.total)+".");
    await sendEmail(env,q.email,"KML booking request received: "+q.quote_number,"<p>Thanks "+esc(String(b.name).trim())+".</p><p>KML Mini Loaders has received your acceptance of quote <b>"+esc(q.quote_number)+"</b> for "+aud(q.total)+". We will be in touch to confirm scheduling and any deposit arrangements.</p><p>Call "+esc(env.BUSINESS_PHONE||"0413 195 915")+" if you have any questions.</p>","Thanks "+b.name+". KML Mini Loaders has received your acceptance of quote "+q.quote_number+". We will be in touch to confirm scheduling.");
   return json({ok:true,status:"accepted"},200,env);
  }
  if(path.startsWith("/api/")){
   if(!await admin(req,env))return json({error:"Unauthorised. Check your KML API key in app settings."},401,env);
   const hm=path.match(/^\/api\/handover-drafts\/([a-zA-Z0-9_-]{1,80})$/);
   if(hm&&req.method==="GET"){
    const row=await env.DB.prepare("SELECT * FROM handover_drafts WHERE job_id=?").bind(hm[1]).first();
    return json(row?{record:JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at}:{record:null,revision:0},200,env);
   }
   if(hm&&req.method==="POST"){
    let b;try{const raw=await req.text();if(raw.length>50000)return json({error:"Draft too large"},413,env);b=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400,env)}
    if(!b||!Number.isSafeInteger(b.revision)||b.revision<0||!b.record||typeof b.record!=="object"||Array.isArray(b.record))return json({error:"Invalid draft"},400,env);
    const x=b.record,record={};
    for(const k of ["customer","status","trainer","out","due","back","fuel","notesOut","notesBack","safetyVersion","inductionAt","collectedAt","returnedAt","start","end"])if(typeof x[k]==="string")record[k]=x[k].slice(0,2000);
    for(const k of ["bond","held","refund","retained","allowance","used","excess"])if(typeof x[k]==="number"&&Number.isFinite(x[k]))record[k]=x[k];
    record.cleaning=x.cleaning===true;
    for(const k of ["checksOut","checksBack","safety"])if(Array.isArray(x[k]))record[k]=x[k].filter(Number.isSafeInteger).slice(0,100);
    record.inspections={};for(const side of ["out","back"])if(Array.isArray(x.inspections?.[side]))record.inspections[side]=x.inspections[side].slice(0,20).map(v=>({item:String(v?.item||"").slice(0,150),condition:["Not checked","OK","Issue","Not applicable"].includes(v?.condition)?v.condition:"Not checked",notes:String(v?.notes||"").slice(0,1000)}));
    const payload=JSON.stringify(record),at=now();
    const row=b.revision===0?await env.DB.prepare("INSERT INTO handover_drafts(job_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(job_id) DO NOTHING RETURNING revision,updated_at").bind(hm[1],payload,at).first():await env.DB.prepare("UPDATE handover_drafts SET payload=?,revision=revision+1,updated_at=? WHERE job_id=? AND revision=? RETURNING revision,updated_at").bind(payload,at,hm[1],b.revision).first();
    return row?json({revision:row.revision,updatedAt:row.updated_at},200,env):json({error:"Cloud draft changed. Load the cloud copy before saving again."},409,env);
   }
   if(path==="/api/invoices"&&req.method==="GET"){
    const {results}=await env.DB.prepare("SELECT number,job_id,payload,created_at,sent_at FROM invoices ORDER BY number DESC LIMIT 250").all();
    return json({invoices:results.map(x=>({...x,payload:JSON.parse(x.payload)}))},200,env);
   }
   if(path==="/api/invoices"&&req.method==="POST"){
    let i;try{i=await req.json()}catch{return json({error:"Invalid JSON"},400,env)}
    const fields={jobId:80,customer:80,email:120,abn:20,date:10,due:10,jobDate:10,description:80,accountName:60,bsb:12,account:20};
    if(!i||Object.entries(fields).some(([k,max])=>typeof i[k]!=="string"||!i[k].trim()||i[k].length>max||/[^\x20-\x7E]/.test(i[k]))||!Number.isFinite(i.total)||i.total<=0||i.total>1000000||!/^\S+@\S+\.\S+$/.test(i.email)||i.gst!==false)return json({error:"Complete all invoice fields. This version supports non-GST invoices only."},400,env);
    const payload=JSON.stringify(Object.fromEntries([...Object.keys(fields),"total","gst"].map(k=>[k,i[k]])));
    await env.DB.prepare("INSERT INTO invoices(job_id,payload,created_at) VALUES(?,?,?) ON CONFLICT(job_id) DO NOTHING").bind(i.jobId,payload,now()).run();
    const row=await env.DB.prepare("SELECT * FROM invoices WHERE job_id=?").bind(i.jobId).first();
    const n="INV-"+String(row.number).padStart(4,"0");
    if(row.payload!==payload)return json({error:"An invoice already exists for this job. Original details are retained; open the invoice register."},409,env);
    if(row.sent_at)return json({ok:true,number:n,sentAt:row.sent_at},200,env);
    const pdf=await invoicePDF(i,n);
    const ok=await sendEmail(env,i.email,"KML invoice "+n,"<p>Hi "+esc(i.customer)+",</p><p>Your invoice is attached. Total due: "+aud(i.total)+".</p><p>Thank you for choosing KML.</p>","Your KML invoice "+n+" is attached. Total due: "+aud(i.total),[{filename:n+".pdf",content:pdf}],"kml-invoice-"+row.number);
    if(!ok)return json({error:"Invoice saved but email failed. Retry with the same details."},502,env);
    const at=now();await env.DB.prepare("UPDATE invoices SET sent_at=? WHERE number=?").bind(at,row.number).run();
    return json({ok:true,number:n,sentAt:at},200,env);
   }
   if(path==="/api/quotes"&&req.method==="GET"){
    const {results}=await env.DB.prepare("SELECT id,quote_number,status,customer,email,phone,job_date,hire_type,total,created_at,sent_at,accepted_at,accepted_by FROM quotes WHERE status!='deleted' ORDER BY created_at DESC LIMIT 250").all();
    return json({quotes:results},200,env);
   }
   if(path==="/api/quotes"&&req.method==="POST"){
    let b;try{b=await req.json()}catch{return json({error:"Invalid JSON"},400,env)}
    if(!b.customer||!Array.isArray(b.items)||!b.items.length)return json({error:"Customer and quote line items are required."},400,env);
    const id=crypto.randomUUID(),tok=token(),created=now();
    const {results}=await env.DB.prepare("SELECT COUNT(*) AS n FROM quotes").all();const n=(results[0]?.n||0)+1;const qn="KML-"+String(n).padStart(4,"0");
    const subtotal=b.items.reduce((s,x)=>s+(Number(x.amount)||0),0);
    await env.DB.prepare("INSERT INTO quotes (id,quote_number,token,status,customer,email,phone,job_date,hire_type,description,location,hours,days,items_json,subtotal,total,notes,terms,created_at) VALUES (?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,qn,tok,String(b.customer).slice(0,160),b.email||null,b.phone||null,b.jobDate||null,b.hireType||"wet",b.description||"",b.location||"",Number(b.hours)||null,Number(b.days)||null,JSON.stringify(b.items),subtotal,subtotal,b.notes||"",b.terms||"",created).run();
    return json({id,quoteNumber:qn,status:"draft",total:subtotal},201,env);
   }
   const shareMatch=path.match(/^\/api\/quotes\/([^/]+)\/share$/);
   if(shareMatch&&req.method==="POST"){
    const id=shareMatch[1];
    const quote=await env.DB.prepare(
     "UPDATE quotes SET status='sent', sent_at=COALESCE(sent_at, ?) WHERE id=? AND status IN ('draft','sent') RETURNING token,status,sent_at"
    ).bind(now(),id).first();
    if(!quote){
     const existing=await env.DB.prepare("SELECT status FROM quotes WHERE id=?").bind(id).first();
     return existing
      ?json({error:"Only draft or sent quotes can be shared."},409,env)
      :json({error:"Quote not found"},404,env);
    }
    return json({status:quote.status,sentAt:quote.sent_at,acceptUrl:url.origin+"/q/"+quote.token},200,env);
   }
   const sendMatch=path.match(/^\/api\/quotes\/([^/]+)\/send$/);
   if(sendMatch&&req.method==="POST"){
    const q=await env.DB.prepare("SELECT * FROM quotes WHERE id=?").bind(sendMatch[1]).first();if(!q)return json({error:"Quote not found"},404,env);if(q.status!=="draft")return json({error:"Only draft quotes can be sent. This quote is already "+q.status+"."},409,env);
    const link=url.origin+"/q/"+q.token;const total=aud(q.total);
    const lines=JSON.parse(q.items_json||"[]").map(x=>x.description+" — "+aud(x.amount)).join("\n");
    const textBody="KML Mini Loaders quote "+q.quote_number+"\nHi "+q.customer+",\n\n"+lines+"\nTotal: "+total+"\nView and accept your quote: "+link+"\n\nQuestions? Call "+(env.BUSINESS_PHONE||"KML Mini Loaders");
    let emailOk=false,smsOk=false;
    if(q.email)emailOk=await sendEmail(env,q.email,"Your KML Mini Loaders quote "+q.quote_number,"<p>Hi "+esc(q.customer)+",</p><p>Your KML Mini Loaders quote is ready.</p><p><b>Total: "+total+"</b></p><p><a href='"+link+"'>View and accept your quote</a></p><p>"+esc(env.BUSINESS_PHONE||"")+"</p>",textBody);
    if(q.phone)smsOk=await sendSms(env,q.phone,"KML quote "+q.quote_number+" for "+total+". View and accept: "+link);
    if(!emailOk&&!smsOk)return json({error:"No message was sent. Check customer email/mobile and configure Resend/Twilio secrets."},502,env);
    await env.DB.prepare("UPDATE quotes SET status='sent',sent_at=? WHERE id=? AND status='draft'").bind(now(),q.id).run();
    return json({ok:true,emailSent:emailOk,smsSent:smsOk,acceptUrl:link},200,env);
   }
   const getMatch=path.match(/^\/api\/quotes\/([^/]+)$/);
   if(getMatch&&req.method==="DELETE"){
    const q=await env.DB.prepare("UPDATE quotes SET status='deleted' WHERE id=? RETURNING id").bind(getMatch[1]).first();
    return q?json({ok:true},200,env):json({error:"Quote not found"},404,env);
   }
   if(getMatch&&req.method==="GET"){
    const q=await env.DB.prepare("SELECT id,quote_number,status,customer,email,phone,job_date,hire_type,total,created_at,sent_at,accepted_at,accepted_by FROM quotes WHERE id=? AND status!='deleted'").bind(getMatch[1]).first();
    return q?json(q,200,env):json({error:"Quote not found"},404,env);
   }
  }
  return json({error:"Not found"},404,env);
 }
};
