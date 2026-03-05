/*
CONFIG & CONSTANTS
 */
const MONTHS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const TK="cal_th", FK="cal_fav", YK="cal_yr", PEK="cal_pe";
const CHUNK=3;

const CATS=[
  {n:"Jours fériés",        c:"#ff5a5a",d:"rgba(255,90,90,.12)",   b:"rgba(255,90,90,.3)"},
  {n:"Vacances scolaires",  c:"#f5a020",d:"rgba(245,160,32,.12)",  b:"rgba(245,160,32,.3)"},
  {n:"Changement d'heure",  c:"#3ecf8e",d:"rgba(62,207,142,.12)",  b:"rgba(62,207,142,.3)"},
  {n:"Saisons",             c:"#22d3ee",d:"rgba(34,211,238,.12)",  b:"rgba(34,211,238,.3)"},
  {n:"Ponts / Congés",      c:"#fb923c",d:"rgba(251,146,60,.12)",  b:"rgba(251,146,60,.3)"},
  {n:"Événements spéciaux", c:"#a78bfa",d:"rgba(167,139,250,.12)", b:"rgba(167,139,250,.3)"},
  {n:"Commercial",          c:"#f472b6",d:"rgba(244,114,182,.12)", b:"rgba(244,114,182,.3)"},
  {n:"Christianisme",       c:"#e2c074",d:"rgba(226,192,116,.12)", b:"rgba(226,192,116,.3)"},
  {n:"Culture",             c:"#6b8cff",d:"rgba(107,140,255,.12)", b:"rgba(107,140,255,.3)"},
  {n:"Astronomie",          c:"#60a5fa",d:"rgba(96,165,250,.12)",  b:"rgba(96,165,250,.3)"},
  {n:"Société",             c:"#94a3b8",d:"rgba(148,163,184,.12)", b:"rgba(148,163,184,.3)"},
];
function cd(name){return CATS.find(c=>c.n===name)||{c:"#6b8cff",d:"rgba(107,140,255,.12)",b:"rgba(107,140,255,.3)"};}

const PROFILES={
  complet:  null,
  essentiel:["Jours fériés","Vacances scolaires","Ponts / Congés"],
  familial: ["Jours fériés","Vacances scolaires","Saisons","Événements spéciaux","Christianisme","Culture"],
  pro:      ["Jours fériés","Ponts / Congés","Commercial","Événements spéciaux"],
};

const APP_INFO={
  apple:{url:()=>"webcal://calendrier-fr.tibotsr.dev/calendrier.ics",sub:()=>"webcal://calendrier-fr.tibotsr.dev/calendrier.ics",steps:`<span class="sn">1</span> Copiez l'URL ci-dessus &nbsp;·&nbsp; <span class="sn">2</span> Sur <strong>iPhone</strong> : Réglages → Calendrier → Comptes → Ajouter un compte → Autre → Abonnement calendrier → collez &nbsp;·&nbsp; <span class="sn">3</span> Sur <strong>Mac</strong> : Calendar → Fichier → Nouvel abonnement calendrier`},
  google:{url:()=>"https://calendrier-fr.tibotsr.dev/calendrier.ics",sub:()=>`https://calendar.google.com/calendar/r?cid=${encodeURIComponent("https://calendrier-fr.tibotsr.dev/calendrier.ics")}`,steps:`<span class="sn">1</span> Copiez l'URL ci-dessus &nbsp;·&nbsp; <span class="sn">2</span> Google Calendar → <strong>+ Autres agendas → À partir d'une URL</strong> → collez et validez &nbsp;·&nbsp; <em style="opacity:.65">Note : Google peut prendre 12-24h pour la première sync.</em>`},
  outlook:{url:()=>"webcal://calendrier-fr.tibotsr.dev/calendrier.ics",sub:()=>`https://outlook.live.com/calendar/0/deeplink/compose?rru=addsubscription&url=${encodeURIComponent("https://calendrier-fr.tibotsr.dev/calendrier.ics")}`,steps:`<span class="sn">1</span> Cliquez <strong>S'abonner maintenant</strong> ci-dessous — Outlook s'ouvre automatiquement &nbsp;·&nbsp; <em style="opacity:.65">ou</em> : Calendrier → Ajouter un calendrier → S'abonner par Internet → collez`},
};

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function pd(s){if(!s)return null;const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);}
function fmt(d){return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"long",year:"numeric"}).format(d);}
function fmts(d){return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short"}).format(d);}
function fmtwd(d){return new Intl.DateTimeFormat("fr-FR",{weekday:"short"}).format(d).replace('.','');}
function norm(s){return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}

const APP_LOADER_STARTED_AT=Date.now();
function hideAppLoader(){
  const loader=document.getElementById("app-loader");
  if(!loader)return;
  const elapsed=Date.now()-APP_LOADER_STARTED_AT;
  const wait=Math.max(0,300-elapsed);
  setTimeout(()=>{
    loader.classList.add("done");
    document.body.classList.remove("app-loading");
    setTimeout(()=>loader.remove(),260);
  },wait);
}
window.addEventListener("load",()=>setTimeout(hideAppLoader,1200),{once:true});

/* ══════════════════════════════════════
   THEME
══════════════════════════════════════ */
function gth(){const s=localStorage.getItem(TK);return s||(window.matchMedia("(prefers-color-scheme:light)").matches?"light":"dark");}
function ath(t,sv=true){
  document.documentElement.setAttribute("data-theme",t);
  const btn=document.getElementById("theme-btn");
  const lbl=document.getElementById("theme-label");
  if(btn){
    if(t==="dark"){
      btn.textContent="☀️";
      btn.setAttribute("aria-label","Passer en thème clair");
      btn.setAttribute("title","Passer en thème clair");
    }else{
      btn.textContent="🌙";
      btn.setAttribute("aria-label","Passer en thème sombre");
      btn.setAttribute("title","Passer en thème sombre");
    }
  }
  if(lbl) lbl.textContent=t==="dark"?"Thème sombre":"Thème clair";
  if(sv)localStorage.setItem(TK,t);
}
document.getElementById("theme-btn").addEventListener("click",()=>ath(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark"));
ath(gth(),false);

/* ══════════════════════════════════════
   SYNC DATE
══════════════════════════════════════ */
function setSyncAge(dt){
  const el=document.getElementById("sync-age");
  const pill=document.getElementById("sync-pill");
  if(!el)return;
  if(!dt){el.textContent="";if(pill)pill.title="";return;}

  const d=new Date(dt);
  if(Number.isNaN(d.getTime())){el.textContent="";if(pill)pill.title="";return;}

  const abs=new Intl.DateTimeFormat("fr-FR",{
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
  }).format(d);

  el.textContent=`· ${abs}`;
  if(pill)pill.title=`Dernière synchronisation : ${abs}`;
}

/* ══════════════════════════════════════
   ZONE FINDER
══════════════════════════════════════ */
const SAMPLE_CITIES=["Paris","Lyon","Marseille","Toulouse","Nice","Bordeaux","Strasbourg","Nantes","Montpellier","Lille","Rennes","Grenoble","Le Mans","Caen","Nancy","Dijon","Besançon","Le Havre","Rouen","Toulon","Perpignan","Aix","Cergy","Créteil","Bayonne","Angers"];
let ZONE_DEPT={A:new Set(),B:new Set(),C:new Set()};
let ZONE_DEPT_PROMISE=null;
const ZONE_CACHE=new Map();

function zoneFromDepartment(dep, deptMap){
  if(!dep)return null;
  const key=String(dep).toUpperCase();
  if(deptMap.A.has(key))return "A";
  if(deptMap.B.has(key))return "B";
  if(deptMap.C.has(key))return "C";
  return null;
}

async function loadZoneDepartments(){
  if(ZONE_DEPT_PROMISE)return ZONE_DEPT_PROMISE;
  ZONE_DEPT_PROMISE=(async()=>{
    const resp=await fetch("/zone-departments.json",{cache:"force-cache"});
    if(!resp.ok)throw new Error("Impossible de charger la table des zones");
    const data=await resp.json();
    ZONE_DEPT={
      A:new Set((data?.A||[]).map(v=>String(v).toUpperCase())),
      B:new Set((data?.B||[]).map(v=>String(v).toUpperCase())),
      C:new Set((data?.C||[]).map(v=>String(v).toUpperCase())),
    };
    return ZONE_DEPT;
  })();
  return ZONE_DEPT_PROMISE;
}

function mapCommuneToZoneEntry(city, deptMap){
  if(!city||!city.departement||!city.departement.code)return null;
  const zone=zoneFromDepartment(city.departement.code,deptMap);
  if(!zone)return null;
  return {
    cityName:city.nom,
    departmentName:city.departement.nom,
    departmentCode:city.departement.code,
    zone,
    population:Number(city.population)||0,
  };
}

function dedupeEntries(entries){
  const seen=new Set();
  return entries.filter(e=>{
    const key=`${norm(e.cityName)}|${String(e.departmentCode).toUpperCase()}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

async function findZoneEntriesByApi(rawValue){
  const q=rawValue.trim();
  if(!q)return [];
  const cacheKey=norm(q);
  if(ZONE_CACHE.has(cacheKey))return ZONE_CACHE.get(cacheKey);
  const deptMap=await loadZoneDepartments();
  const endpoint=`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,departement,code,population&boost=population&limit=10`;
  const resp=await fetch(endpoint);
  if(!resp.ok)throw new Error("Service de géolocalisation indisponible");
  const rows=await resp.json();
  const mapped=(Array.isArray(rows)?rows:[])
    .map(city=>mapCommuneToZoneEntry(city,deptMap))
    .filter(Boolean);

  const rawNorm=norm(q);
  const exact=mapped.filter(e=>norm(e.cityName)===rawNorm);
  const starts=mapped.filter(e=>norm(e.cityName).startsWith(rawNorm));
  const selected=(exact.length?exact:(starts.length?starts:mapped))
    .sort((a,b)=>b.population-a.population);

  const result=dedupeEntries(selected);
  ZONE_CACHE.set(cacheKey,result);
  return result;
}

function renderZoneSingleResult(res, entry){
  const zc=entry.zone==="A"?"zt-a":entry.zone==="B"?"zt-b":"zt-c";
  res.classList.remove("multi");
  res.innerHTML=`<strong style="font-size:16px">${entry.cityName}</strong> <span style="color:var(--t3)">(${entry.departmentName} · ${entry.departmentCode})</span> → <span class="zt ${zc}">Zone ${entry.zone}</span>`;
}

(function(){
  const chips=document.getElementById("zf-chips");
  SAMPLE_CITIES.forEach(city=>{
    const b=document.createElement("button");
    b.className="zchip";b.textContent=city;
    b.addEventListener("click",()=>{document.getElementById("zf-in").value=city;runZoneSearch();});
    chips.appendChild(b);
  });
  document.getElementById("zf-btn").addEventListener("click",runZoneSearch);
  document.getElementById("zf-in").addEventListener("keydown",e=>{if(e.key==="Enter")runZoneSearch();});
})();

async function runZoneSearch(){
  const raw=document.getElementById("zf-in").value.trim();
  const res=document.getElementById("zf-res");
  const btn=document.getElementById("zf-btn");
  if(!raw){res.classList.remove("on");return;}
  btn.disabled=true;btn.style.opacity=".7";btn.textContent="Recherche…";
  try{
    const entries=await findZoneEntriesByApi(raw);
    if(entries.length===1){
      renderZoneSingleResult(res,entries[0]);
    }else if(entries.length>1){
      res.classList.add("multi");
      res.innerHTML=`<div class="zpick-head">Plusieurs communes trouvées pour <strong>${raw}</strong>. Choisissez la bonne :</div><div class="zpick-list"></div>`;
      const list=res.querySelector(".zpick-list");
      entries.slice(0,8).forEach(entry=>{
        const zc=entry.zone==="A"?"zt-a":entry.zone==="B"?"zt-b":"zt-c";
        const b=document.createElement("button");
        b.className="zpick";
        b.type="button";
        b.innerHTML=`<span><span class="zpick-main">${entry.cityName}</span><br><span class="zpick-sub">${entry.departmentName} · ${entry.departmentCode}</span></span><span class="zt ${zc}">Zone ${entry.zone}</span>`;
        b.addEventListener("click",()=>renderZoneSingleResult(res,entry));
        list.appendChild(b);
      });
    }else{
      res.classList.remove("multi");
      res.innerHTML=`<span style="color:var(--t3)">Ville non trouvée ou zone scolaire indisponible pour cette entrée.</span>`;
    }
  }catch{
    res.classList.remove("multi");
    res.innerHTML=`<span style="color:var(--t3)">Impossible de contacter l'API pour le moment. Vérifiez votre connexion et réessayez.</span>`;
  }finally{
    res.classList.add("on");btn.disabled=false;btn.style.opacity="";btn.textContent="Trouver ma zone";
  }
}

/* ══════════════════════════════════════
   ZONE HINT (simple panel)
══════════════════════════════════════ */
let openZone=null;
function toggleZoneHint(zone,el){
  const hint=document.getElementById("zhint");
  document.querySelectorAll(".zcard").forEach(c=>c.classList.remove("open"));
  if(openZone===zone&&hint.classList.contains("on")){hint.classList.remove("on");openZone=null;return;}
  openZone=zone;el.classList.add("open");
  const ci={A:"Lyon, Bordeaux, Grenoble, Clermont-Ferrand, Limoges, Nantes, Rennes, Caen, Angers, Poitiers, Le Mans, Tours, Orléans",B:"Paris, Versailles, Lille, Amiens, Nancy, Metz, Reims, Strasbourg, Besançon, Dijon, Rouen, Le Havre, Caen",C:"Aix-Marseille, Nice, Montpellier, Toulouse, Toulon, Nîmes, Perpignan, Avignon, Bayonne, Pau, Albi, Rodez"};
  hint.innerHTML=`<strong>Zone ${zone}</strong> — <span style="color:var(--t3);font-size:12px">${ci[zone]}</span><br><div style="margin-top:10px;font-size:13px;color:var(--t2)">Ce fichier contient les <strong>jours fériés nationaux</strong> + les vacances de la <strong>Zone ${zone}</strong> uniquement.<br><span class="sn">1</span> Téléchargez &nbsp; <span class="sn">2</span> Ouvrez le fichier — votre appli calendrier proposera l'import</div><div class="zhint-btns"><a href="/zone-${zone.toLowerCase()}.ics" class="bp">⬇️ Télécharger Zone ${zone}</a><a href="webcal://calendrier-fr.tibotsr.dev/zone-${zone.toLowerCase()}.ics" class="bs">⚡ S'abonner Zone ${zone}</a></div>`;
  hint.classList.add("on");
}

/* ══════════════════════════════════════
   TABS
══════════════════════════════════════ */
document.querySelectorAll(".tbtn2").forEach(b=>{
  b.addEventListener("click",()=>{
    document.querySelectorAll(".tbtn2").forEach(x=>{x.classList.remove("on");x.setAttribute("aria-selected","false");});
    document.querySelectorAll(".tpanel").forEach(x=>x.classList.remove("on"));
    b.classList.add("on");b.setAttribute("aria-selected","true");
    document.getElementById("tp-"+b.dataset.t).classList.add("on");
  });
});

/* ══════════════════════════════════════
   APP PICKER
══════════════════════════════════════ */
let selApp="apple";
function updateApp(){
  const i=APP_INFO[selApp];
  document.getElementById("simple-url").textContent=i.url();
  document.getElementById("sub-btn").href=i.sub();
  document.getElementById("app-steps").innerHTML=i.steps;
}
document.querySelectorAll(".abtn").forEach(b=>{
  b.addEventListener("click",()=>{document.querySelectorAll(".abtn").forEach(x=>x.classList.remove("on"));b.classList.add("on");selApp=b.dataset.app;updateApp();});
});
updateApp();

function mkCopy(id,get){
  const b=document.getElementById(id);if(!b)return;
  b.addEventListener("click",function(){navigator.clipboard.writeText(get()).then(()=>{const o=this.textContent;this.textContent="Copié ✓";this.classList.add("ok");setTimeout(()=>{this.textContent=o;this.classList.remove("ok");},2000);});});
}
mkCopy("cp-simple",()=>document.getElementById("simple-url").textContent);
mkCopy("cp-adv",()=>document.getElementById("adv-url").textContent);

/* ══════════════════════════════════════
   PROFILES
══════════════════════════════════════ */
let activeP="complet";
document.querySelectorAll(".pc").forEach(c=>{
  c.addEventListener("click",()=>{
    document.querySelectorAll(".pc").forEach(x=>x.classList.remove("on"));
    c.classList.add("on");activeP=c.dataset.p;
    const al=PROFILES[activeP];
    document.querySelectorAll("#adv-cats .ctog").forEach(t=>{const chk=al===null||al.includes(t.dataset.name);t.querySelector("input").checked=chk;t.classList.toggle("active",chk);});
    buildAdvUrl();
  });
});

/* ══════════════════════════════════════
   ZONE MULTI (advanced)
══════════════════════════════════════ */
let advZones=new Set(["all"]);
document.querySelectorAll(".zmb").forEach(b=>{
  b.addEventListener("click",()=>{
    const z=b.dataset.z;
    if(z==="all"){advZones=new Set(["all"]);}
    else{advZones.delete("all");advZones.has(z)?advZones.delete(z):advZones.add(z);if(advZones.size===0)advZones.add("all");}
    document.querySelectorAll(".zmb").forEach(x=>{x.className="zmb";if(advZones.has(x.dataset.z))x.classList.add(x.dataset.z==="all"?"sall":"s"+x.dataset.z.toLowerCase());});
    buildAdvUrl();
  });
});

/* ══════════════════════════════════════
   ADV CATS — clear toggle
══════════════════════════════════════ */
function buildAdvCats(cats){
  const g=document.getElementById("adv-cats");g.innerHTML="";
  CATS.filter(def=>cats.length===0||cats.includes(def.n)).forEach(def=>{
    const l=document.createElement("label");l.className="ctog active";l.dataset.name=def.n;
    l.innerHTML=`<input type="checkbox" value="${def.n}" checked><span class="cdot" style="background:${def.c}"></span>${def.n}`;
    applyToggleStyle(l,true,def);
    l.addEventListener("click",()=>{
      const inp=l.querySelector("input");inp.checked=!inp.checked;
      l.classList.toggle("active",inp.checked);
      applyToggleStyle(l,inp.checked,def);
      buildAdvUrl();
    });
    g.appendChild(l);
  });
}
function applyToggleStyle(el,on,def){
  el.style.borderColor=on?def.b:"var(--b)";
  el.style.background=on?def.d:"transparent";
  el.style.color=on?def.c:"var(--t3)";
}

function buildAdvUrl(){
  const zones=advZones.has("all")?"all":[...advZones].join(",");
  const alarm=document.getElementById("adv-alarm")?.value||"none";
  const cats=[...document.querySelectorAll("#adv-cats input:checked")].map(i=>i.value);
  const p=new URLSearchParams({zone:zones,alarm,cats:cats.join(",")});
  const wc=`webcal://calendrier-fr.tibotsr.dev/calendrier.ics?${p}`;
  const ht=`https://calendrier-fr.tibotsr.dev/calendrier.ics?${p}`;
  const el=document.getElementById("adv-url");if(el)el.textContent=wc;
  const s=document.getElementById("adv-sub");if(s)s.href=wc;
  const gg=document.getElementById("adv-ggl");if(gg)gg.href=`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ht)}`;
  const oo=document.getElementById("adv-out");if(oo)oo.href=`https://outlook.live.com/calendar/0/deeplink/compose?rru=addsubscription&url=${encodeURIComponent(ht)}`;
}
document.getElementById("adv-alarm")?.addEventListener("change",buildAdvUrl);
buildAdvUrl();

/* ══════════════════════════════════════
   PERSONAL EVENTS
══════════════════════════════════════ */
let personalEvts=[];
const REC_LABELS={none:"Une seule fois",yearly:"Chaque année",monthly:"Chaque mois",weekly:"Chaque semaine"};
function loadPE(){try{const r=localStorage.getItem(PEK);personalEvts=r?JSON.parse(r):[];}catch{personalEvts=[];}}
function savePE(){try{localStorage.setItem(PEK,JSON.stringify(personalEvts));}catch{}}
function renderPEList(){
  const el=document.getElementById("pe-list");if(!el)return;
  if(!personalEvts.length){el.innerHTML='<div class="pe-empty">Aucun événement personnel ajouté.</div>';return;}
  el.innerHTML=personalEvts.map((e,i)=>`<div class="pe-item"><div class="pe-item-info"><div class="pe-item-title">${e.title}</div><div class="pe-item-meta">${e.date} · ${REC_LABELS[e.rec||"none"]}</div></div><button class="pe-del" data-i="${i}">✕</button></div>`).join("");
  el.querySelectorAll(".pe-del").forEach(b=>b.addEventListener("click",()=>{personalEvts.splice(Number(b.dataset.i),1);savePE();renderPEList();}));
}
loadPE();
document.getElementById("pe-add-btn").addEventListener("click",()=>{
  const title=document.getElementById("pe-title").value.trim();
  const date=document.getElementById("pe-date").value;
  const rec=document.getElementById("pe-rec").value;
  if(!title||!date)return;
  personalEvts.push({title,date,rec});personalEvts.sort((a,b)=>a.date.localeCompare(b.date));
  savePE();renderPEList();
  document.getElementById("pe-title").value="";
});
renderPEList();

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let srcEvts=[],allEvts=[],curYear=new Date().getFullYear(),curMonth="all",showPast=false,renderedMonths=0,expZone="all";

/* ══════════════════════════════════════
   SIDEBAR FILTERS — clear on/off
══════════════════════════════════════ */
function getSelCats(){return[...document.querySelectorAll("#sb-cats .scat.active")].map(el=>el.dataset.cat);}
function buildSbCats(cats){
  const counts=new Map();srcEvts.forEach(e=>(e.categories||[]).forEach(c=>counts.set(c,(counts.get(c)||0)+1)));
  const g=document.getElementById("sb-cats");g.innerHTML="";
  cats.forEach(cat=>{
    const def=cd(cat);
    const el=document.createElement("div");el.className="scat active";el.dataset.cat=cat;
    el.innerHTML=`<input type="checkbox" checked style="display:none"><span class="sc-dot" style="background:${def.c}"></span><span class="sc-name">${cat}</span><span class="sc-cnt">${counts.get(cat)||0}</span>`;
    el.title=`Cliquer pour ${el.classList.contains("active")?"désactiver":"activer"} "${cat}"`;
    el.addEventListener("click",()=>{
      el.classList.toggle("active");
      el.title=`Cliquer pour ${el.classList.contains("active")?"désactiver":"activer"} "${cat}"`;
      try{localStorage.setItem(FK,JSON.stringify(getSelCats()));}catch{}
      renderedMonths=0;refreshAll();
    });
    g.appendChild(el);
  });
  try{const s=JSON.parse(localStorage.getItem(FK));if(Array.isArray(s)){const set=new Set(s);g.querySelectorAll(".scat").forEach(el=>{el.classList.toggle("active",set.has(el.dataset.cat));});}}catch{}
}
document.getElementById("sb-rst").addEventListener("click",()=>{
  document.querySelectorAll("#sb-cats .scat").forEach(el=>el.classList.add("active"));
  localStorage.removeItem(FK);renderedMonths=0;refreshAll();
});
document.querySelectorAll(".szp").forEach(b=>{
  b.addEventListener("click",()=>{
    expZone=b.dataset.z;
    document.querySelectorAll(".szp").forEach(x=>{x.className="szp";if(x.dataset.z===expZone)x.classList.add(expZone==="all"?"sall":"s"+expZone.toLowerCase());});
    renderedMonths=0;refreshAll();
  });
});
document.getElementById("srch").addEventListener("input",()=>{renderedMonths=0;refreshAll();});

/* ══════════════════════════════════════
   FILTER ENGINE
══════════════════════════════════════ */
function getFiltered(){
  const search=norm(document.getElementById("srch").value.trim());
  const selCats=new Set(getSelCats());
  return srcEvts.filter(e=>{
    const cOk=(e.categories||[]).some(c=>selCats.has(c));
    const zOk=expZone==="all"||!(e.zones||[]).length||e.zones.includes(expZone);
    const sOk=!search||norm(e.summary).includes(search)||norm(e.description||"").includes(search);
    return cOk&&zOk&&sOk;
  }).map(e=>({...e,date:pd(e.start),endDate:pd(e.end)})).sort((a,b)=>a.date-b.date||a.summary.localeCompare(b.summary,"fr"));
}

/* ══════════════════════════════════════
   RADAR
══════════════════════════════════════ */
function renderRadar(evts){
  const root=document.getElementById("r-root"),cnt=document.getElementById("r-cnt");
  root.innerHTML="";
  const today=new Date();today.setHours(0,0,0,0);
  const end=new Date(today);end.setDate(end.getDate()+21);
  const items=evts.filter(e=>e.date<=end&&(e.endDate||e.date)>=today).slice(0,10);
  if(!items.length){root.innerHTML='<span style="font-size:13px;color:var(--t3)">Aucun événement dans les 3 prochaines semaines.</span>';cnt.textContent="";return;}
  cnt.textContent=`${items.length} en approche`;
  items.forEach(e=>{const c=document.createElement("div");c.className="rc";c.innerHTML=`<div class="rc-date">${fmts(e.date)}</div><div class="rc-name">${e.summary}</div>`;c.addEventListener("click",()=>openModal(e,allEvts));root.appendChild(c);});
}

/* ══════════════════════════════════════
   YEAR NAV
══════════════════════════════════════ */
function buildYrNav(years){
  const sel=document.getElementById("yr-s");sel.innerHTML="";
  [...years].sort((a,b)=>b-a).forEach(y=>{const o=document.createElement("option");o.value=y;o.textContent=String(y);sel.appendChild(o);});
  sel.value=String(curYear);
}
document.getElementById("yr-s").addEventListener("change",function(){curYear=Number(this.value);curMonth="all";renderedMonths=0;try{localStorage.setItem(YK,String(curYear));}catch{}renderTL();});
document.getElementById("yr-p").addEventListener("click",()=>shiftYr(-1));
document.getElementById("yr-n").addEventListener("click",()=>shiftYr(1));
function shiftYr(d){
  const opts=[...document.getElementById("yr-s").options].map(o=>Number(o.value)).sort((a,b)=>a-b);
  const i=opts.indexOf(curYear),n=opts[Math.max(0,Math.min(opts.length-1,i+d))];
  if(n!==curYear){curYear=n;curMonth="all";renderedMonths=0;document.getElementById("yr-s").value=String(curYear);try{localStorage.setItem(YK,String(curYear));}catch{}renderTL();}
}
document.getElementById("btn-today").addEventListener("click",()=>{
  curYear=new Date().getFullYear();curMonth="all";showPast=false;renderedMonths=0;
  document.getElementById("yr-s").value=String(curYear);
  try{localStorage.setItem(YK,String(curYear));}catch{}
  refreshAll({autoScrollToday:true});
});

/* ══════════════════════════════════════
   TIMELINE — scroll de la PAGE (plus de scroll interne)
   L'IntersectionObserver observe le sentinel par rapport au viewport.
══════════════════════════════════════ */
function renderTL(opts={}){
  const root=document.getElementById("ev-root"),moNav=document.getElementById("mo-nav");
  root.innerHTML="";moNav.innerHTML="";
  const today=new Date();today.setHours(0,0,0,0);
  const thisYr=new Date().getFullYear();
  const yEvts=allEvts.filter(e=>e.date.getFullYear()===curYear);
  // group by month (0-11 key)
  const grp=new Map();
  yEvts.forEach(e=>{const k=e.date.getMonth();if(!grp.has(k))grp.set(k,[]);grp.get(k).push(e);});
  const allMonthEntries=[...grp.entries()].sort((a,b)=>a[0]-b[0]);
  const isCurYr=curYear===thisYr;
  // Month nav
  const aBtn=document.createElement("button");aBtn.className="mb"+(curMonth==="all"?" on":"");aBtn.textContent="Tout";
  aBtn.addEventListener("click",()=>{curMonth="all";renderedMonths=0;renderTL();});moNav.appendChild(aBtn);
  allMonthEntries.forEach(([k])=>{
    const b=document.createElement("button");b.className="mb"+(curMonth===k?" on":"");
    b.textContent=MONTHS[k].substring(0,4)+".";
    b.addEventListener("click",()=>{curMonth=k;renderedMonths=0;renderTL();});
    moNav.appendChild(b);
  });
  // Filter to active month
  const filtered=curMonth==="all"?allMonthEntries:allMonthEntries.filter(([k])=>k===curMonth);
  if(!filtered.length){root.innerHTML='<div class="empty"><div class="empty-ico">📭</div><p>Aucun événement pour cette sélection.</p></div>';return;}

  // Quand un mois spécifique est sélectionné : affichage direct, sans logique past/future
  if(curMonth!=="all"){
    filtered.forEach(([k,e])=>{
      const isPast=new Date(curYear,k+1,0)<today;
      root.appendChild(buildMoBlock(k,e,today,isPast));
    });
    if(opts.autoScrollToday&&isCurYr){setTimeout(()=>scrollToToday(),80);}
    return;
  }

  // Split past / future (uniquement en vue "Tout" de l'année courante)
  const pastEntries  = isCurYr ? filtered.filter(([k])=>new Date(curYear,k+1,0)<today) : [];
  const futureEntries= isCurYr ? filtered.filter(([k])=>!pastEntries.some(([pk])=>pk===k)) : filtered;

  // How many months to render initially (for infinite scroll)
  const totalFuture=futureEntries.length;
  const toRenderFuture=Math.min(totalFuture,Math.max(CHUNK,renderedMonths||CHUNK));

  // -- PAST --
  if(isCurYr&&pastEntries.length){
    if(!showPast){
      const cnt=pastEntries.reduce((a,[,e])=>a+e.length,0);
      const b=document.createElement("button");b.className="show-past-btn";
      b.innerHTML=`▲ Afficher les mois passés (${pastEntries.length} mois, ${cnt} événements)`;
      b.addEventListener("click",()=>{showPast=true;renderTL();setTimeout(()=>scrollToToday(),120);});
      root.appendChild(b);
    }else{
      const pd_div=document.createElement("div");pd_div.innerHTML='<div class="past-line">Passé</div>';root.appendChild(pd_div);
      pastEntries.forEach(([k,e])=>root.appendChild(buildMoBlock(k,e,today,true)));
    }
  }

  // -- FUTURE --
  const sliced=futureEntries.slice(0,toRenderFuture);
  if(!sliced.length&&isCurYr){
    root.innerHTML+='<div class="empty"><div class="empty-ico">🎉</div><p>Aucun événement à venir cette année.</p></div>';
  }
  (isCurYr?sliced:filtered.slice(0,toRenderFuture)).forEach(([k,e])=>root.appendChild(buildMoBlock(k,e,today,false)));

  if(opts.autoScrollToday&&isCurYr){
    setTimeout(()=>scrollToToday(),80);
  }

  // IntersectionObserver pour l'infinite scroll
  // On observe le sentinel par rapport au VIEWPORT (pas d'un container)
  if(curMonth==="all"){
    const sentinel=document.getElementById("tl-sentinel");
    if(window._tlObserver)window._tlObserver.disconnect();
    if(toRenderFuture<totalFuture){
      window._tlObserver=new IntersectionObserver(entries=>{
        if(entries[0].isIntersecting){
          renderedMonths=toRenderFuture+CHUNK;
          renderTL();
        }
      },{
        root:null,          // viewport de la page
        rootMargin:"200px"  // déclencher un peu avant d'atteindre le bas
      });
      window._tlObserver.observe(sentinel);
    }
  }
}

/* scrollToToday — utilise window.scrollTo pour scroller la PAGE */
function getStickyOffset(){
  const topbar=document.querySelector(".topbar");
  const topbarH=topbar?topbar.getBoundingClientRect().height:0;

  // Sur desktop, la barre explorer est sticky sous la topbar
  let explorerBarH=0;
  if(window.innerWidth>=861){
    const exTb=document.querySelector(".ex-tb");
    explorerBarH=exTb?exTb.getBoundingClientRect().height:0;
  }

  return topbarH+explorerBarH+10;
}

function scrollToToday(){
  const marker=document.getElementById("today-marker");
  if(!marker)return;
  const rect=marker.getBoundingClientRect();
  const stickyOffset=getStickyOffset();
  const targetY=window.scrollY+rect.top-stickyOffset;
  window.scrollTo({top:Math.max(0,targetY),behavior:"smooth"});
}

function buildMoBlock(k,evts,today,isPast){
  const block=document.createElement("div");block.className="mo-block anim";
  const h=document.createElement("div");h.className="mo-h"+(isPast?" past":"");
  h.innerHTML=`${MONTHS[k]} ${curYear} <span class="mo-cnt">${evts.length}</span>`;
  block.appendChild(h);
  const list=document.createElement("div");list.className="ev-list";
  const isCurrentMonthBlock=(curYear===today.getFullYear()&&k===today.getMonth());
  const splitIndex=evts.findIndex(ev=>(ev.endDate||ev.date)>=today);
  const hasPast=evts.some(ev=>(ev.endDate||ev.date)<today);
  const hasUpcoming=splitIndex!==-1;

  function appendTodayMarker(){
    const marker=document.createElement("div");
    marker.id="today-marker";
    const todayStr=new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"2-digit",month:"long"}).format(today);
    marker.innerHTML=`<div class="today-line">Aujourd'hui · ${todayStr}</div>`;
    list.appendChild(marker);
  }

  if(isCurrentMonthBlock){
    if(hasPast&&hasUpcoming){
      // marqueur entre dernier événement passé et prochain
      evts.forEach((ev,index)=>{
        if(index===splitIndex)appendTodayMarker();
        const row=document.createElement("div");row.className="ev-row";
        const isToday=ev.date.getTime()===today.getTime();
        const pastEv=(ev.endDate||ev.date)<today;
        if(isToday)row.classList.add("today-ev");
        if(pastEv&&!isToday)row.classList.add("past-ev");
        const cat=(ev.categories||[])[0]||"Divers";const def=cd(cat);
        row.innerHTML=`
          <div class="ev-d" style="border-color:${isPast?"var(--b)":def.b};background:${isPast?"var(--bg2)":def.d}">
            <span class="ev-day" style="color:${isPast?"var(--t3)":def.c}">${ev.date.getDate()}</span>
            <span class="ev-wd">${fmtwd(ev.date)}</span>
          </div>
          <div class="ev-b">
            <div class="ev-title">${ev.summary}</div>
            <div class="ev-tags"><span class="ev-tag" style="background:${def.d};color:${def.c};border:1px solid ${def.b}">${cat}</span>${ev.zones&&ev.zones.length?`<span class="ev-tag" style="background:var(--bg3);color:var(--t3)">${ev.zones.join(", ")}</span>`:""}</div>
          </div>
          <span class="ev-arr">›</span>`;
        row.addEventListener("click",()=>openModal(ev,allEvts));
        list.appendChild(row);
      });
      block.appendChild(list);return block;
    }
    if(!hasPast&&hasUpcoming){
      appendTodayMarker();
    }
  }

  evts.forEach(ev=>{
    const row=document.createElement("div");row.className="ev-row";
    const isToday=ev.date.getTime()===today.getTime();
    const pastEv=(ev.endDate||ev.date)<today;
    if(isToday)row.classList.add("today-ev");
    if(pastEv&&!isToday)row.classList.add("past-ev");
    const cat=(ev.categories||[])[0]||"Divers";const def=cd(cat);
    row.innerHTML=`
      <div class="ev-d" style="border-color:${isPast?"var(--b)":def.b};background:${isPast?"var(--bg2)":def.d}">
        <span class="ev-day" style="color:${isPast?"var(--t3)":def.c}">${ev.date.getDate()}</span>
        <span class="ev-wd">${fmtwd(ev.date)}</span>
      </div>
      <div class="ev-b">
        <div class="ev-title">${ev.summary}</div>
        <div class="ev-tags"><span class="ev-tag" style="background:${def.d};color:${def.c};border:1px solid ${def.b}">${cat}</span>${ev.zones&&ev.zones.length?`<span class="ev-tag" style="background:var(--bg3);color:var(--t3)">${ev.zones.join(", ")}</span>`:""}</div>
      </div>
      <span class="ev-arr">›</span>`;
    row.addEventListener("click",()=>openModal(ev,allEvts));
    list.appendChild(row);
  });

  if(isCurrentMonthBlock&&hasPast&&!hasUpcoming){
    appendTodayMarker();
  }

  block.appendChild(list);return block;
}

/* ══════════════════════════════════════
   MODAL
══════════════════════════════════════ */
function openModal(ev,evts){
  const same=evts.filter(e=>e.summary===ev.summary).sort((a,b)=>a.date-b.date);
  const currentTs=ev.date.getTime();
  const prev=[...same].reverse().find(e=>e.date.getTime()<currentTs);
  const next=same.find(e=>e.date.getTime()>currentTs);
  document.getElementById("m-ttl").textContent=ev.summary;
  document.getElementById("m-prev").textContent=prev?fmt(prev.date):"Aucune donnée";
  document.getElementById("m-next").textContent=next?fmt(next.date):"Aucune prévision";
  document.getElementById("m-desc").innerHTML=ev.description?ev.description.replace(/\n/g,"<br>"):"<i style='color:var(--t3)'>Aucune description.</i>";
  document.getElementById("ev-modal").classList.add("on");
}
document.getElementById("m-cl").addEventListener("click",()=>document.getElementById("ev-modal").classList.remove("on"));
document.getElementById("ev-modal").addEventListener("click",e=>{if(e.target===document.getElementById("ev-modal"))document.getElementById("ev-modal").classList.remove("on");});
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.getElementById("ev-modal").classList.remove("on");});

/* ══════════════════════════════════════
   REFRESH
══════════════════════════════════════ */
function refreshAll(opts={}){
  const savedY=window.scrollY;
  allEvts=getFiltered();
  renderRadar(allEvts);
  renderTL(opts);
  if(!opts.autoScrollToday){
    // Micro-délai pour laisser le DOM se peindre avant de restaurer
    requestAnimationFrame(()=>window.scrollTo({top:savedY,behavior:"instant"}));
  }
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
async function init(){
  try{
    const res=await fetch("/calendrier.json",{cache:"no-store"});
    if(!res.ok)throw new Error("HTTP "+res.status);
    const data=await res.json();
    srcEvts=data.events||[];
    setSyncAge(
      data.generatedAt ||
      data.generated ||
      data.lastUpdated ||
      data.updatedAt ||
      data.generated_at ||
      null
    );
    const years=[...new Set(srcEvts.map(e=>pd(e.start)?.getFullYear()).filter(Boolean))];
    const thisYr=new Date().getFullYear();
    try{const s=Number(localStorage.getItem(YK));curYear=(s&&years.includes(s))?s:(years.includes(thisYr)?thisYr:([...years].sort().reverse()[0]||thisYr));}catch{curYear=thisYr;}
    buildYrNav(years);document.getElementById("yr-s").value=String(curYear);
    const cats=[...new Set(srcEvts.flatMap(e=>e.categories||[]))].sort();
    buildSbCats(cats);buildAdvCats(cats);
    refreshAll();
  }catch(err){
    document.getElementById("ev-root").innerHTML=`<div class="empty"><div class="empty-ico">⚠️</div><p>Impossible de charger les données.<br><small style="color:var(--t3)">${err.message}</small></p></div>`;
  }finally{
    hideAppLoader();
  }
}
init();

/* ══════════════════════════════════════
   TUTORIEL PREMIÈRE VISITE
══════════════════════════════════════ */
(function() {
  var DONE_KEY = 'cal_tuto_v5';
  var PAD  = 10;
  var TOPBAR = 60;
  var GAP  = 16;

  var STEPS = [
    {
      sel:     '#tp-simple .sp',
      icon:    '⚡',
      title:   'Synchronisez votre agenda',
      desc:    'Choisissez votre appli (iPhone, Google, Outlook), copiez le lien et cliquez "S\'abonner". Le calendrier se mettra à jour tout seul, pour toujours.',
      onEnter: function() {
        var b = document.querySelector('[data-t="simple"]');
        if (b && !b.classList.contains('on')) b.click();
        document.querySelector('#sync').scrollIntoView({behavior:'smooth',block:'center'});
      },
    },
    {
      sel:     '#zone .zone-sec',
      icon:    '📍',
      title:   'Trouvez votre zone scolaire',
      desc:    'Tapez votre ville pour savoir si vous êtes Zone A, B ou C. Indispensable pour synchroniser les bonnes vacances scolaires.',
      placement: 'above',
      onEnter: function() {
        document.querySelector('#zone').scrollIntoView({behavior:'smooth',block:'center'});
      },
    },
    {
      sel:     '#tp-advanced .adv',
      icon:    '⚙️',
      title:   'Personnalisez votre abonnement',
      desc:    'Profil, zones multiples, catégories à la carte, événements personnels — tout se configure ici dans l\'onglet Avancé.',
      onEnter: function() {
        var b = document.querySelector('[data-t="advanced"]');
        if (b && !b.classList.contains('on')) b.click();
        document.querySelector('#sync').scrollIntoView({behavior:'smooth',block:'center'});
      },
    },
    {
      sel:     '#explorer .sidebar',
      icon:    '🏷️',
      title:   'Filtrez par catégorie',
      desc:    'Activez ou désactivez les catégories pour n\'afficher que les événements qui vous intéressent. Les changements sont immédiats.',
      onEnter: function() {
        var b = document.querySelector('[data-t="simple"]');
        if (b && !b.classList.contains('on')) b.click();
        document.querySelector('#explorer').scrollIntoView({behavior:'smooth',block:'start'});
      },
    },
    {
      sel:     '#explorer .radar',
      icon:    '📡',
      title:   'Les prochains événements',
      desc:    'Le radar affiche les événements des 21 prochains jours. Cliquez sur une carte pour voir la fiche détaillée avec occurrences passées et futures.',
      isLast:  true,
      onEnter: function() {
        document.querySelector('#explorer').scrollIntoView({behavior:'smooth',block:'start'});
      },
    },
  ];

  var step    = 0;
  var welcome = document.getElementById('tuto-welcome');
  var overlay = document.getElementById('tuto-overlay');
  var spot    = document.getElementById('tuto-spot');
  var card    = document.getElementById('tuto-card');
  var arrow   = document.getElementById('tuto-arrow');
  var rafId   = null;

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function buildDots() {
    var c = document.getElementById('tuto-dots');
    c.innerHTML = '';
    STEPS.forEach(function(_, i) {
      var d = document.createElement('div');
      d.className = 'tuto-dot'; d.id = 'tdot' + i;
      c.appendChild(d);
    });
  }
  function syncDots(s) {
    STEPS.forEach(function(_, i) {
      var d = document.getElementById('tdot' + i); if (!d) return;
      d.className = 'tuto-dot' + (i < s ? ' done' : i === s ? ' active' : '');
    });
  }

  function fillCard(s) {
    var st = STEPS[s];
    document.getElementById('tuto-step-label').textContent = 'Étape ' + (s+1) + ' / ' + STEPS.length;
    document.getElementById('tuto-icon').textContent  = st.icon;
    document.getElementById('tuto-title').textContent = st.title;
    document.getElementById('tuto-desc').textContent  = st.desc;
    document.getElementById('tuto-next-btn').textContent = st.isLast ? 'Terminer 🎉' : 'Suivant →';
    document.getElementById('tuto-prev-btn').disabled      = (s === 0);
    document.getElementById('tuto-prev-btn').style.opacity = s === 0 ? '0.3' : '1';
    syncDots(s);
  }

  function visibleRect(el) {
    var r  = el.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var x1 = Math.max(r.left,   0);
    var y1 = Math.max(r.top,    TOPBAR);
    var x2 = Math.min(r.right,  vw);
    var y2 = Math.min(r.bottom, vh);
    if (x2 <= x1 || y2 <= y1) return null;
    return { left: x1, top: y1, right: x2, bottom: y2, width: x2-x1, height: y2-y1 };
  }

  function positionFrame() {
    var st = STEPS[step];
    var el = document.querySelector(st.sel);
    if (!el) return;
    var vis = visibleRect(el);
    if (!vis) { return; }
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var sx = Math.max(0,   vis.left   - PAD);
    var sy = Math.max(TOPBAR, vis.top - PAD);
    var sw = Math.min(vw - sx, vis.width  + PAD * 2);
    var sh = Math.min(vh - sy, vis.height + PAD * 2);
    spot.style.left    = sx + 'px';
    spot.style.top     = sy + 'px';
    spot.style.width   = sw + 'px';
    spot.style.height  = sh + 'px';
    spot.style.display = 'block';
    var TW = Math.min(300, vw - 32);
    card.style.width = TW + 'px';
    var spL  = sx;
    var spR  = vw - sx - sw;
    var spB  = vh - sy - sh;
    var spA  = sy - TOPBAR;
    card.style.visibility = 'hidden'; card.style.top = '-9999px';
    var TH = card.offsetHeight || 200;
    card.style.visibility = ''; card.style.top = '';
    var minSide = TW + GAP + 8;
    var minVert = TH + GAP + 8;
    var tx, ty, side;
    var cx = sx + sw / 2;
    var cy = sy + sh / 2;
    function preferredToSide(p) {
      if (p === 'above') return 'bot';
      if (p === 'below') return 'top';
      if (p === 'left')  return 'right';
      if (p === 'right') return 'left';
      return null;
    }
    function sideFits(s) {
      if (s === 'left') return spR >= minSide;
      if (s === 'right') return spL >= minSide;
      if (s === 'top') return spB >= minVert;
      if (s === 'bot') return spA >= minVert;
      return false;
    }
    function sideSpace(s) {
      if (s === 'left') return spR;
      if (s === 'right') return spL;
      if (s === 'top') return spB;
      return spA;
    }
    function placeForSide(s) {
      if (s === 'left') { return { tx: sx + sw + GAP, ty: clamp(cy - TH/2, TOPBAR + 8, vh - TH - 8), side: 'left' }; }
      if (s === 'right') { return { tx: sx - GAP - TW, ty: clamp(cy - TH/2, TOPBAR + 8, vh - TH - 8), side: 'right' }; }
      if (s === 'top') { return { tx: clamp(cx - TW/2, 16, vw - TW - 16), ty: sy + sh + GAP, side: 'top' }; }
      return { tx: clamp(cx - TW/2, 16, vw - TW - 16), ty: sy - GAP - TH, side: 'bot' };
    }
    var prefSide = preferredToSide(st.placement);
    var orderedSides = [prefSide, 'left', 'right', 'top', 'bot'].filter(function(v, i, arr) {
      return v && arr.indexOf(v) === i;
    });
    var chosen = orderedSides.find(sideFits);
    if (!chosen) { chosen = orderedSides.slice().sort(function(a, b) { return sideSpace(b) - sideSpace(a); })[0]; }
    var placed = placeForSide(chosen);
    tx = placed.tx; ty = placed.ty; side = placed.side;
    var maxLeft = Math.max(8, vw - TW - 8);
    var maxTop  = Math.max(TOPBAR + 8, vh - TH - 8);
    tx = clamp(tx, 8, maxLeft);
    ty = clamp(ty, TOPBAR + 8, maxTop);
    card.style.top  = ty + 'px';
    card.style.left = tx + 'px';
    var AS = 12;
    arrow.style.cssText = 'position:absolute;width:' + AS + 'px;height:' + AS + 'px;background:var(--bg1);border:1px solid var(--ba);transform:rotate(45deg);';
    var midX = cx - tx - AS/2;
    var midY = cy - ty - AS/2;
    if (side === 'left') {
      arrow.style.left = (-AS/2) + 'px'; arrow.style.top = clamp(midY, 16, TH-30) + 'px';
      arrow.style.borderRight = 'none'; arrow.style.borderTop = 'none';
    } else if (side === 'right') {
      arrow.style.right = (-AS/2) + 'px'; arrow.style.top = clamp(midY, 16, TH-30) + 'px';
      arrow.style.borderLeft = 'none'; arrow.style.borderBottom = 'none';
    } else if (side === 'top') {
      arrow.style.top = (-AS/2) + 'px'; arrow.style.left = clamp(midX, 16, TW-30) + 'px';
      arrow.style.borderTop = 'none'; arrow.style.borderLeft = 'none';
    } else if (side === 'bot') {
      arrow.style.bottom = (-AS/2) + 'px'; arrow.style.left = clamp(midX, 16, TW-30) + 'px';
      arrow.style.borderBottom = 'none'; arrow.style.borderRight = 'none';
    }
  }

  function startTracking() {
    cancelAnimationFrame(rafId);
    spot.style.transition = 'none';
    card.style.transition = 'none';
    function loop() {
      if (!overlay.classList.contains('visible')) return;
      positionFrame();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
  }
  function stopTracking() { cancelAnimationFrame(rafId); }

  function showStep(s) {
    step = s;
    var st = STEPS[s];
    fillCard(s);
    if (st.onEnter) st.onEnter();
    setTimeout(positionFrame, 120);
  }

  function endTuto() {
    stopTracking();
    overlay.classList.remove('visible');
    spot.style.display = 'none';
    card.style.display = 'none';
    try { localStorage.setItem(DONE_KEY, '1'); } catch(e) {}
  }

  function startTuto() {
    welcome.classList.remove('visible');
    setTimeout(function() { welcome.style.display = 'none'; }, 380);
    buildDots();
    overlay.classList.add('visible');
    card.style.display = 'block';
    startTracking();
    showStep(0);
  }

  function dismissWelcome() {
    welcome.classList.remove('visible');
    setTimeout(function() { welcome.style.display = 'none'; }, 380);
    try { localStorage.setItem(DONE_KEY, '1'); } catch(e) {}
  }

  document.getElementById('tuto-start')   .addEventListener('click', startTuto);
  document.getElementById('tuto-skip-all').addEventListener('click', dismissWelcome);
  document.getElementById('tuto-skip-btn').addEventListener('click', endTuto);
  document.getElementById('tuto-next-btn').addEventListener('click', function() {
    if (step >= STEPS.length - 1) endTuto(); else showStep(step + 1);
  });
  document.getElementById('tuto-prev-btn').addEventListener('click', function() {
    if (step > 0) showStep(step - 1);
  });

  try {
    if (!localStorage.getItem(DONE_KEY)) {
      setTimeout(function() { welcome.classList.add('visible'); }, 900);
    }
  } catch(e) {}

})();

