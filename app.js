'use strict';

// ─────────────────────────────────────────────────────────────
//  SUBJECT METADATA
// ─────────────────────────────────────────────────────────────
const SUBJECTS = {
  'Physiology':              { icon:'🧬', color:'#4fc3f7' },
  'Pharmacology':            { icon:'💊', color:'#a78bfa' },
  'Internal Medicine':       { icon:'🩺', color:'#4ade80' },
  'Pediatrics':              { icon:'👶', color:'#fbbf24' },
  'Pathology':               { icon:'🔬', color:'#f472b6' },
  'Biochemistry':            { icon:'⚗️', color:'#34d399' },
  'Surgery':                 { icon:'🔪', color:'#fb7185' },
  'Anatomy':                 { icon:'🦴', color:'#e879f9' },
  'Microbiology':            { icon:'🦠', color:'#38bdf8' },
  'Obstetrics & Gynaecology':{ icon:'🤰', color:'#f9a8d4' },
  'Community Medicine':      { icon:'🏥', color:'#86efac' },
};

// ─────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────
const S = {
  allQ:         [],           // master question bank
  queue:        [],           // active quiz queue
  current:      0,
  selected:     [],
  submitted:    false,
  mode:         'practice',
  activeSubjects: new Set(), // empty = ALL subjects
  filterTopic:  'all',
  filterDiff:   'all',
  filterMax:    'all',
  timerEnabled: false,
  timerSecs:    60,
  timerLeft:    0,
  timerIv:      null,
  soundEnabled: false,
  bookmarks:    new Set(),
  history:      [],           // {gid, correct, timeTaken, topic, subject, skipped}
  sess:         { correct:0, wrong:0, skipped:0, attempted:0 },
  startTime:    null,
  qStart:       null,
  examAnswers:  {},           // gid -> selectedIndices (exam mode)
};

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadStorage();
  await loadQuestions();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  bindNav();
  bindModes();
  bindToggles();
  bindKeyboard();
  renderHome();
  showScreen('home');
});

async function loadQuestions() {
  try {
    const r = await fetch('./questions.json');
    S.allQ = await r.json();
  } catch(e) { toast('Failed to load questions!','e'); }
}

// ─────────────────────────────────────────────────────────────
//  STORAGE
// ─────────────────────────────────────────────────────────────
function saveStorage() {
  try {
    localStorage.setItem('pgi_v2', JSON.stringify({
      bookmarks: [...S.bookmarks],
      history:   S.history,
    }));
  } catch(e) {}
}

function loadStorage() {
  try {
    const d = JSON.parse(localStorage.getItem('pgi_v2') || '{}');
    S.bookmarks = new Set(d.bookmarks || []);
    S.history   = d.history || [];
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nb').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.scr;
      if (t === 'bookmarks') renderBookmarks();
      if (t === 'analytics') renderAnalytics();
      if (t === 'home')      renderHome();
      showScreen(t);
    });
  });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nb').forEach(b => b.classList.toggle('on', b.dataset.scr === name));
  const pw = document.getElementById('prog-wrap');
  pw.style.display = name === 'quiz' ? 'block' : 'none';
  window.scrollTo(0, 0);
}

// ─────────────────────────────────────────────────────────────
//  HOME
// ─────────────────────────────────────────────────────────────
function renderHome() {
  renderSubjectGrid();
  updateTopicFilter();
  updateHomeStats();
}

function renderSubjectGrid() {
  const grid = document.getElementById('subj-grid');
  const subjCounts = {};
  S.allQ.forEach(q => { subjCounts[q.subject] = (subjCounts[q.subject]||0)+1; });

  grid.innerHTML = Object.entries(SUBJECTS).map(([name, meta]) => {
    const count = subjCounts[name] || 0;
    const active = S.activeSubjects.size === 0 || S.activeSubjects.has(name);
    return `
      <div class="subj-card ${active ? 'active-subj' : ''}"
           style="--s-color:${meta.color}"
           onclick="toggleSubject('${name}')">
        <div class="subj-dot"></div>
        <div class="s-icon">${meta.icon}</div>
        <div class="s-name">${name}</div>
        <div class="s-count">${count} MCQs</div>
      </div>`;
  }).join('');
}

function toggleSubject(name) {
  // If clicking the only active one, select all
  if (S.activeSubjects.size === 1 && S.activeSubjects.has(name)) {
    S.activeSubjects.clear();
  } else if (S.activeSubjects.size === 0) {
    // All were selected: now select only this one
    Object.keys(SUBJECTS).forEach(s => { if (s !== name) S.activeSubjects.add(s); });
    S.activeSubjects.delete(name);
    // Actually: user clicked one subject to FOCUS on it
    S.activeSubjects.clear();
    S.activeSubjects.add(name);
  } else {
    if (S.activeSubjects.has(name)) {
      S.activeSubjects.delete(name);
      if (S.activeSubjects.size === 0) S.activeSubjects.clear(); // all selected again
    } else {
      S.activeSubjects.add(name);
    }
  }
  renderSubjectGrid();
  updateTopicFilter();
}

function getActiveQ() {
  let qs = S.allQ;
  if (S.activeSubjects.size > 0) qs = qs.filter(q => S.activeSubjects.has(q.subject));
  return qs;
}

function updateTopicFilter() {
  const qs = getActiveQ();
  const topics = ['all', ...new Set(qs.map(q => q.topic))].sort();
  const sel = document.getElementById('fil-topic');
  const cur = sel.value;
  sel.innerHTML = topics.map(t =>
    `<option value="${t}" ${t===cur?'selected':''}>${t==='all'?'All Topics':t}</option>`
  ).join('');
}

function updateHomeStats() {
  const total  = S.allQ.length;
  const att    = S.history.length;
  const cor    = S.history.filter(h => h.correct).length;
  const pct    = att ? Math.round(cor/att*100) : null;
  const subjCount = Object.keys(SUBJECTS).length;

  setText('hs-total',     total);
  setText('hs-subjects',  subjCount);
  setText('hs-attempted', att);
  setText('hs-accuracy',  pct !== null ? pct+'%' : '—');
  setText('hs-bookmarks', S.bookmarks.size);
}

// ─────────────────────────────────────────────────────────────
//  MODE BINDING
// ─────────────────────────────────────────────────────────────
function bindModes() {
  document.querySelectorAll('.mode-card').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.mode-card').forEach(x => x.classList.remove('sel'));
      c.classList.add('sel');
      S.mode = c.dataset.mode;
    });
  });
}

function bindToggles() {
  const tt = document.getElementById('tog-timer');
  tt.addEventListener('click', () => {
    tt.classList.toggle('on');
    S.timerEnabled = tt.classList.contains('on');
    document.getElementById('timer-cfg').style.display = S.timerEnabled ? 'block' : 'none';
    const td = document.getElementById('q-timer');
    if (td) td.style.display = S.timerEnabled ? 'block' : 'none';
  });
  const ts = document.getElementById('tog-sound');
  ts.addEventListener('click', () => {
    ts.classList.toggle('on');
    S.soundEnabled = ts.classList.contains('on');
  });
}

// ─────────────────────────────────────────────────────────────
//  START QUIZ
// ─────────────────────────────────────────────────────────────
function startQuiz() {
  S.filterTopic = document.getElementById('fil-topic').value;
  S.filterDiff  = document.getElementById('fil-diff').value;
  S.filterMax   = document.getElementById('fil-max').value;
  S.timerSecs   = parseInt(document.getElementById('timer-secs').value) || 60;

  let pool = getActiveQ();

  // Topic + difficulty filter
  pool = pool.filter(q => {
    const tok = S.filterTopic === 'all' || q.topic === S.filterTopic;
    const dok = S.filterDiff  === 'all' || q.difficulty === S.filterDiff;
    return tok && dok;
  });

  if (!pool.length) { toast('No questions match filters!','e'); return; }

  // Mode logic
  if (S.mode === 'revision') {
    const wrongGids = new Set(S.history.filter(h => !h.correct).map(h => h.gid));
    pool = pool.filter(q => wrongGids.has(q.gid));
    if (!pool.length) { toast('No wrong answers yet — attempt a quiz first!','i'); return; }
  }

  if (S.mode === 'random') pool = shuffle([...pool]);

  // Max questions
  if (S.filterMax !== 'all') {
    const max = parseInt(S.filterMax);
    pool = pool.slice(0, max);
  }

  S.queue        = pool;
  S.current      = 0;
  S.submitted    = false;
  S.selected     = [];
  S.sess         = { correct:0, wrong:0, skipped:0, attempted:0 };
  S.startTime    = Date.now();
  S.examAnswers  = {};

  showScreen('quiz');
  renderQ();
}

// ─────────────────────────────────────────────────────────────
//  QUIZ ENGINE
// ─────────────────────────────────────────────────────────────
function curQ() { return S.queue[S.current]; }

function renderQ() {
  const q = curQ();
  if (!q) { showResults(); return; }

  S.submitted  = false;
  S.selected   = [];
  S.qStart     = Date.now();

  updateProgBar();
  updateStatsStrip();

  const LETTERS = ['A','B','C','D','E'];
  const subj = SUBJECTS[q.subject] || { icon:'📖', color:'#4fc3f7' };

  // Header tags
  setText('q-subj',  q.subject || '—');
  setText('q-topic', q.topic   || '—');
  setText('q-mode',  modeLabel(S.mode));
  setText('q-num',   `Q${S.current+1} / ${S.queue.length}`);
  setText('q-text',  q.question);

  // Subject color on tag
  const subjEl = document.getElementById('q-subj');
  subjEl.style.background = hexAlpha(subj.color, 0.12);
  subjEl.style.color      = subj.color;
  subjEl.style.borderColor= hexAlpha(subj.color, 0.25);

  // Multi-select hint
  const mh = document.getElementById('q-multi-hint');
  const qm = document.getElementById('q-multi');
  mh.style.display = q.isMultiSelect ? 'flex' : 'none';
  qm.style.display = q.isMultiSelect ? 'inline-flex' : 'none';

  // Bookmark state
  document.getElementById('btn-bm').classList.toggle('bookmarked', S.bookmarks.has(q.gid));

  // Restore exam-mode partial selection
  if (S.mode === 'exam' && S.examAnswers[q.gid]) {
    S.selected = [...S.examAnswers[q.gid]];
  }

  // Build options
  const grid = document.getElementById('opts-grid');
  grid.innerHTML = q.options.map((opt, i) => `
    <button class="opt${S.selected.includes(i) ? ' sel' : ''}"
            data-idx="${i}" onclick="selectOpt(${i})" ${S.submitted?'disabled':''}>
      <span class="opt-let">${LETTERS[i]}</span>
      <span class="opt-txt">${opt}</span>
      <span class="opt-ico">${svgCheck()}</span>
    </button>`
  ).join('');

  // Reset explanation for each new question
  const ec = document.getElementById('exp-card');
  ec.style.display = 'none';
  ec.classList.remove('show','wrong-exp');

  // Correct answer line hidden
  document.getElementById('correct-line').style.display = 'none';

  // Buttons
  const btnSub  = document.getElementById('btn-submit');
  const btnNext = document.getElementById('btn-next');
  btnSub.style.display  = 'inline-flex';
  btnNext.style.display = 'none';
  btnSub.disabled       = S.selected.length === 0;
  btnSub.textContent    = S.mode === 'exam' ? 'Confirm' : 'Submit';

  // Timer
  clearInterval(S.timerIv);
  const timerEl = document.getElementById('q-timer');
  if (S.timerEnabled) {
    timerEl.style.display = 'block';
    startTimer(S.timerSecs);
  } else {
    timerEl.style.display = 'none';
  }
}

function selectOpt(idx) {
  if (S.submitted) return;
  const q = curQ();

  if (q.isMultiSelect) {
    const pos = S.selected.indexOf(idx);
    pos === -1 ? S.selected.push(idx) : S.selected.splice(pos, 1);
  } else {
    S.selected = [idx];
  }

  // Save for exam mode navigation
  if (S.mode === 'exam') S.examAnswers[q.gid] = [...S.selected];

  document.querySelectorAll('.opt').forEach((btn, i) => {
    btn.classList.toggle('sel', S.selected.includes(i));
  });

  document.getElementById('btn-submit').disabled = S.selected.length === 0;
}

function submitAns() {
  if (S.submitted || S.selected.length === 0) return;
  S.submitted = true;
  clearInterval(S.timerIv);

  const q         = curQ();
  const timeTaken = Math.round((Date.now() - S.qStart) / 1000);
  const LETTERS   = ['A','B','C','D','E'];

  const correctSet  = new Set(q.correctAnswers);
  const selectedSet = new Set(S.selected);
  const isCorrect   = setsEqual(correctSet, selectedSet);

  // Stats
  S.sess.attempted++;
  isCorrect ? S.sess.correct++ : S.sess.wrong++;

  S.history.push({
    gid: q.gid, correct: isCorrect, timeTaken,
    topic: q.topic, subject: q.subject
  });
  saveStorage();

  // Color options
  document.querySelectorAll('.opt').forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.remove('sel','dim');
    if (correctSet.has(i)) {
      btn.classList.add('correct');
      btn.querySelector('.opt-ico').innerHTML = svgCheck();
    } else if (selectedSet.has(i) && !correctSet.has(i)) {
      btn.classList.add('wrong');
      btn.querySelector('.opt-ico').innerHTML = svgX();
    } else {
      btn.classList.add('dim');
    }
  });

  // Show full explanation
  const ec  = document.getElementById('exp-card');
  const et  = document.getElementById('exp-txt');
  et.textContent = q.explanation || 'No explanation available for this question.';
  if (!isCorrect) ec.classList.add('wrong-exp');
  ec.style.display = 'block';
  ec.classList.add('show');

  // Correct answer label (practice mode)
  if (S.mode === 'practice') {
    const cl = document.getElementById('correct-line');
    const cLetters = q.correctAnswers.map(i => LETTERS[i]).join(', ');
    cl.textContent = `✅ Correct Answer: ${cLetters}`;
    cl.style.display = 'block';
  }

  // Sound
  if (S.soundEnabled) playSound(isCorrect);

  // Swap buttons
  document.getElementById('btn-submit').style.display = 'none';
  document.getElementById('btn-next').style.display   = 'inline-flex';

  updateStatsStrip();
}

function skipQ() {
  clearInterval(S.timerIv);
  S.sess.skipped++;
  S.sess.attempted++;
  const q = curQ();
  if (q) S.history.push({ gid: q.gid, correct: false, timeTaken: 0, topic: q.topic, subject: q.subject, skipped: true });
  saveStorage();
  nextQ();
}

function nextQ() {
  clearInterval(S.timerIv);
  if (S.current < S.queue.length - 1) {
    S.current++;
    renderQ();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    showResults();
  }
}

function prevQ() {
  if (S.current > 0) {
    S.current--;
    renderQ();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ─────────────────────────────────────────────────────────────
//  TIMER
// ─────────────────────────────────────────────────────────────
function startTimer(secs) {
  S.timerLeft = secs;
  updateTimerUI();
  S.timerIv = setInterval(() => {
    S.timerLeft--;
    updateTimerUI();
    if (S.timerLeft <= 0) {
      clearInterval(S.timerIv);
      toast('⏱ Time up!','e');
      if (!S.submitted) submitAns();
    }
  }, 1000);
}

function updateTimerUI() {
  const el = document.getElementById('q-timer');
  if (!el) return;
  const m = String(Math.floor(S.timerLeft/60)).padStart(2,'0');
  const s = String(S.timerLeft % 60).padStart(2,'0');
  el.textContent = `${m}:${s}`;
  el.className = 'timer';
  if (S.timerLeft <= 10)      el.classList.add('danger');
  else if (S.timerLeft <= 20) el.classList.add('warn');
}

// ─────────────────────────────────────────────────────────────
//  PROGRESS & STATS
// ─────────────────────────────────────────────────────────────
function updateProgBar() {
  const pct = (S.current / S.queue.length * 100).toFixed(1);
  document.getElementById('prog-fill').style.width    = pct + '%';
  document.getElementById('prog-counter').textContent = `${S.current+1} / ${S.queue.length}`;
  document.getElementById('prog-pct').textContent     = Math.round(pct) + '%';
}

function updateStatsStrip() {
  const remaining = S.queue.length - S.sess.attempted;
  const pct = S.sess.attempted ? Math.round(S.sess.correct / S.sess.attempted * 100) : null;
  setText('ss-correct', S.sess.correct);
  setText('ss-wrong',   S.sess.wrong);
  setText('ss-remain',  remaining);
  setText('ss-pct',     pct !== null ? pct+'%' : '—');
}

// ─────────────────────────────────────────────────────────────
//  BOOKMARKS
// ─────────────────────────────────────────────────────────────
function updateBMButton(gid) {
  const isBookmarked = S.bookmarks.has(gid);
  const btn   = document.getElementById('btn-bm');
  const star  = document.getElementById('bm-star-icon');
  const label = document.getElementById('bm-btn-label');
  if (!btn) return;
  if (isBookmarked) {
    btn.style.borderColor     = 'rgba(251,191,36,0.7)';
    btn.style.background      = 'rgba(251,191,36,0.12)';
    btn.style.color           = '#fbbf24';
    star.textContent          = '★';
    label.textContent         = 'Bookmarked!';
  } else {
    btn.style.borderColor     = 'rgba(251,191,36,0.35)';
    btn.style.background      = 'rgba(251,191,36,0.05)';
    btn.style.color           = 'var(--amber)';
    star.textContent          = '☆';
    label.textContent         = 'Save to Bookmarks';
  }
}

function toggleBM(gid) {
  if (!gid) return;
  if (S.bookmarks.has(gid)) {
    S.bookmarks.delete(gid);
    toast('Bookmark removed','i');
  } else {
    S.bookmarks.add(gid);
    toast('⭐ Bookmarked!','i');
  }
  updateBMButton(gid);
  saveStorage();
  updateHomeStats();
}

function renderBookmarks() {
  const list = document.getElementById('bm-list');
  const bmQs = S.allQ.filter(q => S.bookmarks.has(q.gid));

  if (!bmQs.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-ico">⭐</div><div class="empty-txt">No bookmarks yet</div><div class="empty-sub">Press ⭐ during a quiz to save tricky questions.</div></div>`;
    return;
  }

  list.innerHTML = bmQs.map(q => {
    const meta = SUBJECTS[q.subject] || { color:'#4fc3f7' };
    return `
      <div class="glass bm-item" onclick="jumpToQ(${q.gid})">
        <span class="bm-num" style="color:${meta.color};background:${hexAlpha(meta.color,0.1)}">#${q.id}</span>
        <div style="flex:1">
          <div class="bm-q">${q.question}</div>
          <div class="bm-meta">${q.subject} · ${q.topic}</div>
        </div>
        <button class="btn btn-g btn-sm btn-ico"
                style="color:var(--amber);flex-shrink:0"
                onclick="event.stopPropagation();toggleBM(${q.gid});renderBookmarks()">⭐</button>
      </div>`;
  }).join('');
}

function jumpToQ(gid) {
  const idx = S.queue.findIndex(q => q.gid === gid);
  if (idx !== -1) {
    S.current   = idx;
  } else {
    const q = S.allQ.find(x => x.gid === gid);
    if (!q) return;
    S.queue     = [q];
    S.current   = 0;
    S.sess      = { correct:0, wrong:0, skipped:0, attempted:0 };
    S.startTime = Date.now();
  }
  S.submitted = false;
  S.selected  = [];
  showScreen('quiz');
  renderQ();
}

// ─────────────────────────────────────────────────────────────
//  RESULTS
// ─────────────────────────────────────────────────────────────
function showResults() {
  clearInterval(S.timerIv);
  const total   = S.queue.length;
  const pct     = total ? Math.round(S.sess.correct / total * 100) : 0;
  const elapsed = Math.round((Date.now() - S.startTime) / 1000);

  setText('res-score',   pct + '%');
  setText('res-correct', S.sess.correct);
  setText('res-wrong',   S.sess.wrong);
  setText('res-skip',    S.sess.skipped);
  setText('res-total',   total);
  setText('res-time',    fmtTime(elapsed));

  const badge = document.getElementById('res-badge');
  if (pct >= 80)      { badge.textContent='🏆 Excellent!';      badge.className='res-badge b-ex'; }
  else if (pct >= 60) { badge.textContent='✅ Good Job!';        badge.className='res-badge b-gd'; }
  else if (pct >= 40) { badge.textContent='📚 Keep Revising';   badge.className='res-badge b-av'; }
  else                { badge.textContent='💪 Keep Practicing'; badge.className='res-badge b-po'; }

  showScreen('results');
  renderResultCharts();
  if (pct >= 80) confetti();
}

function renderResultCharts() {
  // build topic map from this session
  const topicMap = {};
  const sessionQGids = new Set(S.queue.map(q => q.gid));
  S.history.filter(h => sessionQGids.has(h.gid)).forEach(h => {
    if (!topicMap[h.topic]) topicMap[h.topic] = { c:0, t:0 };
    topicMap[h.topic].t++;
    if (h.correct) topicMap[h.topic].c++;
  });

  const labels = Object.keys(topicMap);
  const accs   = labels.map(t => topicMap[t].t ? Math.round(topicMap[t].c/topicMap[t].t*100) : 0);

  destroyChart('ch-topic'); destroyChart('ch-pie');

  const ctx1 = document.getElementById('ch-topic')?.getContext('2d');
  if (ctx1 && labels.length) {
    _charts['ch-topic'] = new Chart(ctx1, {
      type: 'bar',
      data: { labels, datasets: [{
        label:'Accuracy %', data: accs,
        backgroundColor: accs.map(v => v>=60 ? 'rgba(74,222,128,.55)' : 'rgba(248,113,113,.55)'),
        borderColor:      accs.map(v => v>=60 ? '#4ade80' : '#f87171'),
        borderWidth:1, borderRadius:5
      }]},
      options: chartOpts(100)
    });
  }

  const ctx2 = document.getElementById('ch-pie')?.getContext('2d');
  if (ctx2) {
    _charts['ch-pie'] = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels:['Correct','Wrong','Skipped'],
        datasets:[{ data:[S.sess.correct, S.sess.wrong, S.sess.skipped],
          backgroundColor:['rgba(74,222,128,.7)','rgba(248,113,113,.7)','rgba(251,191,36,.5)'],
          borderColor:['#4ade80','#f87171','#fbbf24'], borderWidth:2 }]
      },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'65%',
        plugins:{ legend:{ position:'bottom', labels:{ color:'#8892a4', font:{ family:'Outfit' }}}}}
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────────────────────
function renderAnalytics() {
  const body = document.getElementById('analytics-body');

  if (!S.history.length) {
    body.innerHTML = `<div class="empty-state"><div class="empty-ico">📊</div><div class="empty-txt">No data yet</div><div class="empty-sub">Complete a quiz to see your analytics.</div></div>`;
    return;
  }

  // Per-subject map
  const subjMap = {};
  S.history.forEach(h => {
    if (!subjMap[h.subject]) subjMap[h.subject] = { c:0, t:0 };
    subjMap[h.subject].t++;
    if (h.correct) subjMap[h.subject].c++;
  });

  // Per-topic map
  const topicMap = {};
  S.history.forEach(h => {
    if (!topicMap[h.topic]) topicMap[h.topic] = { c:0, t:0, subj:h.subject };
    topicMap[h.topic].t++;
    if (h.correct) topicMap[h.topic].c++;
  });

  const sLabels = Object.keys(subjMap);
  const sAccs   = sLabels.map(s => Math.round(subjMap[s].c / subjMap[s].t * 100));
  const sTots   = sLabels.map(s => subjMap[s].t);

  const tLabels = Object.keys(topicMap);
  const tAccs   = tLabels.map(t => Math.round(topicMap[t].c / topicMap[t].t * 100));

  const totalAtt = S.history.length;
  const totalCor = S.history.filter(h => h.correct).length;
  const overallPct = Math.round(totalCor/totalAtt*100);

  // Weak topics (< 60%)
  const weak = tLabels
    .map((t,i) => ({ topic:t, acc:tAccs[i], subj:topicMap[t].subj, total:topicMap[t].t }))
    .filter(x => x.acc < 60)
    .sort((a,b) => a.acc - b.acc)
    .slice(0, 10);

  body.innerHTML = `
    <!-- Overview cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px">
      ${statCard('🎯','Overall Accuracy', overallPct+'%', '#4fc3f7')}
      ${statCard('📝','Total Attempted', totalAtt, '#a78bfa')}
      ${statCard('✅','Total Correct',   totalCor, '#4ade80')}
      ${statCard('❌','Total Wrong',     totalAtt-totalCor, '#f87171')}
    </div>

    <!-- Subject accuracy -->
    <div class="glass chart-card" style="margin-bottom:16px">
      <div class="chart-title">📚 Accuracy by Subject</div>
      <div style="height:220px"><canvas id="ac-subj"></canvas></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="glass chart-card">
        <div class="chart-title">🔬 Topic Accuracy</div>
        <div style="height:200px"><canvas id="ac-topic"></canvas></div>
      </div>
      <div class="glass chart-card">
        <div class="chart-title">📊 Questions Attempted</div>
        <div style="height:200px"><canvas id="ac-att"></canvas></div>
      </div>
    </div>

    <!-- Weak topics -->
    <div class="glass" style="padding:22px;margin-bottom:16px">
      <div class="chart-title">⚠️ Weak Areas (< 60% accuracy)</div>
      <div id="weak-topics">
        ${weak.length ? weak.map(w => `
          <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${w.topic}</div>
              <div style="font-size:10px;color:var(--text3);margin-top:2px">${w.subj} · ${w.total} attempted</div>
            </div>
            <div style="flex:2;background:rgba(255,255,255,.06);border-radius:99px;height:5px;overflow:hidden">
              <div style="width:${w.acc}%;height:100%;background:${w.acc<40?'var(--red)':'var(--amber)'};border-radius:99px"></div>
            </div>
            <span style="font-family:var(--mono);font-size:12px;color:${w.acc<40?'var(--red)':'var(--amber)'};min-width:34px;text-align:right">${w.acc}%</span>
          </div>`).join('')
        : '<p style="font-size:13px;color:var(--green);padding:8px 0">🎉 No weak areas! Outstanding performance.</p>'}
      </div>
    </div>

    <!-- PDF Export -->
    <div class="glass" style="padding:22px">
      <div class="chart-title">📥 Export Reports</div>
      <div style="display:flex;gap:9px;flex-wrap:wrap">
        <button class="btn btn-danger btn-sm" onclick="exportPDF('wrong')">📕 Wrong Questions</button>
        <button class="btn btn-g btn-sm" onclick="exportPDF('bookmarked')">⭐ Bookmarked</button>
        <button class="btn btn-a btn-sm" onclick="exportPDF('revision')">📋 Top 20 Revision</button>
      </div>
    </div>
  `;

  setTimeout(() => {
    destroyChart('ac-subj'); destroyChart('ac-topic'); destroyChart('ac-att');

    // Subject bar
    const c1 = document.getElementById('ac-subj')?.getContext('2d');
    if (c1) _charts['ac-subj'] = new Chart(c1, {
      type:'bar',
      data:{ labels:sLabels, datasets:[{
        label:'Accuracy %', data:sAccs,
        backgroundColor: sAccs.map(v=>v>=60?'rgba(74,222,128,.55)':'rgba(248,113,113,.55)'),
        borderColor:      sAccs.map(v=>v>=60?'#4ade80':'#f87171'),
        borderWidth:1, borderRadius:5
      }]},
      options: chartOpts(100)
    });

    // Topic bar
    const c2 = document.getElementById('ac-topic')?.getContext('2d');
    if (c2) _charts['ac-topic'] = new Chart(c2, {
      type:'bar',
      data:{ labels:tLabels, datasets:[{
        label:'Accuracy %', data:tAccs,
        backgroundColor:'rgba(79,195,247,.45)', borderColor:'#4fc3f7',
        borderWidth:1, borderRadius:4
      }]},
      options: chartOpts(100)
    });

    // Attempted bar
    const c3 = document.getElementById('ac-att')?.getContext('2d');
    if (c3) _charts['ac-att'] = new Chart(c3, {
      type:'bar',
      data:{ labels:sLabels, datasets:[{
        label:'Attempted', data:sTots,
        backgroundColor:'rgba(167,139,250,.45)', borderColor:'#a78bfa',
        borderWidth:1, borderRadius:4
      }]},
      options: chartOpts()
    });
  }, 80);
}

function statCard(icon, label, value, color) {
  return `
    <div class="glass" style="padding:18px;text-align:center">
      <div style="font-size:22px;margin-bottom:6px">${icon}</div>
      <div style="font-size:20px;font-weight:800;font-family:var(--mono);color:${color};line-height:1">${value}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px;font-weight:500">${label}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────────────────────
function doSearch(raw) {
  const q = raw.toLowerCase().trim();
  const container = document.getElementById('srch-results');
  if (!q) { container.innerHTML=''; return; }

  const results = S.allQ.filter(x =>
    x.question.toLowerCase().includes(q) ||
    x.topic.toLowerCase().includes(q) ||
    x.subject.toLowerCase().includes(q) ||
    x.options.some(o => o.toLowerCase().includes(q))
  ).slice(0, 15);

  if (!results.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-txt">No results for "${raw}"</div></div>`;
    return;
  }

  container.innerHTML = results.map(x => {
    const meta = SUBJECTS[x.subject] || { color:'#4fc3f7' };
    const hi = t => t.replace(new RegExp(`(${q})`,'gi'),'<mark style="background:rgba(79,195,247,.22);color:#4fc3f7;border-radius:2px">$1</mark>');
    return `
      <div class="glass bm-item" style="margin-bottom:8px" onclick="jumpToQ(${x.gid})">
        <span class="bm-num" style="color:${meta.color};background:${hexAlpha(meta.color,0.1)}">#${x.id}</span>
        <div style="flex:1">
          <div class="bm-q" style="font-size:12px">${hi(x.question)}</div>
          <div class="bm-meta">${x.subject} · ${x.topic}</div>
        </div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
//  PDF EXPORT
// ─────────────────────────────────────────────────────────────
async function exportPDF(type) {
  let qs = [];
  if (type === 'wrong') {
    const wrongGids = new Set(S.history.filter(h=>!h.correct).map(h=>h.gid));
    qs = S.allQ.filter(q => wrongGids.has(q.gid));
  } else if (type === 'bookmarked') {
    qs = S.allQ.filter(q => S.bookmarks.has(q.gid));
  } else if (type === 'revision') {
    const wrongGids = new Set(S.history.filter(h=>!h.correct).map(h=>h.gid));
    qs = S.allQ.filter(q => wrongGids.has(q.gid)).slice(0, 20);
  }

  if (!qs.length) { toast('No questions to export!','i'); return; }
  toast('Generating PDF…','i');

  try {
    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ unit:'mm', format:'a4' });
    const pageW = 210, margin = 16, maxW = pageW - margin*2;
    let y = 20;

    const addText = (text, size, rgb, bold=false) => {
      doc.setFontSize(size);
      doc.setTextColor(...rgb);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(String(text||''), maxW);
      lines.forEach(line => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += size * 0.44;
      });
      y += 2;
    };

    // Dark background every page (draw on each addPage)
    const drawBG = () => {
      doc.setFillColor(5, 8, 16);
      doc.rect(0, 0, 210, 297, 'F');
    };
    drawBG();

    // Header
    doc.setFillColor(15, 25, 50);
    doc.roundedRect(margin-4, 8, maxW+8, 18, 3, 3, 'F');
    addText(`PGI Medical Quiz — ${type.charAt(0).toUpperCase()+type.slice(1)} Questions`, 13, [79,195,247], true);
    addText(`Generated: ${new Date().toLocaleDateString()}  |  Questions: ${qs.length}`, 9, [136,146,164]);
    y += 4;

    let lastSubject = null;

    qs.forEach((q, idx) => {
      if (y > 250) { doc.addPage(); drawBG(); y = 20; }

      // Subject header when subject changes
      if (q.subject !== lastSubject) {
        lastSubject = q.subject;
        y += 4;
        doc.setFillColor(20, 35, 65);
        doc.roundedRect(margin-4, y-5, maxW+8, 11, 2, 2, 'F');
        addText(`── ${q.subject} ──`, 10, [167,139,250], true);
        y += 2;
      }

      if (y > 250) { doc.addPage(); drawBG(); y = 20; }

      // Question block
      doc.setFillColor(12, 20, 40);
      const qLines = doc.splitTextToSize(`${idx+1}. ${q.question}`, maxW-6);
      const boxH   = qLines.length*5.5 + 8;
      doc.roundedRect(margin-4, y-5, maxW+8, boxH, 2, 2, 'F');
      addText(`${idx+1}. ${q.question}`, 10, [240,244,255], true);
      y += 2;

      const LETTERS = ['A','B','C','D','E'];
      q.options.forEach((opt, i) => {
        const isCor = q.correctAnswers.includes(i);
        addText(`  ${LETTERS[i]}) ${opt}${isCor?' ✓':''}`, 9, isCor?[74,222,128]:[136,146,164]);
      });

      y += 3;

      // Full explanation block — no truncation
      if (q.explanation) {
        if (y > 255) { doc.addPage(); drawBG(); y = 20; }
        doc.setFillColor(8, 35, 25);
        const expLines = doc.splitTextToSize('Explanation: ' + q.explanation, maxW-6);
        const expBoxH  = expLines.length*5 + 8;
        doc.roundedRect(margin-4, y-4, maxW+8, expBoxH, 2, 2, 'F');
        addText('Explanation: ' + q.explanation, 8.5, [100,200,150]);
      }

      y += 10;
    });

    doc.save(`pgi-${type}-questions.pdf`);
    toast('PDF downloaded!','s');
  } catch(e) {
    console.error(e);
    toast('PDF export failed','e');
  }
}

// ─────────────────────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────
function bindKeyboard() {
  document.addEventListener('keydown', e => {
    const scr = document.querySelector('.screen.active')?.id;
    if (scr !== 'screen-quiz') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (!S.submitted) {
      const map = {'1':0,'2':1,'3':2,'4':3,'5':4,'a':0,'b':1,'c':2,'d':3,'e':4};
      if (map[e.key] !== undefined) {
        const btns = document.querySelectorAll('.opt');
        if (btns[map[e.key]]) btns[map[e.key]].click();
      }
      if (e.key === 'Enter') submitAns();
    } else {
      if (e.key === 'Enter' || e.key === 'ArrowRight') nextQ();
      if (e.key === 'ArrowLeft') prevQ();
    }
    if (e.key === 'b' || e.key === 'B') toggleBM(curQ()?.gid);
  });
}

// ─────────────────────────────────────────────────────────────
//  CHARTS
// ─────────────────────────────────────────────────────────────
const _charts = {};
function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function chartOpts(maxY) {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display:false },
      tooltip: {
        backgroundColor:'rgba(5,8,16,.92)', titleColor:'#f0f4ff', bodyColor:'#8892a4',
        borderColor:'rgba(79,195,247,.25)', borderWidth:1,
        titleFont:{ family:'Outfit', size:12 }, bodyFont:{ family:'Outfit', size:11 }
      }
    },
    scales: {
      x: { ticks:{ color:'#8892a4', font:{ family:'Outfit', size:10 }, maxRotation:40 },
           grid:{ color:'rgba(255,255,255,.03)' }},
      y: { ticks:{ color:'#8892a4', font:{ family:'Outfit', size:10 } },
           grid:{ color:'rgba(255,255,255,.03)' },
           max: maxY || undefined, min:0 }
    }
  };
}

// ─────────────────────────────────────────────────────────────
//  SOUND
// ─────────────────────────────────────────────────────────────
function playSound(correct) {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = correct ? 880 : 200;
    o.type            = correct ? 'sine' : 'sawtooth';
    g.gain.value      = 0.12;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4);
    o.stop(ctx.currentTime+0.4);
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────
//  CONFETTI
// ─────────────────────────────────────────────────────────────
function confetti() {
  const colors = ['#4fc3f7','#a78bfa','#4ade80','#fbbf24','#f472b6'];
  for (let i=0; i<60; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random()*6;
    el.style.cssText = `
      position:fixed;width:${size}px;height:${size}px;border-radius:${Math.random()>0.5?'50%':'2px'};
      background:${colors[i%colors.length]};
      left:${Math.random()*100}vw;top:-20px;z-index:9999;
      animation:cFall ${1.5+Math.random()*2}s ease ${Math.random()*0.6}s forwards;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

// ─────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────
function toast(msg, type='i') {
  const w  = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = `t-msg t-${type}`;
  el.textContent = msg;
  w.innerHTML = '';
  w.appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

// ─────────────────────────────────────────────────────────────
//  MISC / UTILS
// ─────────────────────────────────────────────────────────────
function clearProgress() {
  if (!confirm('Clear ALL progress, history and bookmarks? This cannot be undone.')) return;
  S.history   = [];
  S.bookmarks = new Set();
  saveStorage();
  toast('Progress cleared','i');
  updateHomeStats();
}

function shuffle(arr) {
  for (let i=arr.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function fmtTime(secs) {
  const m = Math.floor(secs/60), s = secs%60;
  return `${m}m ${s}s`;
}

function modeLabel(m) {
  return { practice:'Practice', exam:'Exam', revision:'Revision', random:'Random' }[m] || m;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function svgCheck() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
}
function svgX() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
}
