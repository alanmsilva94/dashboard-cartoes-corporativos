/* =========================================================================
   APP — ligações de interface e boot automático da base
   ========================================================================= */

/* --------------------------------- UI ---------------------------------- */
$("#btnFolder").onclick  = ()=>pickFolder().catch(()=>toast("Cancelado."));
$("#btnFile").onclick    = ()=>pickFile().catch(()=>toast("Cancelado."));
$("#btnRefresh").onclick = ()=>refresh(true);
$("#btnAuto").onclick    = ()=>setAuto(!STATE.auto);
$("#btnClear").onclick   = ()=>{ FDEF.forEach(([s])=>$(s).value=""); STATE.tree={dep:null,nat:null}; render(); };
$("#fileInput").onchange = e=>{ if(e.target.files[0]) loadFile(e.target.files[0]); };

["dragover","dragleave","drop"].forEach(ev=>document.addEventListener(ev,e=>{
  e.preventDefault(); const d=$("#drop");
  if(ev==="dragover") d.classList.add("hot"); else d.classList.remove("hot");
  if(ev==="drop"&&e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
}));

/* Ao voltar para a aba, relê a base na hora (sem esperar o ciclo). */
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && STATE.auto) refresh(false); });
window.addEventListener("focus",()=>{ if(STATE.auto) refresh(false); });

/* ------------------------- BOOT AUTOMÁTICO ------------------------------ */
/* 1) mostra na hora os dados da última leitura (cache local)
   2) reconecta o caminho salvo e relê o .xlsx sozinho, se a permissão persistir
   3) se o navegador exigir confirmação, o primeiro clique na página religa    */
(async function boot(){
  setAuto(localStorage.getItem("portalDashAuto") !== "0");

  const cached = loadCache();

  const fileH = await idbGet("file");
  const dirH  = await idbGet("dir");
  STATE.handle = fileH || null;
  STATE.dir    = fileH ? null : (dirH || null);

  const src = STATE.handle || STATE.dir;
  if(!src){
    if(!cached){ setStatus("Nenhuma base carregada",false); await loadDemo(); }
    return;
  }

  const perm = await src.queryPermission?.({mode:"read"});
  if(perm === "granted"){
    await refresh(true);              // leitura automática ao abrir o HTML
    startAuto();
    return;
  }

  setStatus(cached ? "Cache exibido — clique na página para religar a base"
                   : "Base salva — clique na página para religar",false);
  toast(cached ? "Mostrando último dado salvo — clique na página para religar a base."
               : "Clique na página para religar a base salva.");

  const relink = async ()=>{
    document.removeEventListener("click",relink);
    if(await ensurePermission(src)){ await refresh(true); startAuto(); }
    else toast("Permissão negada — use 📁 Pasta da base.");
  };
  document.addEventListener("click",relink);
})();

/* Modo demonstração: se servido por http(s), tenta carregar os dados fictícios de exemplo. */
async function loadDemo(){
  if(!/^https?:$/.test(location.protocol)) return;
  try{
    const r = await fetch("./dados_exemplo/base_de_dados.xlsx",{cache:"no-store"});
    if(!r.ok) return;
    STATE.rows = parseWorkbook(await r.arrayBuffer());
    setStatus(STATE.rows.length+" lançamentos · dados de exemplo (fictícios)",false);
    showDash(); buildFilters(); render();
  }catch(e){ console.warn("Dados de exemplo indisponíveis:",e); }
}
