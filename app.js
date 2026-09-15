const DATA = window.CA_DATA || [];
const KEY = "ca_vault_progress_v1";
let progress = JSON.parse(localStorage.getItem(KEY) || "{}");
let view = "all";
let flashIndex = 0;
let flashPool = [];

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const save = (rerender = true) => { localStorage.setItem(KEY, JSON.stringify(progress)); if (rerender) render(); };

function getState(id) {
  return progress[id] || { status: "new", important: false, reviews: 0, due: null, wrong: 0, lastWrong: null };
}
function setState(id, patch, rerender = true) { progress[id] = { ...getState(id), ...patch }; save(rerender); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m])); }
function cleanText(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
function firstSentence(s) {
  const t = cleanText(s).replace(/\s*\.\s*/g, ". ");
  const m = t.match(/^(.{45,260}?[.!?])(?:\s|$)/);
  return (m ? m[1] : t.slice(0, 220)).trim();
}
function dueCount() {
  return DATA.filter(x => { const s = getState(x.id); return s.due && s.due <= today() && s.status !== "mastered"; }).length;
}
function learnedCount() { return DATA.filter(x => { const s = getState(x.id); return s.status === "learned" || s.status === "mastered"; }).length; }
function weakCount() { return DATA.filter(x => getState(x.id).wrong > 0 && getState(x.id).status !== "mastered").length; }
function stats() {
  const c = { new:0, remember:0, learned:0, mastered:0, important:0 };
  DATA.forEach(x => { const s = getState(x.id); c[s.status] = (c[s.status] || 0) + 1; if (s.important) c.important++; });
  $("stats").innerHTML = [
    ["📚", DATA.length, "Total CA"], ["🆕", c.new, "New"], ["🔴", c.remember, "Need to Remember"],
    ["🟡", dueCount(), "Review Today"], ["🟢", learnedCount(), "Learned"], ["⭐", c.important, "Must Remember"], ["⚠️", weakCount(), "Weak CA"], ["⚡", dailyPool().length, "Daily Revision"]
  ].map(a => `<div class="stat"><b>${a[0]} ${a[1]}</b><span>${a[2]}</span></div>`).join("");
}
function populate() {
  [...new Set(DATA.map(x => x.month))].forEach(x => $("month").insertAdjacentHTML("beforeend", `<option>${esc(x)}</option>`));
  [...new Set(DATA.map(x => x.category))].sort().forEach(x => $("category").insertAdjacentHTML("beforeend", `<option>${esc(x)}</option>`));
}
function matches(x) {
  const q = $("search").value.toLowerCase().trim(), m = $("month").value, c = $("category").value, st = $("status").value, s = getState(x.id);
  if (q && !(x.title + " " + x.summary + " " + x.category + " " + x.month + " " + (x.tags || []).join(" ")).toLowerCase().includes(q)) return false;
  if (m && x.month !== m) return false;
  if (c && x.category !== c) return false;
  if (st && s.status !== st) return false;
  if (view === "remember" && s.status !== "remember") return false;
  if (view === "learned" && s.status !== "learned" && s.status !== "mastered") return false;
  if (view === "important" && !s.important) return false;
  if (view === "review" && !(s.due && s.due <= today() && s.status !== "mastered")) return false;
  if (view === "weak" && !(s.wrong > 0 && s.status !== "mastered")) return false;
  if (view === "daily" && !dailyPool().some(y => y.id === x.id)) return false;
  if (["quiz", "flashcards"].includes(view)) return false;
  return true;
}
function card(x) {
  const s = getState(x.id);
  const summary = x.summary || "No summary extracted.";
  const short = summary.length > 650 ? summary.slice(0, 650) + "…" : summary;
  const days = s.reviews === 0 ? 1 : s.reviews === 1 ? 3 : s.reviews === 2 ? 7 : s.reviews === 3 ? 14 : 30;
  return `<article class="card">
    <div class="card-head"><div><h3 class="title">${esc(x.title)}</h3><div class="meta">${esc(x.month)} • ${esc(x.category)} ${s.important ? " • ⭐ Must Remember" : ""}${s.wrong ? ` • ⚠️ Wrong ${s.wrong}x` : ""}</div></div><div class="due">${s.due ? "Review: " + s.due : ""}</div></div>
    <div class="summary">${esc(short)}</div>
    <div class="fact"><b>🧠 Recall:</b> Title dekho, answer mind mein bolo, phir exam note kholo. Active recall se yaad rakhna hai.</div>
    <details><summary><b>Show exam note</b></summary><p class="summary">${esc(summary)}</p></details>
    <div class="actions">
      <button class="action red" onclick="mark('${x.id}','remember')">🔴 Need to Remember</button>
      <button class="action yellow" onclick="mark('${x.id}','review')">🟡 Review in ${days}d</button>
      <button class="action green" onclick="mark('${x.id}','learned')">🟢 I Learned It</button>
      <button class="action star" onclick="toggleImportant('${x.id}')">${s.important ? "★ Unmark" : "⭐ Must Remember"}</button>
    </div>
  </article>`;
}
function dailyPool() {
  const due = DATA.filter(x => { const s = getState(x.id); return s.due && s.due <= today() && s.status !== "mastered"; });
  const weak = DATA.filter(x => { const s = getState(x.id); return s.wrong > 0 && s.status !== "mastered"; });
  const important = DATA.filter(x => getState(x.id).important && getState(x.id).status !== "mastered");
  const learnedRecent = DATA.filter(x => { const s = getState(x.id); return (s.status === "learned" || s.status === "mastered") && s.reviews <= 1; });
  const map = new Map(); [...due, ...weak, ...important, ...learnedRecent].forEach(x => map.set(x.id, x));
  return [...map.values()];
}
function renderDaily() {
  const pool = dailyPool();
  const due = pool.filter(x => { const s = getState(x.id); return s.due && s.due <= today() && s.status !== "mastered"; }).length;
  const weak = pool.filter(x => getState(x.id).wrong > 0).length;
  const important = pool.filter(x => getState(x.id).important).length;
  const recent = pool.filter(x => getState(x.id).reviews <= 1 && (getState(x.id).status === "learned" || getState(x.id).status === "mastered")).length;
  $("list").innerHTML = `<div class="daily-box"><h2>⚡ Today's Revision</h2><p>App ne aaj ke liye due, weak, important aur recently learned CA ko ek jagah rakha hai.</p><div class="daily-grid"><div><b>${due}</b><span>Due Today</span></div><div><b>${weak}</b><span>Weak CA</span></div><div><b>${important}</b><span>Must Remember</span></div><div><b>${recent}</b><span>Recently Learned</span></div></div><div class="daily-actions"><button class="primary" onclick="startDailyFlashcards()">🧠 Start Recall</button><button class="secondary" onclick="startDailyQuiz()">📝 Daily Quiz</button></div></div>` + pool.map(card).join("");
  $("empty").classList.toggle("hidden", pool.length > 0);
}
function startDailyFlashcards() {
  flashPool = dailyPool(); flashIndex = 0; setView("flashcards");
}
function startDailyQuiz() {
  const pool = dailyPool().filter(x => { const s=getState(x.id); return s.status === "learned" || s.status === "mastered"; });
  if (pool.length < 4) { alert("Daily Quiz ke liye kam se kam 4 Learned CA chahiye."); return; }
  window.__quizPoolIds = pool.map(x => x.id); window.__quizCount = Math.min(10, pool.length); window.__quizCategory = ""; setView("quiz");
}

function render() {
  stats();
  $("quizPanel").classList.toggle("hidden", view !== "quiz");
  $("flashPanel").classList.toggle("hidden", view !== "flashcards");
  if (view === "quiz") { $("list").innerHTML = ""; $("empty").classList.add("hidden"); renderQuiz(); return; }
  if (view === "flashcards") { $("list").innerHTML = ""; $("empty").classList.add("hidden"); renderFlashcards(); return; }
  if (view === "daily") { $("quizPanel").classList.add("hidden"); $("flashPanel").classList.add("hidden"); renderDaily(); return; }
  const arr = DATA.filter(matches);
  $("list").innerHTML = arr.map(card).join("");
  $("empty").classList.toggle("hidden", arr.length > 0);
}
function mark(id, type) {
  let s = getState(id);
  if (type === "remember") { s.status = "remember"; s.due = today(); }
  if (type === "learned" || type === "review") {
    s.status = "learned";
    s.reviews = (s.reviews || 0) + 1;
    s.due = addDays(new Date(), s.reviews === 1 ? 1 : s.reviews === 2 ? 3 : s.reviews === 3 ? 7 : s.reviews === 4 ? 14 : 30);
  }
  if (s.reviews >= 6) { s.status = "mastered"; s.due = addDays(new Date(), 30); }
  progress[id] = s; save();
}
function toggleImportant(id) { const s = getState(id); s.important = !s.important; progress[id] = s; save(); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
function setView(v) { view = v; if (v !== "quiz") window.__quizPoolIds = null; document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === v)); render(); }
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.view));
["search", "month", "category", "status"].forEach(id => $(id).addEventListener("input", render));
$("resetBtn").onclick = () => { if (confirm("Reset all your revision progress?")) { progress = {}; save(); } };

// ---------------- QUIZ ----------------
// Only Learned/Mastered CA enters the quiz. Questions test actual CA facts/developments,
// while distractors are taken from other Learned/Mastered CA, not category labels.
function learnedPool() {
  const cat = window.__quizCategory || "";
  const allowed = window.__quizPoolIds ? new Set(window.__quizPoolIds) : null;
  return DATA.filter(x => {
    const s = getState(x.id);
    return x.title && (s.status === "learned" || s.status === "mastered") && (!cat || x.category === cat) && (!allowed || allowed.has(x.id));
  });
}
function uniqueOptions(correct, candidates) {
  const out = [], seen = new Set();
  [correct, ...candidates].forEach(v => { const t = cleanText(v), key = t.toLowerCase(); if (t && !seen.has(key)) { seen.add(key); out.push(t); } });
  return out.slice(0, 4);
}
function shuffled(a) { return [...a].sort(() => Math.random() - 0.5); }
function makeQuestion(x, pool, index) {
  const title = cleanText(x.title), summary = cleanText(x.summary);
  const other = shuffled(pool.filter(y => y.id !== x.id));
  let correct = firstSentence(summary) || title;
  let question = `Which statement correctly matches the current affair: “${title}”?`;
  let candidates = other.map(y => firstSentence(y.summary)).filter(v => v && v.length > 35);

  // Prefer a concrete number/date/entity when one is explicitly present in the source text.
  const concrete = title.match(/₹\s?[\d,.]+(?:\s?(?:crore|lakh|million|billion))?|\b\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b/);
  if (concrete) {
    const token = concrete[0];
    const clean = summary.replace(/\s+/g, " ");
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(s => s.includes(token));
    if (sentences.length) {
      correct = sentences[0].slice(0, 300);
      question = `According to “${title}”, which statement correctly includes the key figure mentioned in this current affair?`;
      candidates = other.map(y => {
        const ss = cleanText(y.summary).split(/(?<=[.!?])\s+/).find(s => /₹\s?[\d,.]+|\b\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b/.test(s));
        return ss ? ss.slice(0, 300) : firstSentence(y.summary);
      }).filter(Boolean);
    }
  }

  let options = uniqueOptions(correct, shuffled(candidates));
  for (const y of other) {
    const fallback = firstSentence(y.summary);
    if (fallback && !options.some(o => o.toLowerCase() === fallback.toLowerCase())) options.push(fallback);
    if (options.length === 4) break;
  }
  if (options.length < 4) {
    const titleOptions = shuffled(other.map(y => y.title).filter(Boolean));
    options = uniqueOptions(correct, [...options, ...titleOptions]);
  }
  options = shuffled(options.slice(0, 4));
  return { id: `q${index}`, question, correct, options, sourceId: x.id };
}
function renderQuiz() {
  const pool = learnedPool();
  if (pool.length < 4) {
    $("quizPanel").innerHTML = `<div class="quiz-empty"><h2>📝 Learned CA Quiz</h2><p>Quiz start karne ke liye kam se kam <b>4 CA</b> ko <b>🟢 I Learned It</b> mark karo.</p><p>Abhi ${pool.length} Learned/Mastered CA available hain. Quiz mein sirf wahi CA use honge.</p><button class="primary" onclick="setView('all')">📚 Go to All CA</button></div>`;
    return;
  }
  const count = Math.min(parseInt(window.__quizCount || 10, 10), pool.length, 20);
  const selected = shuffled(pool).slice(0, count);
  const questions = selected.map((x, i) => makeQuestion(x, pool, i + 1));
  $("quizPanel").innerHTML = `
    <div class="quiz-head"><div><h2>📝 Learned CA Quiz</h2><p>Sirf <b>🟢 Learned / ⭐ Mastered</b> CA se test. Galat answer ko app <b>⚠️ Weak CA</b> mein track karega.</p></div><div class="quiz-controls"><label>Questions <select id="quizCount"><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label><label>Category <select id="quizCategory"><option value="">All Learned CA</option></select></label><button class="primary" onclick="renderQuiz()">🔄 New Quiz</button></div></div>
    <div class="quiz-score" id="quizScore">Score: 0 / ${questions.length} • Answered: 0 / ${questions.length}</div>
    ${questions.map((q, i) => `<div class="q" data-source="${esc(q.sourceId)}" data-correct="${esc(q.correct)}">
      <div class="q-number">Question ${i + 1}</div><b>${esc(q.question)}</b>
      <div class="q-source">📌 Source CA: ${esc(selected[i].title)}</div>
      ${q.options.map(o => `<button class="option" onclick="answerQuiz(this, ${JSON.stringify(q.correct)}, ${JSON.stringify(o)}, ${JSON.stringify(q.sourceId)})">${esc(o)}</button>`).join("")}
      <div class="answer"></div>
    </div>`).join("")}
  `;
  const qc = $("quizCategory");
  [...new Set(pool.map(x => x.category))].sort().forEach(x => qc.insertAdjacentHTML("beforeend", `<option>${esc(x)}</option>`));
  qc.value = window.__quizCategory || "";
  qc.onchange = () => { window.__quizCategory = qc.value; renderQuiz(); };
  const qcount = $("quizCount"); qcount.value = String(count); qcount.onchange = () => { window.__quizCount = Number(qcount.value); renderQuiz(); };
}
function answerQuiz(btn, correct, given, sourceId) {
  const box = btn.closest(".q"), ans = box.querySelector(".answer");
  if (box.dataset.done === "1") return;
  box.querySelectorAll("button.option").forEach(b => b.disabled = true);
  const s = getState(sourceId);
  const isCorrect = given === correct;
  if (isCorrect) {
    btn.classList.add("correct");
    ans.innerHTML = "<div>✅ Correct — fact recalled successfully.</div>";
  } else {
    btn.classList.add("wrong");
    ans.innerHTML = "<div>❌ Correct answer: " + esc(correct) + "</div>";
    s.wrong = (s.wrong || 0) + 1;
    s.lastWrong = today();
    s.due = addDays(new Date(), 1);
    progress[sourceId] = s;
  }
  box.dataset.done = "1";
  box.dataset.correctPick = isCorrect ? "1" : "0";
  ans.insertAdjacentHTML("beforeend", `<div class="quiz-mark-actions">
    <span>Mark this CA:</span>
    <button class="mini green" onclick="quizMark('${sourceId}','learned',this)">🟢 Learned</button>
    <button class="mini red" onclick="quizMark('${sourceId}','remember',this)">🔴 Need Revision</button>
    <button class="mini star" onclick="quizImportant('${sourceId}',this)">⭐ Must Remember</button>
  </div>`);
  localStorage.setItem(KEY, JSON.stringify(progress));
  updateQuizScore();
  stats();
}
function updateQuizScore() {
  const correctCount = [...document.querySelectorAll(".q")].filter(q => q.dataset.correctPick === "1").length;
  const total = document.querySelectorAll(".q").length;
  const answered = document.querySelectorAll('.q[data-done="1"]').length;
  const el = $("quizScore");
  if (el) el.textContent = `Score: ${correctCount} / ${total} • Answered: ${answered} / ${total}`;
}
function quizMark(id, type, btn) {
  let s = getState(id);
  if (type === "learned") { s.status = "learned"; if (!s.due) s.due = addDays(new Date(), 1); }
  if (type === "remember") { s.status = "remember"; s.due = today(); }
  progress[id] = s;
  save(false);
  btn.parentElement.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  stats();
}
function quizImportant(id, btn) {
  const s = getState(id);
  s.important = true;
  progress[id] = s;
  save(false);
  btn.classList.add("selected");
  btn.textContent = "⭐ Marked Important";
  stats();
}

// ---------------- FLASHCARDS ----------------
function flashCandidates() {
  // Flashcards should show every Learned/Mastered CA, not only due/important cards.
  // This makes the Learned section and Flashcards useful immediately after marking a CA.
  const pool = DATA.filter(x => {
    const s = getState(x.id);
    return s.status === "learned" || s.status === "mastered" || s.status === "remember";
  });
  return pool.sort((a, b) => {
    const sa = getState(a.id), sb = getState(b.id);
    const wa = (sa.wrong || 0), wb = (sb.wrong || 0);
    const da = sa.due && sa.due <= today() ? 1 : 0, db = sb.due && sb.due <= today() ? 1 : 0;
    const ia = sa.important ? 1 : 0, ib = sb.important ? 1 : 0;
    return (wb*3 + db*2 + ib) - (wa*3 + da*2 + ia);
  });
}
function renderFlashcards() {
  flashPool = flashCandidates();
  if (!flashPool.length) {
    $("flashPanel").innerHTML = `<div class="quiz-empty"><h2>🧠 Active Recall Cards</h2><p>Abhi koi Learned CA nahi hai.</p><p>Pehle kisi CA ko <b>🟢 Learned</b> mark karo.</p></div>`;
    return;
  }
  if (flashIndex >= flashPool.length) flashIndex = 0;
  const x = flashPool[flashIndex], s = getState(x.id);
  $("flashPanel").innerHTML = `<div class="flash-head"><div><h2>🧠 Active Recall</h2><p>Answer pehle mind mein bolo. Phir answer reveal karo.</p></div><div class="flash-count">${flashIndex + 1} / ${flashPool.length}</div></div>
    <div class="flash-card"><div class="meta">${esc(x.month)} • ${esc(x.category)} ${s.wrong ? `• ⚠️ Weak ${s.wrong}x` : ""}</div><h2>${esc(x.title)}</h2><div id="flashAnswer" class="flash-answer hidden">${esc(x.summary)}</div><button class="primary" id="revealBtn">👁 Reveal Exam Note</button></div>
    <div class="flash-actions"><button class="secondary" onclick="flashPrev()">← Previous</button><button class="secondary" onclick="flashNext()">Next →</button><button class="action green" onclick="mark('${x.id}','learned'); flashNext()">🟢 I Know It</button><button class="action red" onclick="mark('${x.id}','remember'); flashNext()">🔴 Need Revision</button></div>`;
  $("revealBtn").onclick = () => { $("flashAnswer").classList.remove("hidden"); $("revealBtn").classList.add("hidden"); };
}
function flashNext() { if (!flashPool.length) flashPool = flashCandidates(); flashIndex = (flashIndex + 1) % flashPool.length; renderFlashcards(); }
function flashPrev() { if (!flashPool.length) flashPool = flashCandidates(); flashIndex = (flashIndex - 1 + flashPool.length) % flashPool.length; renderFlashcards(); }

populate();
render();
