const DATA=window.CA_DATA||[];
const KEY="ca_vault_progress_v1";
let progress=JSON.parse(localStorage.getItem(KEY)||"{}");
let view="all";

const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const save=()=>{localStorage.setItem(KEY,JSON.stringify(progress));render();};

function getState(id){return progress[id]||{status:"new",important:false,reviews:0,due:null}}
function setState(id,patch){progress[id]={...getState(id),...patch};save()}

function populate(){
  [...new Set(DATA.map(x=>x.month))].forEach(x=>$("month").insertAdjacentHTML("beforeend",`<option>${x}</option>`));
  [...new Set(DATA.map(x=>x.category))].sort().forEach(x=>$("category").insertAdjacentHTML("beforeend",`<option>${esc(x)}</option>`));
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function dueCount(){return DATA.filter(x=>{let s=getState(x.id);return s.due&&s.due<=today()&&s.status!=="mastered"}).length}
function stats(){
 const c={new:0,remember:0,learned:0,mastered:0,important:0};
 DATA.forEach(x=>{let s=getState(x.id);c[s.status]=(c[s.status]||0)+1;if(s.important)c.important++});
 $("stats").innerHTML=[
  ["📚",DATA.length,"Total CA"],["🆕",c.new,"New"],["🔴",c.remember,"Need to Remember"],
  ["🟡",dueCount(),"Review Today"],["⭐",c.important,"Must Remember"]
 ].map(a=>`<div class="stat"><b>${a[0]} ${a[1]}</b><span>${a[2]}</span></div>`).join("");
}
function matches(x){
 const q=$("search").value.toLowerCase().trim(), m=$("month").value, c=$("category").value, st=$("status").value, s=getState(x.id);
 if(q && !(x.title+" "+x.summary+" "+x.category+" "+x.month).toLowerCase().includes(q))return false;
 if(m&&x.month!==m)return false;if(c&&x.category!==c)return false;if(st&&s.status!==st)return false;
 if(view==="remember"&&s.status!=="remember")return false;
 if(view==="learned"&&s.status!=="learned"&&s.status!=="mastered")return false;
 if(view==="important"&&!s.important)return false;
 if(view==="review"&&!(s.due&&s.due<=today()&&s.status!=="mastered"))return false;
 if(view==="quiz")return false;
 return true;
}
function card(x){
 const s=getState(x.id);
 const summary=x.summary||"No summary extracted.";
 const short=summary.length>650?summary.slice(0,650)+"…":summary;
 const days=s.reviews===0?1:s.reviews===1?3:s.reviews===2?7:s.reviews===3?14:30;
 return `<article class="card">
  <div class="card-head"><div><h3 class="title">${esc(x.title)}</h3><div class="meta">${esc(x.month)} • ${esc(x.category)} ${s.important?" • ⭐ Must Remember":""}</div></div>
  <div class="due">${s.due?"Review: "+s.due:""}</div></div>
  <div class="summary">${esc(short)}</div>
  <div class="fact"><b>🧠 Recall:</b> Close this card after reading the title and try to say the key facts aloud. Then reveal/review the summary.</div>
  <details><summary><b>Show exam note</b></summary><p class="summary">${esc(summary)}</p></details>
  <div class="actions">
   <button class="action red" onclick="mark('${x.id}','remember')">🔴 Need to Remember</button>
   <button class="action yellow" onclick="mark('${x.id}','review')">🟡 Review in ${days}d</button>
   <button class="action green" onclick="mark('${x.id}','learned')">🟢 I Learned It</button>
   <button class="action star" onclick="toggleImportant('${x.id}')">${s.important?"★ Unmark":"⭐ Must Remember"}</button>
  </div>
 </article>`
}
function render(){
 stats();
 if(view==="quiz"){ $("list").innerHTML=""; $("empty").classList.add("hidden"); renderQuiz(); return;}
 $("quizPanel").classList.add("hidden");
 const arr=DATA.filter(matches);
 $("list").innerHTML=arr.map(card).join("");
 $("empty").classList.toggle("hidden",arr.length>0);
}
function mark(id,type){
 let s=getState(id);
 if(type==="remember"){s.status="remember";s.due=today()}
 if(type==="learned"){s.status="learned";s.reviews=(s.reviews||0)+1;s.due=addDays(new Date(),s.reviews===1?1:s.reviews===2?3:s.reviews===3?7:s.reviews===4?14:30)}
 if(type==="review"){s.status="learned";s.reviews=(s.reviews||0)+1;s.due=addDays(new Date(),s.reviews===1?1:s.reviews===2?3:s.reviews===3?7:s.reviews===4?14:30)}
 if(s.reviews>=6){s.status="mastered";s.due=addDays(new Date(),30)}
 progress[id]=s;save();
}
function toggleImportant(id){let s=getState(id);s.important=!s.important;progress[id]=s;save()}
function addDays(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}
function setView(v){view=v;document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.view===v));render()}
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>setView(b.dataset.view));
["search","month","category","status"].forEach(id=>$(id).addEventListener("input",render));
$("resetBtn").onclick=()=>{if(confirm("Reset all your revision progress?")){progress={};save()}};

function renderQuiz(){
 const pool=DATA.filter(x=>{let s=getState(x.id);return x.title && s.status!=="mastered"}).sort(()=>Math.random()-.5).slice(0,10);
 $("quizPanel").classList.remove("hidden");
 $("quizPanel").innerHTML=`<h2>📝 Recall Quiz — 10 Questions</h2><p>Try answering from memory. These questions are generated from your saved CA titles/categories.</p>`+
 pool.map((x,i)=>{
   const same=DATA.filter(y=>y.category===x.category&&y.id!==x.id).sort(()=>Math.random()-.5).slice(0,3).map(y=>y.category);
   const opts=[x.category,...same].slice(0,4).sort(()=>Math.random()-.5);
   return `<div class="q"><b>${i+1}. This current affair belongs to which category?</b><p>${esc(x.title)}</p>`+
   opts.map(o=>`<button onclick="answer(this,'${esc(x.category).replace(/'/g,"&#39;")}','${esc(o).replace(/'/g,"&#39;")}')">${esc(o)}</button>`).join("")+
   `<div class="answer"></div></div>`
 }).join("");
}
function answer(btn,correct,given){
 const box=btn.parentElement, ans=box.querySelector(".answer");
 box.querySelectorAll("button").forEach(b=>b.disabled=true);
 if(given===correct){btn.classList.add("correct");ans.textContent="✅ Correct — "+correct}
 else {btn.classList.add("wrong");ans.textContent="❌ Correct answer: "+correct}
}
populate();render();
