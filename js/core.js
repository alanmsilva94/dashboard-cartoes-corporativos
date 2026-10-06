/* =========================================================================
   CORE — estado, utilitários, leitura do XLSX, persistência e filtros
   ========================================================================= */

/* ------------------------------ STATE ---------------------------------- */
const STATE = { rows: [], filtered: [], charts: {}, tree: {dep:null,nat:null},
                handle:null, dir:null, auto:true, lastSig:"", timer:null, busy:false };

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const PAL   = ["#ec0000","#0b2545","#257fa4","#00a86b","#e59500","#7b4ddb","#00b8d9","#ff7a45","#9aa7b8","#990000"];
const AUTO_MS = 5000;

const brl = v => (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num = v => (v||0).toLocaleString("pt-BR",{maximumFractionDigits:0});
const $   = s => document.querySelector(s);

function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2600); }
function setStatus(msg,live){ $("#status").textContent=msg; $("#live").classList.toggle("on",!!live); }

/* -------------------------------- IO ----------------------------------- */
/** Converte a planilha (ArrayBuffer) em linhas normalizadas. */
function parseWorkbook(buf){
  const wb = XLSX.read(buf,{type:"array",cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws,{defval:null});
  return raw.map(r=>{
    const g = k => { const key = Object.keys(r).find(x=>x.trim().toLowerCase()===k); return key?r[key]:null; };
    const d = g("data") ? new Date(g("data")) : null;
    const mes = g("mês") || g("mes") || (d?MESES[d.getMonth()]:"—");
    return {
      numMes: +(g("núm_mês")||g("num_mes")|| (d?d.getMonth()+1:0)),
      mes: String(mes), ano: +(g("ano")|| (d?d.getFullYear():0)), data: d,
      bandeira: String(g("bandeira")??"—"), cartao: String(g("cartão")??g("cartao")??"—"),
      natureza: String(g("natureza")??"—"), descricao: String(g("descrição")??g("descricao")??"—"),
      valor: +(g("valor")||0), depto: String(g("departamento")??"—"), status: String(g("status")??"—")
    };
  }).filter(r=>r.valor||r.data);
}

/* ------------------- MEMÓRIA DO CAMINHO (IndexedDB) -------------------- */
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open("dashPortal",1);
  r.onupgradeneeded=()=>r.result.createObjectStore("fs"); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function idbSet(k,v){ try{ const db=await idb(); await new Promise((res,rej)=>{ const t=db.transaction("fs","readwrite"); t.objectStore("fs").put(v,k); t.oncomplete=res; t.onerror=()=>rej(t.error); }); }catch(e){} }
async function idbGet(k){ try{ const db=await idb(); return await new Promise((res,rej)=>{ const t=db.transaction("fs","readonly"); const q=t.objectStore("fs").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }catch(e){ return null; } }

/* Cache dos dados → o dashboard já abre preenchido, antes de reler o arquivo. */
function saveCache(){ try{ localStorage.setItem("portalDashCache",JSON.stringify({sig:STATE.lastSig,when:Date.now(),rows:STATE.rows})); }catch(e){} }
function loadCache(){
  try{
    const c=JSON.parse(localStorage.getItem("portalDashCache")||"null"); if(!c||!c.rows?.length) return false;
    STATE.rows=c.rows.map(r=>({...r,data:r.data?new Date(r.data):null})); STATE.lastSig=c.sig||"";
    setStatus(STATE.rows.length+" lançamentos · cache de "+new Date(c.when).toLocaleString("pt-BR"),false);
    showDash(); buildFilters(); render(); return true;
  }catch(e){ return false; }
}

function showDash(){ $("#drop").classList.add("hidden"); $("#dash").classList.remove("hidden"); }

/** Carrega a base a partir de um File. */
async function loadFile(file){
  const buf = await file.arrayBuffer();
  STATE.lastSig = file.size+"|"+file.lastModified;
  STATE.rows = parseWorkbook(buf);
  setStatus(STATE.rows.length+" lançamentos · atualizado "+new Date().toLocaleTimeString("pt-BR"),true);
  showDash(); buildFilters(); render(); saveCache();
}

/* ------------------- SELEÇÃO DE PASTA / ARQUIVO ------------------------ */
async function pickFolder(){
  if(!window.showDirectoryPicker) return toast("Navegador sem suporte a pasta — use 📄 Abrir .xlsx.");
  STATE.dir = await window.showDirectoryPicker();
  STATE.handle = null;
  await idbSet("dir",STATE.dir); await idbSet("file",null);
  await refresh(true);
  startAuto();
}
async function pickFile(){
  if(window.showOpenFilePicker){
    const [h] = await window.showOpenFilePicker({types:[{description:"Excel",accept:{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx",".xls"]}}]});
    STATE.handle = h; STATE.dir = null;
    await idbSet("file",h); await idbSet("dir",null);
    await loadFile(await h.getFile());
    toast("Base carregada — leitura automática ativada.");
    startAuto();
  } else $("#fileInput").click();
}

/** Procura o primeiro .xlsx válido dentro da pasta monitorada. */
async function findInDir(){
  for await (const [name,h] of STATE.dir.entries())
    if(h.kind==="file" && /\.(xlsx|xls)$/i.test(name) && !name.startsWith("~$")) return h;
  return null;
}

/** Recarrega a base (silencioso quando nada mudou). */
async function refresh(force){
  if(STATE.busy) return;
  const src = STATE.handle || STATE.dir;
  if(!src) return force?toast("Selecione a pasta ou o arquivo primeiro."):null;
  STATE.busy = true;
  try{
    if(await src.queryPermission?.({mode:"read"}) !== "granted"){
      // sem permissão silenciosa: não insiste a cada ciclo, aguarda um clique do usuário
      if(force) await ensurePermission(src);
      else { setStatus("Base salva aguardando permissão — clique na página",false); return; }
    }
    let file=null;
    if(STATE.handle) file = await STATE.handle.getFile();
    else if(STATE.dir){ const h = await findInDir(); if(h){ STATE.handle=h; file = await h.getFile(); } }
    if(!file) return force?toast("Nenhum .xlsx encontrado na pasta."):null;
    const sig = file.size+"|"+file.lastModified;
    if(!force && sig===STATE.lastSig){ $("#live").classList.add("on"); return; }
    await loadFile(file);
  }catch(e){ console.error(e); if(force) toast("Falha ao ler a base: "+e.message); $("#live").classList.remove("on"); }
  finally{ STATE.busy = false; }
}

/** Pede permissão de leitura ao usuário (precisa de gesto do usuário). */
async function ensurePermission(src){
  try{ return (await src.requestPermission({mode:"read"})) === "granted"; }
  catch(e){ return false; }
}

/* ---------------------- ATUALIZAÇÃO AUTOMÁTICA -------------------------- */
function startAuto(){
  stopAuto();
  if(!STATE.auto) return;
  STATE.timer = setInterval(()=>{ if(STATE.auto && (STATE.handle||STATE.dir)) refresh(false); },AUTO_MS);
}
function stopAuto(){ if(STATE.timer){ clearInterval(STATE.timer); STATE.timer=null; } }
function setAuto(on){
  STATE.auto = on;
  localStorage.setItem("portalDashAuto", on?"1":"0");
  $("#btnAuto").textContent = "⏱️ Auto: "+(on?"ON":"OFF");
  on ? startAuto() : stopAuto();
}

/* ------------------------------ FILTERS -------------------------------- */
const FDEF = [["#fAno","ano"],["#fMes","mes"],["#fBandeira","bandeira"],["#fCartao","cartao"],
              ["#fNatureza","natureza"],["#fDepto","depto"],["#fStatus","status"]];
function buildFilters(){
  FDEF.forEach(([sel,key])=>{
    const el=$(sel), cur=el.value;
    let vals=[...new Set(STATE.rows.map(r=>r[key]))].filter(v=>v!==null&&v!=="");
    vals = key==="mes" ? MESES.filter(m=>vals.includes(m)) : vals.sort((a,b)=>String(a).localeCompare(String(b),"pt-BR",{numeric:true}));
    el.innerHTML = '<option value="">Todos</option>'+vals.map(v=>`<option>${v}</option>`).join("");
    if(vals.map(String).includes(cur)) el.value=cur;
    el.onchange = render;
  });
}
function applyFilters(){
  const f = Object.fromEntries(FDEF.map(([sel,key])=>[key,$(sel).value]));
  return STATE.rows.filter(r=>FDEF.every(([,k])=>!f[k]||String(r[k])===f[k]));
}

/* -------------------------------- AGG ---------------------------------- */
const sum = a => a.reduce((s,r)=>s+r.valor,0);
function groupBy(rows,key){
  const m=new Map(); rows.forEach(r=>m.set(r[key],(m.get(r[key])||0)+r.valor));
  return [...m].map(([k,v])=>({k:String(k),v})).sort((a,b)=>b.v-a.v);
}
function byMonth(rows){
  const m=new Map();
  rows.forEach(r=>{const k=r.ano+"-"+String(r.numMes).padStart(2,"0");m.set(k,(m.get(k)||0)+r.valor);});
  return [...m].sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([k,v])=>({k, label:MESES[+k.slice(5)-1].slice(0,3)+"/"+k.slice(2,4), v}));
}
