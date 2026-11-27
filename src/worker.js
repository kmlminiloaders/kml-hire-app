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
async function admin(req,env){const got=req.headers.get("X-KML-Key")||"",want=env.KML_ADMIN_KEY||"";if(!want||got.length!==want.length)return false;let diff=0;for(let i=0;i<got.length;i++)diff|=got.charCodeAt(i)^want.charCodeAt(i);return diff===0;}
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
function quotePage(q,env){
 const items=JSON.parse(q.items_json||"[]");
 const rows=items.map(x=>'<tr><td>'+esc(x.description)+'</td><td>'+esc(x.quantity||1)+'</td><td>'+aud(x.amount)+'</td></tr>').join("");
 const accepted=q.status==="accepted";
 return html(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101719"><title>KML Quote ${esc(q.quote_number)}</title>
 <style>*{box-sizing:border-box}body{margin:0;background:#101719;color:#f4f7f7;font:16px system-ui;padding:18px}.wrap{max-width:680px;margin:auto}.card{background:#192326;border:1px solid #344447;border-radius:16px;padding:20px;margin:14px 0}.brand{color:#16b7ad;font-weight:800;letter-spacing:1px}.muted{color:#a9b8b8;font-size:13px}h1{font-size:24px;margin:8px 0}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{text-align:left;padding:12px 6px;border-bottom:1px solid #344447}th{color:#a9b8b8}.total{font-size:28px;font-weight:800;color:#16b7ad;text-align:right}.btn{background:#16b7ad;color:#062321;border:0;border-radius:10px;padding:14px 18px;font-size:17px;font-weight:800;width:100%;margin-top:14px}input{width:100%;padding:13px;border-radius:9px;border:1px solid #344447;background:#0d1416;color:white;margin:7px 0 14px}label{font-size:14px;color:#c7d2d2}.success{color:#75d6a5;font-weight:800}</style>
 <div class="wrap"><div class="card"><div class="brand">KML · KENDENUP MINI LOADERS</div><p class="muted">QUOTE ${esc(q.quote_number)}</p><h1>Hire quote</h1><p>Prepared for <b>${esc(q.customer)}</b></p><p class="muted">Quote date: ${esc(q.created_at.slice(0,10))} · Job date: ${esc(q.job_date||"To be confirmed")}</p><p>${esc(q.description||"Mini loader hire")}</p><p class="muted">${esc(q.location||"")}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="total">Total: ${aud(q.total)}</div><p class="muted">GST is not charged unless shown and KML is registered for GST.</p>${q.notes?'<p><b>Notes:</b> '+esc(q.notes)+'</p>':""}${q.terms?'<p><b>Terms:</b><br>'+esc(q.terms).replace(/\n/g,"<br>")+'</p>':""}<p class="muted">Questions? Call ${esc(env.BUSINESS_PHONE||"KML Mini Loaders")}.</p></div>
 <div class="card">${accepted?'<p class="success">✓ QUOTE ACCEPTED</p><p>Thank you, '+esc(q.accepted_by)+'. Your acceptance was recorded on '+esc(q.accepted_at)+'.</p>':q.status==="declined"?'<p>This quote has been declined.</p>':'<h2>Accept this quote</h2><p class="muted">By accepting, you confirm that you agree to the quote and the terms shown above.</p><form id="accept"><label>Your full name</label><input name="name" required maxlength="120" autocomplete="name"><label><input type="checkbox" name="agree" required style="width:auto"> I accept this quote and the terms above.</label><button class="btn">ACCEPT QUOTE</button><p id="msg" class="muted"></p></form>'}</div>
 <p class="muted" style="text-align:center">KML Mini Loaders · Kendenup, Western Australia · ${esc(env.BUSINESS_PHONE||"")}</p></div>
 ${accepted||q.status==="declined"?"":'<script>document.getElementById("accept").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const b=document.querySelector("button");b.disabled=true;b.textContent="Submitting...";try{const r=await fetch("/api/accept/'+q.token+'",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:f.get("name"),agree:f.get("agree")==="on"})});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not submit");location.reload()}catch(x){document.getElementById("msg").textContent=x.message;b.disabled=false;b.textContent="ACCEPT QUOTE"}})</script>'}
 </html>`);
}
async function invoicePDF(i,n){
 const doc=await PDFDocument.create(),page=doc.addPage([595,842]),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const clean=v=>String(v??"").replace(/[^\x20-\x7E]/g,"?");
 const draw=(v,x,y,size=12,f=font,color=rgb(.12,.16,.17))=>page.drawText(clean(v),{x,y,size,font:f,color});
 page.drawRectangle({x:0,y:730,width:595,height:112,color:rgb(.06,.12,.13)});
 draw("KML | KENDENUP MINI LOADERS",42,785,22,bold,rgb(.2,.85,.8));
 draw("INVOICE "+n,42,748,17,bold,rgb(1,1,1));
 draw("ABN: "+i.abn,42,700);draw("Issued: "+i.date+"   Due: "+i.due,42,675);
 draw("Bill to: "+i.customer,42,630,15,bold);draw(i.email,42,605);
 draw("Job date: "+i.jobDate,42,575);draw(i.description,42,545);
 page.drawLine({start:{x:42,y:520},end:{x:553,y:520},thickness:1,color:rgb(.1,.6,.6)});
 draw("TOTAL DUE",42,480,17,bold);draw(aud(i.total),390,480,20,bold);
 draw("No GST charged",42,450);
 draw("Payment: bank transfer",42,390,15,bold);
 draw("Account: "+i.accountName,42,365);draw("BSB: "+i.bsb+"   Account: "+i.account,42,340);
 draw("Reference: "+n,42,315);draw("Thank you for supporting a local business!",42,80);
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
