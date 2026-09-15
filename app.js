const DATA = window.CA_DATA || [];
const KEY = "ca_vault_progress_v1";
let progress = JSON.parse(localStorage.getItem(KEY) || "{}");
let view = "all";
let flashIndex = 0;
let flashPool = [];

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const save = () => { localStorage.setItem(KEY, JSON.stringify(progress)); render(); };

function getState(id) {
  return progress[id] || { status: "new", important: false, reviews: 0, due: null, wrong: 0, lastWrong: null };
}
function setState(id, patch) { progress[id] = { ...getState(id), ...patch }; save(); }
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
    ["🟡", dueCount(), "Review Today"], ["⭐", c.important, "Must Remember"], ["⚠️", weakCount(), "Weak CA"]
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
function render() {
  stats();
  $("quizPanel").classList.toggle("hidden", view !== "quiz");
  $("flashPanel").classList.toggle("hidden", view !== "flashcards");
  if (view === "quiz") { $("list").innerHTML = ""; $("empty").classList.add("hidden"); renderQuiz(); return; }
  if (view === "flashcards") { $("list").innerHTML = ""; $("empty").classList.add("hidden"); renderFlashcards(); return; }
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
function setView(v) { view = v; document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === v)); render(); }
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setView(b.dataset.view));
["search", "month", "category", "status"].forEach(id => $(id).addEventListener("input", render));
$("resetBtn").onclick = () => { if (confirm("Reset all your revision progress?")) { progress = {}; save(); } };

// ---------------- QUIZ ----------------
// Only Learned/Mastered CA enters the quiz. Questions test actual CA facts/developments,
// while distractors are taken from other Learned/Mastered CA, not category labels.
function learnedPool() {
  const cat = window.__quizCategory || "";
  return DATA.filter(x => {
    const s = getState(x.id);
    return x.title && (s.status === "learned" || s.status === "mastered") && (!cat || x.category === cat);
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
  [...new Set(DATA.map(x => x.category))].sort().forEach(x => qc.insertAdjacentHTML("beforeend", `<option>${esc(x)}</option>`));
  qc.value = window.__quizCategory || "";
  qc.onchange = () => { window.__quizCategory = qc.value; renderQuiz(); };
  const qcount = $("quizCount"); qcount.value = String(count); qcount.onchange = () => { window.__quizCount = Number(qcount.value); renderQuiz(); };
}
function answerQuiz(btn, correct, given, sourceId) {
  const box = btn.closest(".q"), ans = box.querySelector(".answer");
  if (box.dataset.done === "1") return;
  box.querySelectorAll("button.option").forEach(b => b.disabled = true);
  const s = getState(sourceId);
  if (given === correct) {
    btn.classList.add("correct");
    ans.textContent = "✅ Correct — fact recalled successfully.";
  } else {
    btn.classList.add("wrong");
    ans.textContent = "❌ Correct answer: " + correct;
    s.wrong = (s.wrong || 0) + 1;
    s.lastWrong = today();
    // Bring a weak CA back for revision tomorrow without removing Learned status.
    s.due = addDays(new Date(), 1);
    progress[sourceId] = s;
  }
  box.dataset.done = "1";
  box.dataset.correctPick = given === correct ? "1" : "0";
  localStorage.setItem(KEY, JSON.stringify(progress));
  const correctCount = [...document.querySelectorAll(".q")].filter(q => q.dataset.correctPick === "1").length;
  const total = document.querySelectorAll(".q").length;
  $("quizScore").textContent = `Score: ${correctCount} / ${total} • Answered: ${document.querySelectorAll('.q[data-done="1"]').length} / ${total}`;
  stats();
}

// ---------------- FLASHCARDS ----------------
function flashCandidates() {
  return DATA.filter(x => {
    const s = getState(x.id);
    return (s.status === "learned" || s.status === "mastered" || s.status === "remember") && (s.due && s.due <= today() || s.important || s.wrong > 0);
  });
}
function renderFlashcards() {
  flashPool = flashCandidates();
  if (!flashPool.length) {
    $("flashPanel").innerHTML = `<div class="quiz-empty"><h2>🧠 Active Recall Cards</h2><p>Abhi koi due/important/weak learned CA nahi hai.</p><p>Pehle CA ko <b>🟢 Learned</b> ya <b>⭐ Must Remember</b> mark karo.</p></div>`;
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
