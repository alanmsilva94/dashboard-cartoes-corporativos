/* =========================================================================
   VIEWS — gráficos, KPIs, árvore de decomposição, insights e tabela
   ========================================================================= */
Chart.defaults.font.family='"Segoe UI",Roboto,Arial,sans-serif';
Chart.defaults.color="#63758d";
const GRID = "#e6ecf5";
const tip = {callbacks:{label:c=>` ${c.label||c.dataset.label}: ${brl(c.parsed.y ?? c.parsed)}`}};
function draw(id,cfg){ STATE.charts[id]?.destroy(); STATE.charts[id]=new Chart($("#"+id),cfg); }

function renderCharts(rows){
  /* Coluna + linha (média móvel) */
  const m=byMonth(rows), mm=m.map((_,i)=>{const s=m.slice(Math.max(0,i-2),i+1);return s.reduce((a,b)=>a+b.v,0)/s.length;});
  draw("chMes",{data:{labels:m.map(x=>x.label),datasets:[
      {type:"bar",label:"Gasto do mês",data:m.map(x=>x.v),backgroundColor:"#ec0000",hoverBackgroundColor:"#990000",borderRadius:8,maxBarThickness:46},
      {type:"line",label:"Média móvel 3M",data:mm,borderColor:"#0b2545",backgroundColor:"#0b2545",tension:.35,pointRadius:3,borderWidth:2}]},
    options:{maintainAspectRatio:false,plugins:{tooltip:tip,legend:{position:"bottom"}},
      scales:{y:{ticks:{callback:v=>"R$ "+num(v)},grid:{color:GRID}},x:{grid:{display:false}}}}});

  /* Rosca — Natureza */
  const nat=groupBy(rows,"natureza");
  draw("chNatureza",{type:"doughnut",data:{labels:nat.map(x=>x.k),datasets:[{data:nat.map(x=>x.v),backgroundColor:PAL,borderWidth:2,borderColor:"#fff"}]},
    options:{maintainAspectRatio:false,cutout:"58%",plugins:{legend:{position:"bottom",labels:{boxWidth:10}},
      tooltip:{callbacks:{label:c=>` ${c.label}: ${brl(c.parsed)} (${(c.parsed/sum(rows)*100).toFixed(1)}%)`}}}}});

  /* Barras horizontais — Departamento */
  const dep=groupBy(rows,"depto").slice(0,10);
  draw("chDepto",{type:"bar",data:{labels:dep.map(x=>x.k),datasets:[{label:"Valor",data:dep.map(x=>x.v),backgroundColor:"#257fa4",hoverBackgroundColor:"#0b2545",borderRadius:8}]},
    options:{indexAxis:"y",maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:c=>` ${brl(c.parsed.x)}`}}},scales:{x:{ticks:{callback:v=>"R$ "+num(v)},grid:{color:GRID}},y:{grid:{display:false}}}}});

  /* Pizza — Bandeira */
  const ban=groupBy(rows,"bandeira");
  draw("chBandeira",{type:"pie",data:{labels:ban.map(x=>x.k),datasets:[{data:ban.map(x=>x.v),backgroundColor:PAL,borderWidth:2,borderColor:"#fff"}]},
    options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{boxWidth:10}},
      tooltip:{callbacks:{label:c=>` ${c.label}: ${brl(c.parsed)}`}}}}});

  /* Rosca — Status */
  const st=groupBy(rows,"status");
  draw("chStatus",{type:"doughnut",data:{labels:st.map(x=>x.k),datasets:[{data:st.map(x=>x.v),backgroundColor:["#00a86b","#e59500","#d32f2f","#9aa7b8"],borderWidth:2,borderColor:"#fff"}]},
    options:{maintainAspectRatio:false,cutout:"62%",plugins:{legend:{position:"bottom",labels:{boxWidth:10}},
      tooltip:{callbacks:{label:c=>` ${c.label}: ${brl(c.parsed)}`}}}}});

  /* Linha — acumulado */
  const ord=[...rows].filter(r=>r.data).sort((a,b)=>a.data-b.data); let acc=0;
  const pts=ord.map(r=>({x:r.data.toLocaleDateString("pt-BR"),y:(acc+=r.valor)}));
  draw("chAcum",{type:"line",data:{labels:pts.map(p=>p.x),datasets:[{label:"Acumulado",data:pts.map(p=>p.y),
      borderColor:"#ec0000",backgroundColor:"rgba(236,0,0,.10)",fill:true,tension:.3,pointRadius:0,borderWidth:2}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tip,mode:"index",intersect:false}},
      scales:{y:{ticks:{callback:v=>"R$ "+num(v)},grid:{color:GRID}},x:{grid:{display:false},ticks:{maxTicksLimit:12}}}}});
}

/* ------------------------- ÁRVORE DE DECOMPOSIÇÃO ----------------------- */
function renderTree(rows){
  const t=$("#tree"); t.innerHTML="";
  const total=sum(rows);
  const lvl=(title,items,max,onClick,selKey)=>{
    const c=document.createElement("div"); c.className="level";
    c.innerHTML=`<div class="level-h">${title}</div>`;
    items.slice(0,12).forEach(it=>{
      const n=document.createElement("div");
      n.className="node"+(selKey===it.k?" sel":"");
      n.innerHTML=`<div class="n"><span>${it.k}</span><span>${brl(it.v)}</span></div>
        <div class="b"><i style="width:${max?(it.v/max*100).toFixed(1):0}%"></i></div>
        <div class="s">${total?(it.v/total*100).toFixed(1):0}% do total</div>`;
      if(onClick) n.onclick=()=>onClick(it.k);
      c.appendChild(n);
    });
    t.appendChild(c);
  };
  const anos=groupBy(rows,"ano");
  lvl("Ano / Total",anos,anos[0]?.v||0);

  const deps=groupBy(rows,"depto");
  lvl("Departamento",deps,deps[0]?.v||0,k=>{STATE.tree.dep=STATE.tree.dep===k?null:k;STATE.tree.nat=null;renderTree(rows);},STATE.tree.dep);

  const r2=STATE.tree.dep?rows.filter(r=>r.depto===STATE.tree.dep):rows;
  const nats=groupBy(r2,"natureza");
  lvl("Natureza"+(STATE.tree.dep?" · "+STATE.tree.dep:""),nats,nats[0]?.v||0,k=>{STATE.tree.nat=STATE.tree.nat===k?null:k;renderTree(rows);},STATE.tree.nat);

  const r3=STATE.tree.nat?r2.filter(r=>r.natureza===STATE.tree.nat):r2;
  const des=groupBy(r3,"descricao");
  lvl("Descrição"+(STATE.tree.nat?" · "+STATE.tree.nat:""),des,des[0]?.v||0);
}

/* ------------------------------- KPIs ---------------------------------- */
function renderKpis(rows){
  const total=sum(rows), qtd=rows.length, tkt=qtd?total/qtd:0;
  const m=byMonth(rows), ult=m.at(-1), pen=m.at(-2);
  const var_= (ult&&pen&&pen.v)?((ult.v-pen.v)/pen.v*100):null;
  const dep=groupBy(rows,"depto")[0], nat=groupBy(rows,"natureza")[0];
  const cards=[
    {t:"Gasto total",v:brl(total),d:`${num(qtd)} lançamentos no recorte`,c:"var(--brand)"},
    {t:"Ticket médio",v:brl(tkt),d:"valor médio por lançamento",c:"var(--c3)"},
    {t:"Último mês",v:ult?brl(ult.v):"—",d:var_===null?"sem base comparativa":
      `<span class="${var_>=0?'up':'down'}">${var_>=0?"▲":"▼"} ${Math.abs(var_).toFixed(1)}%</span> vs. mês anterior`,c:"var(--c2)"},
    {t:"Maior departamento",v:dep?dep.k:"—",d:dep?`${brl(dep.v)} · ${(dep.v/total*100).toFixed(1)}% do total`:"",c:"var(--c4)"},
    {t:"Maior natureza",v:nat?nat.k:"—",d:nat?`${brl(nat.v)} · ${(nat.v/total*100).toFixed(1)}% do total`:"",c:"var(--c5)"},
    {t:"Média mensal",v:m.length?brl(total/m.length):"—",d:`${m.length} mês(es) com movimento`,c:"var(--c6)"}
  ];
  $("#kpis").innerHTML=cards.map(k=>`<div class="kpi" style="--accent:${k.c}" title="${k.t}">
    <div class="t">${k.t}</div><div class="v">${k.v}</div><div class="d">${k.d}</div></div>`).join("");
}

/* ----------------------------- INSIGHTS -------------------------------- */
function renderInsights(rows){
  const out=[], total=sum(rows), m=byMonth(rows);
  const add=(type,h,p)=>out.push({type,h,p});
  if(!rows.length){ $("#insights").innerHTML='<div class="ins"><p>Sem dados no recorte atual.</p></div>'; return; }

  if(m.length>=2){
    const a=m.at(-2).v,b=m.at(-1).v,d=a?((b-a)/a*100):0;
    add(d>0?"alert":"pos","Tendência recente",
      `O gasto de <b>${m.at(-1).label}</b> foi de <b>${brl(b)}</b>, ${d>=0?"aumento":"redução"} de <b>${Math.abs(d).toFixed(1)}%</b> frente a ${m.at(-2).label} (${brl(a)}).`);
  }
  if(m.length>=3){
    const first=m[0].v,last=m.at(-1).v;
    add("idea","Trajetória do período",
      `Entre <b>${m[0].label}</b> e <b>${m.at(-1).label}</b> o patamar mensal ${last>=first?"subiu":"caiu"} de ${brl(first)} para ${brl(last)}. Média mensal de <b>${brl(total/m.length)}</b> — use-a como teto de referência no fluxo de caixa.`);
  }

  const dep=groupBy(rows,"depto"), nat=groupBy(rows,"natureza");
  if(dep[0]) add("warn","Concentração por departamento",
    `<b>${dep[0].k}</b> concentra <b>${(dep[0].v/total*100).toFixed(1)}%</b> (${brl(dep[0].v)}) do gasto. ${dep.length>1?`O segundo colocado, ${dep[1].k}, responde por ${(dep[1].v/total*100).toFixed(1)}%.`:""}`);
  if(nat[0]) add("idea","Composição por natureza",
    `A natureza <b>${nat[0].k}</b> lidera com <b>${brl(nat[0].v)}</b>. Renegociar contratos dessa linha tende a gerar o maior impacto na redução do custo total.`);

  const vals=rows.map(r=>r.valor), md=vals.reduce((a,b)=>a+b,0)/vals.length;
  const sd=Math.sqrt(vals.reduce((s,v)=>s+(v-md)**2,0)/vals.length);
  const out2=rows.filter(r=>r.valor>md+2*sd).sort((a,b)=>b.valor-a.valor);
  if(out2.length) add("alert","Alerta de anomalias",
    `<b>${out2.length}</b> lançamento(s) acima de 2 desvios-padrão (limite ${brl(md+2*sd)}). Maior: <b>${out2[0].descricao}</b> — ${brl(out2[0].valor)} em ${out2[0].data?out2[0].data.toLocaleDateString("pt-BR"):"—"} (${out2[0].depto}).`);
  else add("pos","Sem anomalias relevantes","Nenhum lançamento ultrapassou 2 desvios-padrão da média: o padrão de gastos está homogêneo.");

  const pend=rows.filter(r=>!/valid/i.test(r.status));
  if(pend.length) add("warn","Pendências de validação",
    `<b>${pend.length}</b> lançamento(s) somando <b>${brl(sum(pend))}</b> ainda não estão validados — regularize antes do fechamento.`);

  const cart=groupBy(rows,"cartao");
  if(cart.length>1) add("idea","Comparativo entre cartões",
    `O cartão <b>${cart[0].k}</b> responde por ${brl(cart[0].v)} (${(cart[0].v/total*100).toFixed(1)}%), contra ${brl(cart.at(-1).v)} do cartão ${cart.at(-1).k}. Avalie redistribuir limites conforme o uso real.`);

  const cls={alert:"t-alert",pos:"t-pos",warn:"t-warn",idea:"t-idea"};
  $("#insights").innerHTML=out.map(i=>`<div class="ins ${cls[i.type]}"><div class="h">${i.h}</div><p>${i.p}</p></div>`).join("");
}

/* ------------------------------- TABELA -------------------------------- */
function renderTable(rows){
  const top=[...rows].sort((a,b)=>b.valor-a.valor).slice(0,15);
  $("#tbl tbody").innerHTML=top.map(r=>`<tr title="${r.descricao}">
    <td>${r.data?r.data.toLocaleDateString("pt-BR"):"—"}</td><td>${r.bandeira}</td><td>${r.cartao}</td>
    <td>${r.natureza}</td><td>${r.descricao}</td><td>${r.depto}</td><td>${r.status}</td>
    <td class="right"><b>${brl(r.valor)}</b></td></tr>`).join("");
}

/* ------------------------------- RENDER -------------------------------- */
function render(){
  const rows=applyFilters(); STATE.filtered=rows;
  renderKpis(rows); renderCharts(rows); renderTree(rows); renderInsights(rows); renderTable(rows);
}
