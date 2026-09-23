const BASE_DATA = window.CA_DATA || [];
const PROGRESS_KEY = "ca_vault_progress_v1";
const CUSTOM_KEY = "ca_vault_custom_data_v1";
let customData = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
let progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
let cloud = null;
let currentUser = null;
let syncTimer = null;
let cloudReady = false;
let view = "all";
let flashIndex = 0;
let flashPool = [];
let calendarDate = new Date();

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const monthName = date => new Intl.DateTimeFormat("en-IN", { month:"long" }).format(new Date(`${date}T12:00:00`));
const DATA = () => [...BASE_DATA, ...customData];
const setSyncStatus = (text, cls="") => { const el=$("syncStatus"); if(el){el.textContent=text; el.className="sync-status "+cls;} };
const localSave = () => { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); localStorage.setItem(CUSTOM_KEY, JSON.stringify(customData)); };
const save = (rerender = true) => { localSave(); if (rerender) render(); scheduleCloudSync(); };
const saveCustom = (rerender = true) => { localSave(); if (rerender) { populate(true); render(); } scheduleCloudSync(); };
function markDirtyState(id){ progress[id] = {...progress[id], updatedAt: Date.now()}; }
function markDirtyCustom(item){ item.updatedAt = Date.now(); }
function isSupabaseConfigured(){ return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && !window.SUPABASE_URL.includes("PASTE_YOUR") && !window.SUPABASE_ANON_KEY.includes("PASTE_YOUR")); }
async function initCloud(){
  if(!isSupabaseConfigured()){ setSyncStatus("☁️ Setup required", "offline"); return; }
  try{ cloud = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const {data:{session}}=await cloud.auth.getSession();
    currentUser=session?.user||null; updateAuthUI();
    cloud.auth.onAuthStateChange((_event,session)=>{ currentUser=session?.user||null; updateAuthUI(); if(currentUser) syncFromCloud(); });
    if(currentUser) await syncFromCloud();
  }catch(e){ console.error(e); setSyncStatus("☁️ Sync error", "error"); }
}
function updateAuthUI(){
  let el=$("authBox"); if(!el) return;
  if(!isSupabaseConfigured()){ el.innerHTML=`<button class="secondary" onclick="showCloudSetup()">☁️ Cloud Sync Setup</button>`; return; }
  if(currentUser){ el.innerHTML=`<span class="auth-email">${esc(currentUser.email||"Signed in")}</span><button class="ghost" onclick="cloudSignOut()">Sign out</button>`; setSyncStatus("☁️ Synced", "online"); }
  else el.innerHTML=`<button class="secondary" onclick="showAuth()">☁️ Login / Sign up</button>`;
}
function showCloudSetup(){ alert("Supabase setup: README.md mein diye SQL ko apne free Supabase project mein run karo, phir config.js mein Project URL aur anon key paste karke Vercel par files update karo."); }
function showAuth(){
  if(!cloud){ alert("Supabase setup complete nahi hai. config.js check karo."); return; }
  $("authModal")?.classList.remove("hidden");
  $("authMessage").textContent="";
  setTimeout(()=>$("authEmail")?.focus(),50);
}
function closeAuth(){ $("authModal")?.classList.add("hidden"); }
async function submitAuth(){
  if(!cloud) return;
  const email=$("authEmail")?.value.trim();
  const password=$("authPassword")?.value || "";
  const msg=$("authMessage");
  if(!email || !password){ if(msg) msg.textContent="Email aur password dono bharo."; return; }
  if(password.length<6){ if(msg) msg.textContent="Password minimum 6 characters ka hona chahiye."; return; }
  try{
    setSyncStatus("☁️ Signing in...", "busy");
    if(msg) msg.textContent="Connecting...";
    let r=await cloud.auth.signInWithPassword({email,password});
    if(r.error){
      const s=await cloud.auth.signUp({email,password});
      if(s.error) throw s.error;
      if(s.data?.session){
        closeAuth();
        alert("✅ Account create aur login ho gaya. Ab same account phone/iPhone/iPad par use karo.");
      }else{
        if(msg) msg.textContent="Account create ho gaya. Email verification ke baad login karo.";
        setSyncStatus("☁️ Check email", "busy");
      }
    }else{
      closeAuth();
      alert("✅ Login successful. Ab same account phone/iPhone/iPad par use karo.");
    }
  }catch(e){
    console.error(e);
    if(msg) msg.textContent="Login/Signup error: "+(e.message||"Please try again");
    setSyncStatus("☁️ Sync error","error");
  }
}
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeAuth(); });
async function cloudSignOut(){ if(cloud) await cloud.auth.signOut(); }
function scheduleCloudSync(){ if(!cloudReady||!currentUser) return; clearTimeout(syncTimer); syncTimer=setTimeout(()=>syncToCloud(),500); }
async function syncFromCloud(){
  if(!cloud||!currentUser) return; cloudReady=false; setSyncStatus("☁️ Syncing...", "busy");
  try{
    const {data:rows,error}=await cloud.from("ca_progress").select("item_id,state,updated_at"); if(error) throw error;
    const merged={...progress};
    (rows||[]).forEach(r=>{ const local=merged[r.item_id]; const remote=r.state||{}; const rt=Number(remote.updatedAt||new Date(r.updated_at).getTime()||0); const lt=Number(local?.updatedAt||0); if(!local || rt>=lt) merged[r.item_id]=remote; });
    progress=merged;
    const {data:customRows,error:e2}=await cloud.from("ca_custom_items").select("item_id,item,updated_at"); if(e2) throw e2;
    const byId=new Map(customData.map(x=>[x.id,x]));
    (customRows||[]).forEach(r=>{ const remote={...(r.item||{}),updatedAt:Number(r.item?.updatedAt||new Date(r.updated_at).getTime()||0)}; const local=byId.get(r.item_id); if(!local || Number(remote.updatedAt)>=Number(local.updatedAt||0)) byId.set(r.item_id,remote); });
    customData=[...byId.values()]; localSave(); populate(true); cloudReady=true; render(); setSyncStatus("☁️ Synced", "online");
    await syncToCloud();
  }catch(e){ console.error(e); cloudReady=true; setSyncStatus("☁️ Sync error", "error"); }
}
async function syncToCloud(){
  if(!cloud||!currentUser||!cloudReady) return; setSyncStatus("☁️ Saving...", "busy");
  try{
    const progressRows=Object.entries(progress).map(([item_id,state])=>({user_id:currentUser.id,item_id,state,updated_at:new Date(Number(state.updatedAt||Date.now())).toISOString()}));
    if(progressRows.length){ const {error}=await cloud.from("ca_progress").upsert(progressRows,{onConflict:"user_id,item_id"}); if(error) throw error; }
    const customRows=customData.map(item=>({user_id:currentUser.id,item_id:item.id,item,updated_at:new Date(Number(item.updatedAt||Date.now())).toISOString()}));
    if(customRows.length){ const {error}=await cloud.from("ca_custom_items").upsert(customRows,{onConflict:"user_id,item_id"}); if(error) throw error; }
    setSyncStatus("☁️ Synced", "online");
  }catch(e){console.error(e);setSyncStatus("☁️ Save failed", "error");}
}


function getState(id) { return progress[id] || { status:"new", important:false, reviews:0, due:null, wrong:0, lastWrong:null }; }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function cleanText(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
function firstSentence(s) { const t=cleanText(s).replace(/\s*\.\s*/g,". "); const m=t.match(/^(.{45,260}?[.!?])(?:\s|$)/); return (m?m[1]:t.slice(0,220)).trim(); }
function dueCount() { return DATA().filter(x => { const s=getState(x.id); return s.due && s.due<=today() && s.status!=="mastered"; }).length; }
function learnedCount() { return DATA().filter(x => { const s=getState(x.id); return s.status==="learned" || s.status==="mastered"; }).length; }
function weakCount() { return DATA().filter(x => getState(x.id).wrong>0 && getState(x.id).status!=="mastered").length; }
function stats() {
  const data=DATA(), c={new:0,remember:0,learned:0,mastered:0,important:0};
  data.forEach(x=>{const s=getState(x.id); c[s.status]=(c[s.status]||0)+1; if(s.important)c.important++;});
  $("stats").innerHTML=[["📚",data.length,"Total CA"],["🆕",c.new,"New"],["🔴",c.remember,"Need to Remember"],["🟡",dueCount(),"Review Today"],["🟢",learnedCount(),"Learned"],["⭐",c.important,"Must Remember"],["⚠️",weakCount(),"Weak CA"],["⚡",dailyPool().length,"Daily Revision"]].map(a=>`<div class="stat"><b>${a[0]} ${a[1]}</b><span>${a[2]}</span></div>`).join("");
}
function populate(force=false) {
  if(force){ $("month").innerHTML='<option value="">All months</option>'; $("category").innerHTML='<option value="">All categories</option>'; }
  const data=DATA();
  [...new Set(data.map(x=>x.month).filter(Boolean))].forEach(x=>{if(![...$("month").options].some(o=>o.value===x))$("month").insertAdjacentHTML("beforeend",`<option value="${esc(x)}">${esc(x)}</option>`);});
  [...new Set(data.map(x=>x.category).filter(Boolean))].sort().forEach(x=>{if(![...$("category").options].some(o=>o.value===x))$("category").insertAdjacentHTML("beforeend",`<option value="${esc(x)}">${esc(x)}</option>`);});
}
function matches(x) {
  const q=$("search").value.toLowerCase().trim(),m=$("month").value,c=$("category").value,st=$("status").value,s=getState(x.id);
  if(q && !(x.title+" "+x.summary+" "+x.category+" "+x.month+" "+(x.tags||[]).join(" ")).toLowerCase().includes(q))return false;
  if(m&&x.month!==m)return false; if(c&&x.category!==c)return false; if(st&&s.status!==st)return false;
  if(view==="remember"&&s.status!=="remember")return false;
  if(view==="learned"&&s.status!=="learned"&&s.status!=="mastered")return false;
  if(view==="important"&&!s.important)return false;
  if(view==="review"&&!(s.due&&s.due<=today()&&s.status!=="mastered"))return false;
  if(view==="weak"&&!(s.wrong>0&&s.status!=="mastered"))return false;
  if(view==="daily"&&!dailyPool().some(y=>y.id===x.id))return false;
  if(["quiz","flashcards","calendar","add"].includes(view))return false;
  return true;
}
function card(x) {
  const s=getState(x.id),summary=x.summary||"No summary extracted.",short=summary.length>650?summary.slice(0,650)+"…":summary;
  const days=s.reviews===0?1:s.reviews===1?3:s.reviews===2?7:s.reviews===3?14:30;
  const date=x.date?` • ${x.date}`:"";
  const own=x.source==="custom";
  return `<article class="card"><div class="card-head"><div><h3 class="title">${esc(x.title)}</h3><div class="meta">${esc(x.month)}${date} • ${esc(x.category)} ${own?" • ✍️ My CA":""} ${s.important?" • ⭐ Must Remember":""}${s.wrong?` • ⚠️ Wrong ${s.wrong}x`:""}</div></div><div class="due">${s.due?"Review: "+s.due:""}</div></div><div class="summary">${esc(short)}</div><div class="fact"><b>🧠 Recall:</b> Title dekho, answer mind mein bolo, phir exam note kholo. Active recall se yaad rakhna hai.</div><details><summary><b>Show exam note</b></summary><p class="summary">${esc(summary)}</p></details><div class="actions"><button class="action red" onclick="mark('${x.id}','remember')">🔴 Need to Remember</button><button class="action yellow" onclick="mark('${x.id}','review')">🟡 Review in ${days}d</button><button class="action green" onclick="mark('${x.id}','learned')">🟢 I Learned It</button><button class="action star" onclick="toggleImportant('${x.id}')">${s.important?"★ Unmark":"⭐ Must Remember"}</button>${own?`<button class="action edit" onclick="editCustom('${x.id}')">✏️ Edit</button><button class="action delete" onclick="deleteCustom('${x.id}')">🗑 Delete</button>`:""}</div></article>`;
}
function dailyPool(){const data=DATA();const due=data.filter(x=>{const s=getState(x.id);return s.due&&s.due<=today()&&s.status!=="mastered"}),weak=data.filter(x=>{const s=getState(x.id);return s.wrong>0&&s.status!=="mastered"}),important=data.filter(x=>getState(x.id).important&&getState(x.id).status!=="mastered"),learnedRecent=data.filter(x=>{const s=getState(x.id);return(s.status==="learned"||s.status==="mastered")&&s.reviews<=1});const map=new Map();[...due,...weak,...important,...learnedRecent].forEach(x=>map.set(x.id,x));return [...map.values()];}
function renderDaily(){const pool=dailyPool(),due=pool.filter(x=>{const s=getState(x.id);return s.due&&s.due<=today()&&s.status!=="mastered"}).length,weak=pool.filter(x=>getState(x.id).wrong>0).length,important=pool.filter(x=>getState(x.id).important).length,recent=pool.filter(x=>getState(x.id).reviews<=1&&(getState(x.id).status==="learned"||getState(x.id).status==="mastered")).length;$("list").innerHTML=`<div class="daily-box"><h2>⚡ Today's Revision</h2><p>App ne aaj ke liye due, weak, important aur recently learned CA ko ek jagah rakha hai.</p><div class="daily-grid"><div><b>${due}</b><span>Due Today</span></div><div><b>${weak}</b><span>Weak CA</span></div><div><b>${important}</b><span>Must Remember</span></div><div><b>${recent}</b><span>Recently Learned</span></div></div><div class="daily-actions"><button class="primary" onclick="startDailyFlashcards()">🧠 Start Recall</button><button class="secondary" onclick="startDailyQuiz()">📝 Daily Quiz</button></div></div>`+pool.map(card).join("");$("empty").classList.toggle("hidden",pool.length>0);}
function startDailyFlashcards(){flashPool=dailyPool();flashIndex=0;setView("flashcards");}
function startDailyQuiz(){const pool=dailyPool().filter(x=>{const s=getState(x.id);return s.status==="learned"||s.status==="mastered"});if(pool.length<4){alert("Daily Quiz ke liye kam se kam 4 Learned CA chahiye.");return;}window.__quizPoolIds=pool.map(x=>x.id);window.__quizCount=Math.min(10,pool.length);window.__quizCategory="";setView("quiz");}
function hideSpecialPanels(){["quizPanel","flashPanel","calendarPanel","treePanel","gaPanel","addPanel"].forEach(id=>$(id).classList.add("hidden"));}
function renderFilterInfo(arr){
  const all=DATA(), marked={learned:0,remember:0,important:0,weak:0};
  arr.forEach(x=>{const st=getState(x.id);if(st.status==="learned"||st.status==="mastered")marked.learned++;if(st.status==="remember")marked.remember++;if(st.important)marked.important++;if((st.wrong||0)>0)marked.weak++;});
  const filters=[]; const q=$("search").value.trim(),m=$("month").value,c=$("category").value,st=$("status").value;
  if(q)filters.push(`Search: <b>${esc(q)}</b>`); if(m)filters.push(`Month: <b>${esc(m)}</b>`); if(c)filters.push(`Category: <b>${esc(c)}</b>`); if(st)filters.push(`Status: <b>${esc(st)}</b>`);
  $("filterInfo").innerHTML=`Showing <b>${arr.length}</b> of <b>${all.length}</b> Current Affairs${filters.length?" • "+filters.join(" • "):""}<span class="filter-marked"> • 🟢 Learned <b>${marked.learned}</b> • 🔴 Need Revision <b>${marked.remember}</b> • ⭐ Must Remember <b>${marked.important}</b> • ⚠️ Weak <b>${marked.weak}</b></span>`;
}
function render(){
  stats(); hideSpecialPanels();
  if(view==="quiz"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); $("filterInfo").innerHTML="📝 Quiz mode — questions are generated from your Learned/Mastered CA."; $("quizPanel").classList.remove("hidden"); renderQuiz(); return; }
  if(view==="flashcards"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); $("filterInfo").innerHTML="🧠 Flashcard mode — your marked progress is preserved."; $("flashPanel").classList.remove("hidden"); renderFlashcards(); return; }
  if(view==="calendar"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); $("filterInfo").innerHTML="📅 Calendar mode — date-wise CA and counts."; $("calendarPanel").classList.remove("hidden"); renderCalendar(); return; }
  if(view==="tree"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); $("filterInfo").innerHTML="🌳 Memory Tree — ek bank/organisation/topic ke saare related CA ek jagah, short notes ke saath."; $("treePanel").classList.remove("hidden"); renderTree(); return; }
  if(view==="ga"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); $("filterInfo").innerHTML="📚 GA BAG — source-derived GA entries are already inside your CA data."; $("gaPanel").classList.remove("hidden"); renderGABag(); return; }
  if(view==="tools"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); $("filterInfo").innerHTML="📥 Excel Import / Export — future CA files ko yahin se add ya backup karo."; $("toolsPanel").classList.remove("hidden"); renderTools(); return; }
  if(view==="add"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); $("filterInfo").innerHTML="➕ Data Entry — manually added CA is stored separately from the original dataset."; $("addPanel").classList.remove("hidden"); renderAddForm(); return; }
  if(view==="daily"){ renderDaily(); renderFilterInfo(dailyPool()); return; }
  const arr=DATA().filter(matches); renderFilterInfo(arr); $("list").innerHTML=arr.map(card).join(""); $("empty").classList.toggle("hidden",arr.length>0);
}
function mark(id,type){let s=getState(id);if(type==="remember"){s.status="remember";s.due=today();}if(type==="learned"||type==="review"){s.status="learned";s.reviews=(s.reviews||0)+1;s.due=addDays(new Date(),s.reviews===1?1:s.reviews===2?3:s.reviews===3?7:s.reviews===4?14:30);}if(s.reviews>=6){s.status="mastered";s.due=addDays(new Date(),30);}progress[id]=s;markDirtyState(id);save();}
function toggleImportant(id){const s=getState(id);s.important=!s.important;progress[id]=s;markDirtyState(id);save();}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;}
function setView(v){view=v;if(v!=="quiz")window.__quizPoolIds=null;document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.view===v));render();}
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>setView(b.dataset.view));["search","month","category","status"].forEach(id=>$(id).addEventListener("input",render));
$("resetBtn").onclick=()=>{if(confirm("Reset all your revision progress? Your added CA entries will NOT be deleted.")){progress={};save();}};

// ---------------- DATA ENTRY ----------------
function renderAddForm(editId=null){
  const cats=[...new Set(DATA().map(x=>x.category).filter(Boolean))].sort();
  const item=editId?customData.find(x=>x.id===editId):null;
  const title=item?item.title:"", summary=item?item.summary:"", date=item?item.date:today(), category=item?item.category:"", tags=item?(item.tags||[]).filter(t=>t!==item.month&&t!==item.category).join(", "):"";
  const important=item?!!getState(item.id).important:false;
  const options=cats.map(c=>`<option value="${esc(c)}" ${c===category?"selected":""}>${esc(c)}</option>`).join("");
  $("addPanel").innerHTML=`<div class="form-box"><div class="form-head"><div><h2>${item?"✏️ Edit Current Affair":"➕ Add Current Affair"}</h2><p>${item?"Apni added CA ka title, date, category, tags ya exam note kabhi bhi change karo.":"September aur future months ki CA yahin se add karo. Date dene par month automatically set ho jayega."}</p></div><button class="secondary" onclick="setView('calendar')">📅 Open Calendar</button></div><form id="caForm" class="ca-form"><label>Date <input id="caDate" type="date" value="${esc(date)}" required></label><label>Category <select id="caCategory" required><option value="">Select category</option>${options}<option value="__new">+ New category</option></select></label><label>Title <input id="caTitle" type="text" value="${esc(title)}" placeholder="Current affair headline" required></label><label>Exam Note / Summary <textarea id="caSummary" rows="9" placeholder="Important facts, numbers, names, place, organisation, etc." required>${esc(summary)}</textarea><label>Tags <input id="caTags" type="text" value="${esc(tags)}" placeholder="e.g. HDFC, RBI, economy, appointment"></label><label class="check"><input id="caImportant" type="checkbox" ${important?"checked":""}> ⭐ Must Remember</label><div class="form-actions"><button class="primary" type="submit">💾 ${item?"Save Changes":"Save CA"}</button><button class="secondary" type="button" onclick="setView('all')">Cancel</button></div></form><div class="data-note">💡 Added/edited CA cloud sync ke saath save hoti hai. Same account se phone/iPhone/iPad par bhi milegi.</div></div>`;
  $("caCategory").onchange=()=>{if($("caCategory").value==="__new"){const c=prompt("New category name:");if(c&&cleanText(c)){const opt=document.createElement("option");opt.value=cleanText(c);opt.textContent=cleanText(c);$("caCategory").insertBefore(opt,$("caCategory").lastElementChild);$("caCategory").value=cleanText(c);}else $("caCategory").value=category||"";}};
  $("caForm").onsubmit=e=>{e.preventDefault();saveCustomCA(editId);};
}
function addCustomCA(){ saveCustomCA(null); }
function saveCustomCA(editId){
  const date=$("caDate").value,category=cleanText($("caCategory").value),title=cleanText($("caTitle").value),summary=cleanText($("caSummary").value),tags=cleanText($("caTags").value).split(",").map(x=>cleanText(x)).filter(Boolean);
  if(!date||!category||category==="__new"||!title||!summary){alert("Date, category, title aur exam note required hain.");return;}
  const stamp=Date.now();
  if(editId){
    const item=customData.find(x=>x.id===editId); if(!item)return;
    item.date=date; item.month=monthName(date); item.category=category; item.title=title; item.summary=summary; item.tags=[monthName(date),category,...tags]; item.updatedAt=stamp;
    const s=getState(editId); s.important=$("caImportant").checked; progress[editId]=s; markDirtyState(editId); markDirtyCustom(item); saveCustom(false); save(false); alert("✅ CA update ho gayi!"); setView("all");
  } else {
    const id=`custom-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    customData.push({id,date,month:monthName(date),category,title,summary,important:false,status:"new",tags:[monthName(date),category,...tags],source:"custom",updatedAt:stamp});
    if($("caImportant").checked){progress[id]={...getState(id),important:true};markDirtyState(id);}
    saveCustom(false);save(false);alert("✅ CA save ho gayi!");renderAddForm();
  }
}
function editCustom(id){ if(!customData.some(x=>x.id===id))return; setView("add"); setTimeout(()=>renderAddForm(id),0); }
function deleteCustom(id){if(!confirm("Is added CA ko delete karna hai?"))return;customData=customData.filter(x=>x.id!==id);delete progress[id];saveCustom(false);save();}

// ---------------- CALENDAR ----------------
function renderCalendar(){
  const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),days=new Date(y,m+1,0).getDate(),start=(first.getDay()+6)%7,data=DATA();
  const counts={};data.forEach(x=>{if(x.date)counts[x.date]=(counts[x.date]||0)+1;});
  let cells="";for(let i=0;i<start;i++)cells+='<div class="cal-cell muted"></div>';
  for(let d=1;d<=days;d++){const ds=`${y}-${pad(m+1)}-${pad(d)}`,n=counts[ds]||0,isToday=ds===today();cells+=`<button class="cal-cell day ${isToday?'today':''}" onclick="calendarDay('${ds}')"><span>${d}</span>${n?`<b>${n} CA</b>`:'<small>—</small>'}</button>`;}
  const monthTitle=new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(y,m,1));
  const monthEntries=data.filter(x=>x.date&&x.date.startsWith(`${y}-${pad(m+1)}-`)).sort((a,b)=>a.date.localeCompare(b.date));
  $("calendarPanel").innerHTML=`<div class="calendar-box"><div class="calendar-head"><button class="secondary" onclick="changeCalendar(-1)">← Prev</button><div><h2>📅 ${monthTitle}</h2><p>Daily CA calendar — click a date to see that day's entries.</p></div><button class="secondary" onclick="changeCalendar(1)">Next →</button></div><div class="weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="calendar-grid">${cells}</div><div class="calendar-footer"><b>${monthEntries.length}</b> dated CA in this month. <button class="primary" onclick="setView('add')">➕ Add CA for ${esc(monthTitle)}</button></div>${monthEntries.length?`<div class="calendar-list"><h3>📚 ${monthTitle} Entries</h3>${monthEntries.map(card).join("")}</div>`:`<div class="calendar-empty">No dated CA yet for ${esc(monthTitle)}. Add your daily CA above.</div>`}</div>`;
}
function changeCalendar(n){calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+n,1);renderCalendar();}
function calendarDay(ds){const data=DATA().filter(x=>x.date===ds);if(!data.length){$("caDate")?.setAttribute("value",ds);setView("add");setTimeout(()=>{$("caDate").value=ds;},0);return;}$("calendarPanel").innerHTML=`<div class="day-results"><div class="calendar-head"><button class="secondary" onclick="renderCalendar()">← Calendar</button><div><h2>📅 ${ds}</h2><p>${data.length} CA found for this date.</p></div><button class="primary" onclick="setView('add');setTimeout(()=>{if($('caDate'))$('caDate').value='${ds}'},0)">➕ Add Another</button></div>${data.map(card).join("")}</div>`;}

// ---------------- MEMORY TREE ----------------
const TREE_ENTITIES=["HDFC","SBI","RBI","SEBI","NABARD","SIDBI","PNB","Canara Bank","Bank of Baroda","ICICI","Axis Bank","IDBI Bank","Union Bank","ADB","World Bank","IMF","AIIB","BIS","UN","UNESCO","WHO","WTO","ISRO","DRDO","NPCI","UPI","LIC","IRDAI","SIDBI","NITI Aayog","Ministry of Finance","Ministry of Defence","Ministry of External Affairs"];
function treeGroups(){
  const data=DATA();
  return TREE_ENTITIES.map(name=>({name,items:data.filter(x=>`${x.title} ${x.summary} ${(x.tags||[]).join(" ")}`.toLowerCase().includes(name.toLowerCase()))})).filter(g=>g.items.length).sort((a,b)=>b.items.length-a.items.length);
}
function shortNote(x){ return firstSentence(x.summary||x.title).slice(0,260); }
function renderTree(){
  const groups=treeGroups();
  $("treePanel").innerHTML=`<div class="tree-box"><div class="tree-head"><div><h2>🌳 Memory Tree</h2><p>HDFC/RBI/ADB jaise kisi entity par click karo — uske related saare CA ek saath, short exam-note format mein milenge.</p></div><input id="treeSearch" class="tree-search" type="search" placeholder="Search entity e.g. HDFC, ADB, RBI..."></div><div id="treeList" class="tree-list">${groups.map(treeGroupHTML).join("")}</div><div class="data-note">💡 Ye grouping tumhare CA ke title, summary aur tags se hoti hai. Kisi specific CA ko aur clearly group karna ho to Data Entry mein tag add kar do, jaise <b>HDFC</b>.</div></div>`;
  $("treeSearch").oninput=()=>{const q=$("treeSearch").value.toLowerCase().trim();$("treeList").innerHTML=groups.filter(g=>!q||g.name.toLowerCase().includes(q)).map(treeGroupHTML).join("")||`<div class="empty">No entity group found.</div>`;};
}
function treeGroupHTML(g){return `<details class="tree-group"><summary><span>🌿 ${esc(g.name)}</span><b>${g.items.length} CA</b></summary><div class="tree-items">${g.items.map(x=>`<article class="tree-item"><div><strong>${esc(x.title)}</strong><div class="tree-meta">${esc(x.month)} • ${esc(x.category)}</div><p>${esc(shortNote(x))}</p></div><button class="mini" onclick="jumpToCA('${esc(x.id)}')">Open</button></article>`).join("")}</div></details>`;}
function jumpToCA(id){view="all";["search","month","category","status"].forEach(k=>$(k).value="");$("search").value=String(DATA().find(x=>x.id===id)?.title||"").split(" ").slice(0,2).join(" ");document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.view==="all"));render();window.scrollTo({top:0,behavior:"smooth"});}

// ---------------- EXCEL IMPORT / EXPORT ----------------
function normalizeImportKey(v){return cleanText(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function findColumn(headers,names){const map={};headers.forEach(h=>map[normalizeImportKey(h)]=h);for(const n of names){const k=normalizeImportKey(n);if(map[k])return map[k];}return null;}
function parseBool(v){return [true,"true","yes","y","1","important","must remember"].includes(typeof v==="string"?v.trim().toLowerCase():v);}
function importRowToItem(row,sourceSheet){
  const headers=Object.keys(row); if(!headers.length)return null;
  const titleKey=findColumn(headers,["Title","Question","Topic","Current Affair","Headline"]);
  const summaryKey=findColumn(headers,["Exam Note","Summary","Answer","Details","Source Text","Notes"]);
  const categoryKey=findColumn(headers,["Category","Type","Subject"]);
  const dateKey=findColumn(headers,["Date","Published Date"]);
  const tagsKey=findColumn(headers,["Tags","Tag","Entity"]);
  const importantKey=findColumn(headers,["Must Remember","Important","Star"]);
  const title=cleanText(row[titleKey]||""); if(!title)return null;
  const summary=cleanText(row[summaryKey]||title);
  const category=cleanText(row[categoryKey]||"General Awareness");
  let date=cleanText(row[dateKey]||"");
  if(date && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(date)){const [d,m,y]=date.split(/[\/\-]/);date=`${String(y).padStart(4,"20")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
  const month=date?monthName(date):"Imported";
  const tags=cleanText(row[tagsKey]||"").split(",").map(cleanText).filter(Boolean);
  if(sourceSheet && !tags.includes(sourceSheet))tags.unshift(sourceSheet);
  const key=normalizeImportKey(title)+"|"+normalizeImportKey(category)+"|"+date;
  return {key,title,summary,category,date,month,tags,important:parseBool(row[importantKey]),source:"imported",sourceSheet};
}
function renderTools(){
  const custom=customData.length, total=DATA().length;
  $("toolsPanel").innerHTML=`<div class="form-box tools-box"><div class="form-head"><div><h2>📥 Excel Import / Export</h2><p>Future mein nayi CA ki Excel file aaye to yahin import karo. Multi-sheet Excel bhi chalega.</p></div><button class="secondary" onclick="setView('ga')">📚 GA BAG</button></div><div class="tools-grid"><article><h3>📤 Import Excel / CSV</h3><p>Title + Exam Note/Summary + Category columns ho to app automatically data samajh lega. Date aur Tags optional hain.</p><input id="excelImportFile" type="file" accept=".xlsx,.xls,.csv"><button class="primary" onclick="importExcelFile()">⬆️ Import File</button><div id="importResult" class="data-note"></div></article><article><h3>📥 Export Backup</h3><p>Apni added CA, progress aur complete CA list ka Excel backup bana lo.</p><button class="primary" onclick="exportMyData()">⬇️ Export My Data</button><button class="secondary" onclick="exportAllCA()">⬇️ Export All CA</button></article></div><div class="data-note"><b>Future PDF workflow:</b> PDF bhejo → usko Excel mein convert karo → yahan Import karo. Agar tumhare paas direct Excel hai, PDF conversion ki zarurat nahi. Duplicate title/category/date ko app skip karega.</div><div class="data-note"><b>Current data:</b> ${total} CA total • ${custom} manually/imported CA • GA BAG ke 141 source-derived entries already included.</div></div>`;
}
async function importExcelFile(){
  const input=$("excelImportFile"),out=$("importResult"); if(!input?.files?.length){alert("Pehle Excel/CSV file select karo.");return;}
  if(!window.XLSX){alert("Excel reader load nahi hua. Internet connection check karke page reload karo.");return;}
  try{
    const file=input.files[0],buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:"array"});
    const existing=new Set(DATA().map(x=>normalizeImportKey(x.title)+"|"+normalizeImportKey(x.category)+"|"+(x.date||"")));
    const added=[]; let skipped=0;
    wb.SheetNames.forEach(sheetName=>{const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:""}); rows.forEach(row=>{const x=importRowToItem(row,sheetName);if(!x)return; if(existing.has(x.key)){skipped++;return;} existing.add(x.key); const id=`import-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; added.push({id,date:x.date,month:x.month,category:x.category,title:x.title,summary:x.summary,status:"new",important:x.important,tags:[x.month,x.category,...x.tags],source:"imported",sourceSheet:x.sourceSheet,updatedAt:Date.now()});});});
    if(added.length){customData.push(...added);added.forEach(x=>{if(x.important){progress[x.id]={...getState(x.id),important:true};markDirtyState(x.id);}});saveCustom(false);save(false);populate(true);render();}
    out.textContent=`✅ Imported ${added.length} CA • ${skipped} duplicate rows skipped.`;
  }catch(e){console.error(e);out.textContent="❌ Import error: "+(e.message||e);}
}
function exportWorkbook(rows,name){if(!window.XLSX){alert("Excel export library load nahi hua. Page reload karo.");return;}const wb=XLSX.utils.book_new();const sheet=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,sheet,"CA Data");XLSX.writeFile(wb,name);}
function exportMyData(){
  const rows=customData.map(x=>({Title:x.title,Category:x.category,"Exam Note":x.summary,Date:x.date||"",Tags:(x.tags||[]).join(", "),"Must Remember":getState(x.id).important?"Yes":"No",Source:x.source||"custom"}));
  exportWorkbook(rows,"CA_Vault_My_Data.xlsx");
}
function exportAllCA(){
  const rows=DATA().map(x=>({Title:x.title,Category:x.category,"Exam Note":x.summary,Date:x.date||"",Tags:(x.tags||[]).join(", "),"Must Remember":getState(x.id).important?"Yes":"No",Status:getState(x.id).status,Source:x.source||"base"}));
  exportWorkbook(rows,"CA_Vault_All_CA.xlsx");
}

// ---------------- GA BAG ----------------
function renderGABag(){
  const ga=DATA().filter(x=>x.source==="ga-bag");
  const c1=ga.filter(x=>(x.tags||[]).includes("Class 1")).length;
  const c2=ga.filter(x=>(x.tags||[]).includes("Class 2")).length;
  $("gaPanel").innerHTML=`<div class="ga-box"><div class="ga-head"><div><h2>📚 GA BAG</h2><p>GA BAG ki important source-derived CA ab app ke main data mein hi added hain — alag se 45+ MB PDFs GitHub par upload karne ki zarurat nahi.</p></div><button class="secondary" onclick="setView('tree')">🌳 Memory Tree</button></div><div class="daily-grid"><div><b>${ga.length}</b><span>GA BAG CA in app</span></div><div><b>${c1}</b><span>Class 1</span></div><div><b>${c2}</b><span>Class 2</span></div><div><b>${ga.filter(x=>getState(x.id).important).length}</b><span>Marked Important</span></div></div><div class="ga-grid"><article class="ga-file"><div class="ga-icon">📊</div><div><h3>GA_BAG_MIX.xlsx</h3><p>Class 1 + Class 2, separate sheets plus Combined sheet. Source text retained.</p><span>Excel backup/import file</span></div><a class="primary link-btn" href="GA_BAG_MIX.xlsx" download>Download Excel</a></article></div><div class="ga-tip"><b>Best workflow:</b> GA BAG CA already app mein hain → search/filter se padho → ⭐ Must Remember / 🟢 Learned mark karo → 🌳 Memory Tree se HDFC/RBI/ADB jaise entities revise karo. Future mein nayi Excel/CA file aaye to 📥 Excel Tools se import kar dena.</div><div class="data-note">⚠️ PDF source ka content source-faithful convert kiya gaya hai; external fact-check/correction is conversion mein nahi ki gayi.</div></div>`;
}

// ---------------- QUIZ ----------------
function learnedPool(){const cat=window.__quizCategory||"",allowed=window.__quizPoolIds?new Set(window.__quizPoolIds):null;return DATA().filter(x=>{const s=getState(x.id);return x.title&&(s.status==="learned"||s.status==="mastered")&&(!cat||x.category===cat)&&(!allowed||allowed.has(x.id));});}
function uniqueOptions(correct,candidates){const out=[],seen=new Set();[correct,...candidates].forEach(v=>{const t=cleanText(v),key=t.toLowerCase();if(t&&!seen.has(key)){seen.add(key);out.push(t);}});return out.slice(0,4);}
function shuffled(a){return [...a].sort(()=>Math.random()-0.5);}
function moneyValues(text){return [...new Set((text.match(/(?:₹|Rs\.?|INR|\$|USD|€|EUR|£|GBP)\s?[\d,.]+(?:\s?(?:crore|lakh|million|billion|trillion))?/gi)||[]).map(cleanText))];}
function numberValues(text){return [...new Set((text.match(/\b\d+(?:\.\d+)?\s?(?:per cent|percent|%|million|billion|trillion|crore|lakh|gigawatts?|GW|circuit-km|million people|years?)\b|\b\d+(?:\.\d+)?%/gi)||[]).map(cleanText))];}
function yearValues(text){return [...new Set((text.match(/\b(?:19|20)\d{2}\b/g)||[]))];}
function firstClause(text){return cleanText(text).split(/[,;.!?]/)[0].trim();}
function answerPool(pool,type,x){
  const vals=[];
  for(const y of pool){if(y.id===x.id)continue;const t=cleanText(y.title),s=cleanText(y.summary);
    if(type==="money") vals.push(...moneyValues(t+" "+s));
    if(type==="number") vals.push(...numberValues(t+" "+s));
    if(type==="year") vals.push(...yearValues(t+" "+s));
    if(type==="person"){const m=t.match(/^(.+?)\s+(?:appointed|elected|re-elected|named|selected|joins|assumes|becomes)\b/i);if(m)vals.push(cleanText(m[1]).replace(/^GA by.*?\b/i,""));}
    if(type==="brand"){const m=t.match(/appointed as\s+(.+?)\s+ambassador/i);if(m)vals.push(firstClause(m[1]).replace(/^the\s+/i,""));}
    if(type==="org"){const m=t.match(/^([A-Z][A-Z0-9&.-]{1,10})\b/);if(m)vals.push(m[1]);}
  }
  return [...new Set(vals.map(cleanText).filter(v=>v.length>1))];
}
function makeQuestionVariants(x,pool){
  const title=cleanText(x.title), summary=cleanText(x.summary), text=cleanText(title+" "+summary), qs=[];
  const add=(question,correct,type)=>{if(!correct)return;qs.push({question,correct:cleanText(correct),type,sourceId:x.id});};
  // Ambassador / appointment: generate person, brand, role and location questions when the source supports them.
  let m=title.match(/^(.+?)\s+appointed as\s+(.+?)\s+ambassador(?:\s+in\s+(.+?))?$/i);
  if(m){const person=cleanText(m[1]).replace(/^GA by.*?\b/i,"");const role=cleanText(m[2]);const brand=firstClause(role);const location=cleanText(m[3]||"");add(`Who was appointed as ${role} ambassador${location?` in ${location}`:""}?`,person,"person");add(`${person} was appointed as ambassador of which brand/organisation?`,brand,"brand");add(`What type of ambassador role was given to ${person}?`,role,"brand");if(location)add(`In which country/location was ${person} appointed as the ambassador?`,location,"org");}
  // Money figures: every distinct amount can become a separate question.
  for(const v of moneyValues(text).slice(0,5)){const sentence=(summary||title).split(/(?<=[.!?])\s+/).find(z=>z.includes(v))||title;let q=`What amount was mentioned in the current affair “${title}”?`;const before=sentence.split(v)[0].trim();if(/plan|package|roadmap|investment|loan|fund|acquisition|deal/i.test(before))q=`What amount was announced/mentioned for this plan, package, loan or investment?`;add(q,v,"money");}
  // Percentages / quantities / targets.
  for(const v of numberValues(text).slice(0,5)){const sentence=(summary||title).split(/(?<=[.!?])\s+/).find(z=>z.includes(v))||title;const before=cleanText(sentence.split(v)[0]);let q;if(/renewable|energy|gigawatts?/i.test(sentence))q=`How much renewable-energy capacity is targeted/mentioned in this current affair?`;else if(/transmission|circuit-km/i.test(sentence))q=`How many circuit-km of transmission lines are mentioned in the current affair?`;else if(/people|population|access/i.test(sentence))q=`How many people are mentioned as beneficiaries/people gaining access?`;else if(/percent|%|per cent/i.test(v))q=`What percentage is mentioned in this current affair?`;else q=`What quantity/figure is mentioned in this current affair?`;add(q,v,"number");}
  for(const y of yearValues(text).slice(0,3))add(`By/in which year is the key target or event mentioned?`,y,"year");
  // Named programmes/initiatives after common “$amount Name” patterns.
  const programs=[...text.matchAll(/(?:\$|₹)[\d,.]+\s?(?:billion|million|crore|lakh)?\s+([A-Z][A-Za-z0-9&-]+(?:\s+[A-Z][A-Za-z0-9&-]+){1,7})/g)].map(m=>cleanText(m[1]));
  programs.slice(0,3).forEach(name=>add(`Which programme/initiative is mentioned with this current affair?`,name,"org"));
  // Purpose / “for/to” facts.
  const purposeMatches=[...text.matchAll(/(?:to|for)\s+([a-z][^.!?;]{20,180})/gi)].map(m=>cleanText(m[1]).replace(/^(?:the|a)\s+/i,""));
  purposeMatches.slice(0,3).forEach(p=>add(`What was the main purpose/use mentioned in this current affair?`,p,"purpose"));
  // Organisation acronym from title (e.g. ADB, RBI, UPI) and title-based person fallback.
  const org=title.match(/^([A-Z][A-Z0-9&.-]{1,10})\b/);if(org)add(`Which organisation/institution is associated with this current affair?`,org[1],"org");
  if(!qs.length){add(`Which statement/fact is correct about “${title}”?`,firstSentence(summary)||title,"sentence");}
  // Remove duplicate question/answer pairs.
  const seen=new Set();return qs.filter(q=>{const k=q.question.toLowerCase()+"|"+q.correct.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).slice(0,5);
}
function buildQuestion(q,pool,index,usedOptions=new Set()){const candidates=answerPool(pool,q.type,q.sourceId?DATA().find(x=>x.id===q.sourceId):{id:""});const fresh=candidates.filter(v=>!usedOptions.has(v.toLowerCase())&&v.toLowerCase()!==q.correct.toLowerCase());const old=candidates.filter(v=>v.toLowerCase()!==q.correct.toLowerCase());let options=uniqueOptions(q.correct,shuffled(fresh));if(options.length<3)options=uniqueOptions(q.correct,[...options,...shuffled(old)]);if(options.length<3){const fallbacks=shuffled(pool.filter(y=>y.id!==q.sourceId).map(y=>firstSentence(y.summary)||y.title));const freshFallbacks=fallbacks.filter(v=>!usedOptions.has(v.toLowerCase())&&v.toLowerCase()!==q.correct.toLowerCase());options=uniqueOptions(q.correct,[...options,...freshFallbacks,...fallbacks]);}if(options.length<3){options=uniqueOptions(q.correct,[...options,...shuffled(["None of these","Both A and B","All of the above"])])};const finalOptions=shuffled(options.slice(0,4));finalOptions.filter(v=>v.toLowerCase()!==q.correct.toLowerCase()).forEach(v=>usedOptions.add(v.toLowerCase()));return {...q,id:`q${index}`,options:finalOptions};}
function renderQuiz(){const pool=learnedPool();if(pool.length<4){$("quizPanel").innerHTML=`<div class="quiz-empty"><h2>📝 Learned CA Quiz</h2><p>Quiz start karne ke liye kam se kam <b>4 CA</b> ko <b>🟢 I Learned It</b> mark karo.</p><p>Abhi ${pool.length} Learned/Mastered CA available hain.</p><button class="primary" onclick="setView('all')">📚 Go to All CA</button></div>`;return;}const bank=pool.flatMap(x=>makeQuestionVariants(x,pool));const count=Math.min(parseInt(window.__quizCount||10,10),bank.length,30);const selected=shuffled(bank).slice(0,count);const usedOptions=new Set();const questions=selected.map((q,i)=>buildQuestion(q,pool,i+1,usedOptions));$("quizPanel").innerHTML=`<div class="quiz-head"><div><h2>📝 Learned CA Quiz</h2><p>Ek hi CA se multiple exam-style questions aa sakte hain — person, organisation, amount, purpose, year, target etc. Har question ke options ko possible ho to <b>alag distractors</b> se banaya jaata hai, taaki same options baar-baar repeat na hon.</p></div><div class="quiz-controls"><label>Questions <select id="quizCount"><option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="30">30</option></select></label><label>Category <select id="quizCategory"><option value="">All Learned CA</option></select></label><button class="primary" onclick="renderQuiz()">🔄 New Quiz</button></div></div><div class="quiz-score" id="quizScore">Score: 0 / ${questions.length} • Answered: 0 / ${questions.length}</div>${questions.map((q,i)=>`<div class="q" data-source="${esc(q.sourceId)}" data-correct="${esc(q.correct)}"><div class="q-number">Question ${i+1}</div><b>${esc(q.question)}</b><div class="q-source">📌 Source CA: ${esc(DATA().find(x=>x.id===q.sourceId)?.title||"")}</div>${q.options.map(o=>`<button class="option" onclick="answerQuiz(this, ${JSON.stringify(q.correct)}, ${JSON.stringify(o)}, ${JSON.stringify(q.sourceId)})">${esc(o)}</button>`).join("")}<div class="answer"></div></div>`).join("")}`;const qc=$("quizCategory");[...new Set(pool.map(x=>x.category))].sort().forEach(x=>qc.insertAdjacentHTML("beforeend",`<option>${esc(x)}</option>`));qc.value=window.__quizCategory||"";qc.onchange=()=>{window.__quizCategory=qc.value;renderQuiz();};const qcount=$("quizCount");qcount.value=String(Math.min(Number(window.__quizCount||10),30));qcount.onchange=()=>{window.__quizCount=Number(qcount.value);renderQuiz();};}
function answerQuiz(btn,correct,given,sourceId){const box=btn.closest(".q"),ans=box.querySelector(".answer");if(box.dataset.done==="1")return;box.querySelectorAll("button.option").forEach(b=>b.disabled=true);const s=getState(sourceId),isCorrect=given===correct;if(isCorrect){btn.classList.add("correct");ans.innerHTML="<div>✅ Correct — fact recalled successfully.</div>";}else{btn.classList.add("wrong");ans.innerHTML="<div>❌ Correct answer: "+esc(correct)+"</div>";s.wrong=(s.wrong||0)+1;s.lastWrong=today();s.due=addDays(new Date(),1);progress[sourceId]=s;markDirtyState(sourceId);}box.dataset.done="1";box.dataset.correctPick=isCorrect?"1":"0";ans.insertAdjacentHTML("beforeend",`<div class="quiz-mark-actions"><span>Mark this CA:</span><button class="mini green" onclick="quizMark('${sourceId}','learned',this)">🟢 Learned</button><button class="mini red" onclick="quizMark('${sourceId}','remember',this)">🔴 Need Revision</button><button class="mini star" onclick="quizImportant('${sourceId}',this)">⭐ Must Remember</button></div>`);localStorage.setItem(PROGRESS_KEY,JSON.stringify(progress));updateQuizScore();stats();}
function updateQuizScore(){const correctCount=[...document.querySelectorAll(".q")].filter(q=>q.dataset.correctPick==="1").length,total=document.querySelectorAll(".q").length,answered=document.querySelectorAll('.q[data-done="1"]').length,el=$("quizScore");if(el)el.textContent=`Score: ${correctCount} / ${total} • Answered: ${answered} / ${total}`;}
function quizMark(id,type,btn){let s=getState(id);if(type==="learned"){s.status="learned";if(!s.due)s.due=addDays(new Date(),1);}if(type==="remember"){s.status="remember";s.due=today();}progress[id]=s;markDirtyState(id);save(false);btn.parentElement.querySelectorAll("button").forEach(b=>b.classList.remove("selected"));btn.classList.add("selected");stats();}
function quizImportant(id,btn){const s=getState(id);s.important=true;progress[id]=s;markDirtyState(id);save(false);btn.classList.add("selected");btn.textContent="⭐ Marked Important";stats();}

// ---------------- FLASHCARDS ----------------
function flashCandidates(){const data=DATA();const weak=data.filter(x=>getState(x.id).wrong>0&&getState(x.id).status!=="mastered"),due=data.filter(x=>{const s=getState(x.id);return s.due&&s.due<=today()&&s.status!=="mastered"}),important=data.filter(x=>getState(x.id).important&&getState(x.id).status!=="mastered"),learned=data.filter(x=>{const s=getState(x.id);return s.status==="learned"||s.status==="mastered"});const map=new Map();[...weak,...due,...important,...learned].forEach(x=>map.set(x.id,x));return [...map.values()];}
function renderFlashcards(){if(!flashPool.length)flashPool=flashCandidates();if(!flashPool.length){$("flashPanel").innerHTML=`<div class="quiz-empty"><h2>🧠 Flashcards</h2><p>Abhi koi CA available nahi hai. Pehle CA ko Learn/Remember mark karo.</p></div>`;return;}const x=flashPool[flashIndex%flashPool.length],s=getState(x.id);$("flashPanel").innerHTML=`<div class="flash-head"><div><h2>🧠 Flashcards</h2><div class="flash-count">${(flashIndex%flashPool.length)+1} / ${flashPool.length}</div></div><button class="secondary" onclick="setView('all')">← Back to CA</button></div><div class="flash-card"><div class="meta">${esc(x.month)} • ${esc(x.category)} ${x.date?`• ${x.date}`:""}</div><h2>${esc(x.title)}</h2><div id="flashAnswer" class="flash-answer hidden">${esc(x.summary)}</div><button class="primary" id="revealBtn">👁 Reveal Exam Note</button></div><div class="flash-actions"><button class="action" onclick="flashPrev()">← Previous</button><button class="action" onclick="flashNext()">Next →</button><button class="action green" onclick="mark('${x.id}','learned');flashNext()">🟢 I Know It</button><button class="action red" onclick="mark('${x.id}','remember');flashNext()">🔴 Need Revision</button><button class="action star" onclick="toggleImportant('${x.id}')">${s.important?"★ Important":"⭐ Must Remember"}</button></div>`;$("revealBtn").onclick=()=>{$("flashAnswer").classList.remove("hidden");$("revealBtn").classList.add("hidden");};}
function flashNext(){if(!flashPool.length)flashPool=flashCandidates();flashIndex=(flashIndex+1)%flashPool.length;renderFlashcards();}
function flashPrev(){if(!flashPool.length)flashPool=flashCandidates();flashIndex=(flashIndex-1+flashPool.length)%flashPool.length;renderFlashcards();}

populate();render();updateAuthUI();initCloud();
