/* Language Stack — hours-to-target tracker. No build step; data lives in localStorage. */
(() => {
  'use strict';

  // The reference table. `target: null` = already native, nothing to count down.
  const LANGUAGES = [
    { id: 'english',    name: 'English',    level: 'Native',         target: null },
    { id: 'hindi',      name: 'Hindi',      level: 'Native',         target: 150 },
    { id: 'khasi',      name: 'Khasi',      level: 'Native',         target: 250 },
    { id: 'bengali',    name: 'Bengali',    level: 'Conversational', target: 200 },
    { id: 'german',     name: 'German',     level: 'Business',       target: 350 },
    { id: 'french',     name: 'French',     level: 'Business',       target: 400 },
    { id: 'spanish',    name: 'Spanish',    level: 'Conversational', target: 350 },
    { id: 'italian',    name: 'Italian',    level: 'Conversational', target: 300 },
    { id: 'portuguese', name: 'Portuguese', level: 'Conversational', target: 150 },
    { id: 'arabic',     name: 'Arabic',     level: 'Conversational', target: 1000 },
  ];
  const BY_ID = Object.fromEntries(LANGUAGES.map(l => [l.id, l]));
  const STACK_TOTAL = LANGUAGES.reduce((s, l) => s + (l.target || 0), 0);

  const STORE_KEY = 'language-stack.v1';
  const THEME_KEY = 'language-stack.theme';

  // Helpers used by load()/sanitize() must exist before load() runs.
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const round2 = n => Math.round(n * 100) / 100;

  // ---------- state ----------
  let state = load();          // manual entries + focus, in localStorage
  let toggl = { entries: [], syncedAt: null }; // read-only, from data/toggl.json (GitHub Action)
  let chartLang = 'all';
  const allEntries = () => state.entries.concat(toggl.entries);

  function load() {
    const fallback = { entries: [], focus: 'german' };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return sanitize(parsed) || fallback;
    } catch { return fallback; }
  }
  function sanitize(obj) {
    if (!obj || !Array.isArray(obj.entries)) return null;
    const entries = obj.entries
      .filter(e => e && BY_ID[e.lang] && isFinite(+e.hours) && +e.hours > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''))
      .map(e => ({ id: String(e.id || uid()), lang: e.lang, hours: round2(+e.hours), date: e.date, note: String(e.note || '').slice(0, 120), ...(e.source === 'toggl' ? { source: 'toggl' } : {}) }));
    const focus = BY_ID[obj.focus] ? obj.focus : 'german';
    return { entries, focus };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode etc. */ }
  }

  // ---------- date helpers (local time, ISO yyyy-mm-dd) ----------
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoLocal(new Date());
  const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); }; // Monday
  const fmtDate = s => parseIso(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtShort = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  // ---------- number formatting ----------
  const fmtH = n => {
    const v = round2(n);
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  };

  // Countdown figures: whole hours once large, one decimal near the finish line.
  const fmtRem = n => (n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toLocaleString());

  // ---------- derived ----------
  function loggedBy() {
    const m = Object.fromEntries(LANGUAGES.map(l => [l.id, 0]));
    for (const e of allEntries()) m[e.lang] += e.hours;
    return m;
  }
  function streak() {
    const days = new Set(allEntries().map(e => e.date));
    if (!days.size) return 0;
    let d = new Date(); d.setHours(0, 0, 0, 0);
    // a streak may still be alive if today has no entry yet but yesterday did
    if (!days.has(isoLocal(d))) d = addDays(d, -1);
    let n = 0;
    while (days.has(isoLocal(d))) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- DOM refs ----------
  const $ = sel => document.querySelector(sel);
  const el = {
    heroRemaining: $('#hero-remaining'), heroMeter: $('#hero-meter'), heroSub: $('#hero-sub'),
    statTotal: $('#stat-total'), statTotalNote: $('#stat-total-note'),
    statWeek: $('#stat-week'), statWeekNote: $('#stat-week-note'),
    statStreak: $('#stat-streak'), statStreakNote: $('#stat-streak-note'), statDone: $('#stat-done'),
    form: $('#log-form'), fLang: $('#f-lang'), fHours: $('#f-hours'), fDate: $('#f-date'), fNote: $('#f-note'),
    quickLang: $('#quick-lang'), toast: $('#toast'),
    stack: $('#stack'),
    chart: $('#chart'), chartTip: $('#chart-tip'), chartTable: $('#chart-table tbody'), chartFocusBtn: $('#chart-focus-btn'),
    history: $('#history tbody'), historyEmpty: $('#history-empty'),
    sync: $('#sync-status'),
  };

  // ---------- render ----------
  function render() {
    const logged = loggedBy();
    const entries = allEntries();
    const totalLogged = entries.reduce((s, e) => s + e.hours, 0);
    const creditable = LANGUAGES.reduce((s, l) => s + (l.target ? Math.min(logged[l.id], l.target) : 0), 0);
    const remaining = Math.max(0, STACK_TOTAL - creditable);
    const pct = STACK_TOTAL ? (creditable / STACK_TOTAL) * 100 : 0;

    // hero
    el.heroRemaining.innerHTML = `${fmtRem(remaining)}<small>h</small>`;
    setMeter(el.heroMeter, pct, remaining === 0);
    el.heroSub.textContent = `${fmtH(creditable)} of ${fmtH(STACK_TOTAL)} target hours done · ${pct.toFixed(1)}% of the stack`;

    // tiles
    el.statTotal.innerHTML = `${fmtH(totalLogged)}<small>h</small>`;
    const togglH = toggl.entries.reduce((s, e) => s + e.hours, 0);
    el.statTotalNote.textContent = togglH
      ? `${fmtH(togglH)} h from Toggl · ${fmtH(totalLogged - togglH)} h logged here`
      : `${entries.length} session${entries.length === 1 ? '' : 's'} across all languages`;

    const weekStart = isoLocal(addDays(new Date(), -6));
    const prevStart = isoLocal(addDays(new Date(), -13));
    const week = entries.filter(e => e.date >= weekStart).reduce((s, e) => s + e.hours, 0);
    const prev = entries.filter(e => e.date >= prevStart && e.date < weekStart).reduce((s, e) => s + e.hours, 0);
    el.statWeek.innerHTML = `${fmtH(week)}<small>h</small>`;
    const delta = round2(week - prev);
    el.statWeekNote.textContent = prev || week
      ? `${delta >= 0 ? '+' : '−'}${fmtH(Math.abs(delta))} h vs the 7 days before`
      : 'no sessions in the last two weeks';

    const st = streak();
    el.statStreak.innerHTML = `${st}<small>${st === 1 ? 'day' : 'days'}</small>`;
    el.statStreakNote.textContent = st ? 'consecutive days with a session' : 'log a session today to start one';

    const done = LANGUAGES.filter(l => l.target && logged[l.id] >= l.target).length;
    el.statDone.innerHTML = `${done}<small>/ 9</small>`;

    renderStack(logged);
    renderChart();
    renderHistory();
    el.quickLang.textContent = BY_ID[state.focus].name;
    el.chartFocusBtn.textContent = BY_ID[state.focus].name;
    renderSync();
  }

  function renderSync() {
    if (!toggl.syncedAt) { el.sync.hidden = true; return; }
    const langs = (toggl.projects || []).map(id => BY_ID[id]?.name).filter(Boolean).join(', ');
    el.sync.hidden = false;
    el.sync.innerHTML = `<span class="sync-dot" aria-hidden="true"></span>Toggl synced ${relTime(toggl.syncedAt)}${langs ? ` · projects: ${escapeHtml(langs)}` : ''}`;
  }
  function relTime(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 36) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  }

  function setMeter(meter, pct, done) {
    const p = Math.max(0, Math.min(100, pct));
    meter.querySelector('.meter-fill').style.width = `${p}%`;
    meter.setAttribute('aria-valuenow', p.toFixed(0));
    meter.classList.toggle('is-done', !!done);
  }

  function renderStack(logged) {
    el.stack.innerHTML = '';
    LANGUAGES.forEach((l, i) => {
      const li = document.createElement('li');
      const isNative = l.target === null;
      const have = logged[l.id];
      const rem = isNative ? 0 : Math.max(0, l.target - have);
      const isDone = !isNative && rem === 0;
      const pct = isNative ? 100 : Math.min(100, (have / l.target) * 100);
      li.className = `lang${isNative ? ' is-native' : ''}${isDone ? ' is-done' : ''}${l.id === state.focus ? ' is-focus' : ''}`;
      li.innerHTML = `
        <span class="lang-idx">${i + 1}</span>
        <span class="lang-name"><span class="lang-title">${l.name}${l.id === state.focus || isNative ? '' : `<button type="button" class="lang-focus-btn" data-focus="${l.id}">set focus</button>`}</span><span class="lang-level">${l.level}${l.id === state.focus ? ' · focus' : ''}</span></span>
        <span class="lang-meter">${isNative
          ? 'Already there — nothing to count down.'
          : `<span class="meter" role="progressbar" aria-label="${l.name} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}"><span class="meter-fill" style="width:${pct}%"></span></span>
             <span class="lang-nums"><span>${fmtH(have)} h logged</span><span>${fmtH(l.target)} h target</span></span>`}</span>
        <span class="lang-remaining">${isNative
          ? '<strong>—</strong><span>native</span>'
          : isDone ? '<strong>✓ done</strong><span>target reached</span>'
          : `<strong>${fmtRem(rem)}</strong><span>hours to go</span>`}</span>`;
      if (isDone) li.querySelector('.meter').classList.add('is-done');
      el.stack.appendChild(li);
    });
  }

  // ---------- chart: hours per week, last 12 weeks ----------
  function weeklySeries() {
    const WEEKS = 12;
    const thisWeek = startOfWeek(new Date());
    const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: addDays(thisWeek, -7 * (WEEKS - 1 - i)), hours: 0 }));
    const firstIso = isoLocal(weeks[0].start);
    for (const e of allEntries()) {
      if (chartLang !== 'all' && e.lang !== state.focus) continue;
      if (e.date < firstIso) continue;
      const idx = Math.floor((parseIso(e.date) - weeks[0].start) / 864e5 / 7);
      if (weeks[idx]) weeks[idx].hours += e.hours;
    }
    return weeks;
  }

  function renderChart() {
    const data = weeklySeries();
    const svg = el.chart;
    const W = 800, H = 220, padL = 36, padR = 8, padT = 16, padB = 26;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; };

    const max = Math.max(...data.map(d => d.hours), 0);
    const yMax = niceMax(max);
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const y = v => padT + plotH - (yMax ? (v / yMax) * plotH : 0);
    const band = plotW / data.length;
    const barW = Math.min(24, band * 0.6);

    // gridlines + ticks (recessive, 4 steps)
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = (yMax / steps) * i;
      const yy = y(v);
      svg.appendChild(mk('line', { class: i === 0 ? 'baseline' : 'grid', x1: padL, x2: W - padR, y1: yy, y2: yy }));
      svg.appendChild(mk('text', { class: 'tick', x: padL - 8, y: yy + 4, 'text-anchor': 'end' }, fmtH(v)));
    }

    const rows = [];
    data.forEach((d, i) => {
      const cx = padL + band * i + band / 2;
      const g = mk('g', { class: 'col' });
      const top = y(d.hours), h = padT + plotH - top;
      if (d.hours > 0) {
        // 4px rounded data-end, square at the baseline: draw a path
        const r = Math.min(4, h, barW / 2), x0 = cx - barW / 2, x1 = cx + barW / 2, yb = padT + plotH;
        const dPath = `M${x0},${yb} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${yb} Z`;
        g.appendChild(mk('path', { class: 'bar', d: dPath }));
      }
      // label the extreme and the current week only
      const isCur = i === data.length - 1, isMax = d.hours > 0 && d.hours === max;
      if ((isCur && d.hours > 0) || isMax) g.appendChild(mk('text', { class: 'bar-label', x: cx, y: top - 6 }, fmtH(d.hours)));
      // x tick: every 2nd week
      if (i % 2 === 0 || isCur) svg.appendChild(mk('text', { class: 'tick', x: cx, y: H - 8, 'text-anchor': 'middle' }, isCur ? 'this wk' : fmtShort(d.start)));
      // hit target spans the full band
      const hit = mk('rect', { class: 'hit', x: padL + band * i, y: padT, width: band, height: plotH });
      hit.addEventListener('mouseenter', () => showTip(d, cx / W, top / H));
      hit.addEventListener('mousemove', () => showTip(d, cx / W, top / H));
      hit.addEventListener('mouseleave', hideTip);
      g.appendChild(hit);
      svg.appendChild(g);
      rows.push(d);
    });
    if (max === 0) svg.appendChild(mk('text', { class: 'nodata', x: padL + plotW / 2, y: padT + plotH / 2 }, 'No sessions in the last 12 weeks yet'));

    el.chartTable.innerHTML = rows.map(d => `<tr><td>${fmtShort(d.start)} – ${fmtShort(addDays(d.start, 6))}</td><td class="num">${fmtH(d.hours)}</td></tr>`).join('');
  }
  function niceMax(v) {
    if (v <= 0) return 4;
    const raw = v * 1.15;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
    return step * pow;
  }
  function showTip(d, fx, fy) {
    const wrap = el.chart.getBoundingClientRect();
    el.chartTip.innerHTML = `<strong>${fmtH(d.hours)} h</strong> · ${fmtShort(d.start)} – ${fmtShort(addDays(d.start, 6))}${chartLang === 'all' ? '' : ` · ${BY_ID[state.focus].name}`}`;
    el.chartTip.style.left = `${fx * wrap.width}px`;
    el.chartTip.style.top = `${Math.max(fy * wrap.height, 28)}px`;
    el.chartTip.hidden = false;
  }
  function hideTip() { el.chartTip.hidden = true; }

  // ---------- history ----------
  function renderHistory() {
    const entries = allEntries();
    const sorted = [...entries].sort((a, b) => (b.date.localeCompare(a.date)) || (b.id > a.id ? 1 : -1)).slice(0, 60);
    el.history.innerHTML = sorted.map(e => `
      <tr data-id="${e.id}">
        <td class="date">${fmtDate(e.date)}</td>
        <td>${BY_ID[e.lang].name}${e.source === 'toggl' ? ' <span class="badge">Toggl</span>' : ''}</td>
        <td class="num">${fmtH(e.hours)}</td>
        <td class="note" title="${escapeHtml(e.note)}">${escapeHtml(e.note)}</td>
        <td class="act">${e.source === 'toggl' ? '' : `<button type="button" class="icon-btn" data-del="${e.id}" aria-label="Delete session">✕</button>`}</td>
      </tr>`).join('');
    el.historyEmpty.hidden = entries.length > 0;
    el.history.parentElement.hidden = entries.length === 0;
  }
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- actions ----------
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.textContent = ''; }, 3200);
  }

  function addEntry(lang, hours, date, note) {
    const entry = sanitize({ entries: [{ id: uid(), lang, hours, date, note }] })?.entries[0];
    if (!entry) return false;
    state.entries.push(entry);
    save(); render();
    const l = BY_ID[lang];
    const rem = l.target ? Math.max(0, l.target - loggedBy()[lang]) : null;
    toast(rem === null ? `Logged ${fmtH(hours)} h of ${l.name}.` : rem === 0 ? `Logged ${fmtH(hours)} h — ${l.name} target reached!` : `Logged ${fmtH(hours)} h of ${l.name}. ${fmtH(rem)} h to go.`);
    return true;
  }

  el.form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!el.form.reportValidity()) return;
    if (addEntry(el.fLang.value, +el.fHours.value, el.fDate.value, el.fNote.value.trim())) {
      el.fHours.value = ''; el.fNote.value = ''; el.fHours.focus();
    }
  });
  document.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => addEntry(state.focus, +b.dataset.quick, todayIso(), '')));

  document.addEventListener('click', ev => {
    const del = ev.target.closest('[data-del]');
    if (del) {
      state.entries = state.entries.filter(e => e.id !== del.dataset.del);
      save(); render(); toast('Session removed.');
      return;
    }
    const focus = ev.target.closest('[data-focus]');
    if (focus) {
      state.focus = focus.dataset.focus; el.fLang.value = state.focus;
      save(); render();
      return;
    }
    const seg = ev.target.closest('[data-chart-lang]');
    if (seg) {
      chartLang = seg.dataset.chartLang;
      document.querySelectorAll('[data-chart-lang]').forEach(b => b.classList.toggle('is-active', b === seg));
      renderChart();
    }
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!state.entries.length) return;
    if (confirm(`Delete all ${state.entries.length} logged sessions? Export first if you want a backup.`)) {
      state.entries = []; save(); render(); toast('All sessions cleared.');
    }
  });

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `language-stack-${todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#file-import').addEventListener('change', async ev => {
    const file = ev.target.files?.[0]; if (!file) return;
    try {
      const incoming = sanitize(JSON.parse(await file.text()));
      if (!incoming) throw new Error('bad file');
      const known = new Set(state.entries.map(e => e.id));
      // Toggl rows come from the sync, never from a backup file.
      const added = incoming.entries.filter(e => !known.has(e.id) && e.source !== 'toggl');
      state.entries.push(...added);
      save(); render();
      toast(`Imported ${added.length} new session${added.length === 1 ? '' : 's'}.`);
    } catch { toast('Could not read that file — expected a Language Stack export.'); }
    ev.target.value = '';
  });

  // ---------- theme ----------
  const root = document.documentElement;
  try { const t = localStorage.getItem(THEME_KEY); if (t) root.dataset.theme = t; } catch {}
  $('#btn-theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch {}
  });

  // ---------- init ----------
  el.fLang.innerHTML = LANGUAGES.map(l => `<option value="${l.id}">${l.name} — ${l.level}${l.target ? ` (${l.target} h)` : ''}</option>`).join('');
  el.fLang.value = state.focus;
  el.fDate.value = todayIso();
  el.fDate.max = todayIso();
  render();

  // Toggl data is written to data/toggl.json by the scheduled GitHub Action.
  fetch(`data/toggl.json?t=${Date.now()}`, { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(json => {
      const clean = json && sanitize(json);
      if (!clean) return;
      toggl = { entries: clean.entries.filter(e => e.source === 'toggl'), syncedAt: json.syncedAt || null, projects: json.projects || [] };
      render();
    })
    .catch(() => { /* offline or no sync yet — manual entries still work */ });
})();
