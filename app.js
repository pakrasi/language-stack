/* Language Stack: hours-to-target tracker. No build step; manual data lives in localStorage. */
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
  const FIELD_LANGS = LANGUAGES.filter(l => l.target);
  const STACK_TOTAL = FIELD_LANGS.reduce((s, l) => s + l.target, 0);

  const STORE_KEY = 'language-stack.v1';                 // {entries:[...], focus}
  const THEME_KEY = 'language-stack.theme';
  const TARGET_KEY = 'language-stack.target-date';       // yyyy-mm-dd
  const START_KEY = 'language-stack.start-hours';        // {lang: hours studied before tracking}
  const DEFAULT_TARGET = '2030-12-31';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;

  // ---------- helpers (must exist before load() runs) ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const round2 = n => Math.round(n * 100) / 100;
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoLocal(new Date());
  const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); const dow = (x.getDay() + 6) % 7; return addDays(x, -dow); }; // Monday
  const fmtDate = s => parseIso(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtShort = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const fmtMonthYear = d => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const fmtMonShort = d => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const NB = ' ';

  // Pace window. 7 days while tracking is new (started 2026-09-22); switch to 28 once it has settled.
  const PACE_DAYS = 7;
  const PACE_LABEL = PACE_DAYS === 7 ? 'last 7 days' : `last ${PACE_DAYS / 7} weeks`;

  // One number rule: under 100 one decimal (no trailing .0), 100 and up whole numbers.
  const fmtNum = n => {
    if (Math.abs(n) >= 99.95) return Math.round(n).toLocaleString();
    const v = Math.round(n * 10) / 10;
    if (n > 0 && v === 0) return '<0.1';
    return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };
  // Single session entries may keep two decimals.
  const fmtExact = n => round2(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const hrs = n => `${fmtNum(n)}${NB}h`;

  // ---------- state ----------
  let loadProblem = false;
  function load() {
    const fallback = { entries: [], focus: 'german' };
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch { return fallback; }
    if (!raw) return fallback;
    try {
      const clean = sanitize(JSON.parse(raw));
      if (!clean) throw new Error('unexpected format');
      return clean;
    } catch (err) {
      // Never let a read failure turn into a silent overwrite: keep the raw copy first.
      try { localStorage.setItem(`${STORE_KEY}.corrupt-${Date.now()}`, raw); } catch { /* storage full */ }
      loadProblem = true;
      console.warn('Language Stack: saved sessions could not be read; a copy was kept.', err);
      return fallback;
    }
  }
  function sanitize(obj) {
    if (!obj || !Array.isArray(obj.entries)) return null;
    const entries = obj.entries
      .filter(e => e && BY_ID[e.lang] && isFinite(+e.hours) && +e.hours > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''))
      .map(e => ({ id: String(e.id || uid()), lang: e.lang, hours: round2(+e.hours), date: e.date, note: String(e.note || '').slice(0, 120), ...(e.source === 'toggl' ? { source: 'toggl' } : {}) }));
    const focus = BY_ID[obj.focus] && BY_ID[obj.focus].target ? obj.focus : 'german';
    return { entries, focus };
  }
  function cleanStart(obj) {
    const out = {};
    if (obj && typeof obj === 'object') for (const l of FIELD_LANGS) {
      const v = +obj[l.id];
      if (isFinite(v) && v > 0) out[l.id] = round2(Math.min(v, 5000));
    }
    return out;
  }
  function loadStart() {
    try { return cleanStart(JSON.parse(localStorage.getItem(START_KEY) || '{}')); } catch { return {}; }
  }

  let state = load();
  let startHours = loadStart();
  let toggl = { entries: [], syncedAt: null, projects: [] }; // read-only, from data/toggl.json (GitHub Action)
  let togglFailed = false;
  let chartLang = 'all';
  let fieldSel = null;
  let showAllHistory = false;
  const allEntries = () => state.entries.concat(toggl.entries); // dated sessions only; start hours excluded

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
    catch { toast('Couldn’t save in this browser. Use Export to keep this session.'); return false; }
  }
  function saveStart() {
    try { localStorage.setItem(START_KEY, JSON.stringify(startHours)); return true; }
    catch { toast('Couldn’t save in this browser.'); return false; }
  }

  // Ask the browser not to evict storage (Safari clears it after 7 days without a visit).
  let persistRefused = false;
  let persistAsked = false;
  function askPersist() {
    if (persistAsked || !navigator.storage?.persist) return Promise.resolve();
    persistAsked = true;
    return (navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false))
      .then(already => (already ? true : navigator.storage.persist()))
      .then(ok => { persistRefused = !ok; })
      .catch(() => {});
  }

  // ---------- derived ----------
  function loggedBy() {
    const m = Object.fromEntries(LANGUAGES.map(l => [l.id, startHours[l.id] || 0]));
    for (const e of allEntries()) m[e.lang] += e.hours;
    for (const k in m) m[k] = round2(m[k]);
    return m;
  }
  function streak() {
    const days = new Set(allEntries().map(e => e.date));
    if (!days.size) return { n: 0, today: false };
    let d = new Date(); d.setHours(0, 0, 0, 0);
    const today = days.has(isoLocal(d));
    // a streak may still be alive if today has no entry yet but yesterday did
    if (!today) d = addDays(d, -1);
    let n = 0;
    while (days.has(isoLocal(d))) { n++; d = addDays(d, -1); }
    return { n, today };
  }
  function reachedOn(l) {
    const start = startHours[l.id] || 0;
    if (start >= l.target) return 'before';
    let sum = start;
    const list = allEntries().filter(e => e.lang === l.id).sort((a, b) => a.date.localeCompare(b.date));
    for (const e of list) { sum = round2(sum + e.hours); if (sum >= l.target) return e.date; }
    return null;
  }
  const reachedText = r => (r === 'before' ? 'Reached before tracking' : r ? `Reached ${fmtDate(r)}` : '');
  function nextFocusCandidates(n, logged = loggedBy()) {
    return FIELD_LANGS.filter(l => logged[l.id] < l.target && l.id !== state.focus)
      .sort((a, b) => (a.target - logged[a.id]) - (b.target - logged[b.id]))
      .slice(0, n);
  }

  // ---------- DOM refs ----------
  const $ = sel => document.querySelector(sel);
  const el = {
    heroRemaining: $('#hero-remaining'), heroSub: $('#hero-sub'), sync: $('#sync-status'),
    pacePair: $('#pace-pair'), paceNeeded: $('#pace-needed'), paceNeededBar: $('#pace-needed-bar'), paceNeededNote: $('#pace-needed-note'),
    paceYours: $('#pace-yours'), paceYoursBar: $('#pace-yours-bar'), paceGap: $('#pace-gap'),
    todayTrack: $('#today-track'), todayElapsed: $('#today-elapsed'), todayLogged: $('#today-logged'), todayText: $('#today-text'),
    timeline: $('#timeline'), daysLeft: $('#days-left'), projection: $('#projection'), fTarget: $('#f-target'),
    quick: $('#quick'), quickLang: $('#quick-lang'), nextFocus: $('#next-focus'), nextLabel: $('#next-label'), nextChips: $('#next-chips'),
    btnOther: $('#btn-other'), form: $('#log-form'), fLang: $('#f-lang'), fHours: $('#f-hours'), fDate: $('#f-date'), fNote: $('#f-note'),
    field: $('#field'), fieldHint: $('#field-hint'), fieldTable: $('#field-table tbody'),
    readout: $('#readout'), roName: $('#ro-name'), roLevel: $('#ro-level'), roLogged: $('#ro-logged'), roTarget: $('#ro-target'), roLeft: $('#ro-left'),
    roReached: $('#ro-reached'), roFocus: $('#ro-focus'), roIsFocus: $('#ro-is-focus'), roStart: $('#ro-start'), fStart: $('#f-start'),
    statWeek: $('#stat-week'), statWeekNote: $('#stat-week-note'), statStreak: $('#stat-streak'), statStreakNote: $('#stat-streak-note'),
    chart: $('#chart'), chartTip: $('#chart-tip'), chartTable: $('#chart-table tbody'), chartFocusBtn: $('#chart-focus-btn'),
    history: $('#history'), historyBody: $('#history tbody'), historyEmpty: $('#history-empty'), showAll: $('#btn-show-all'),
    dataSplit: $('#data-split'), reset: $('#btn-reset'), resetNote: $('#reset-note'),
    toast: $('#toast'), themeBtn: $('#btn-theme'),
  };

  // ---------- render ----------
  function render() {
    const logged = loggedBy();
    const entries = allEntries();
    const creditable = FIELD_LANGS.reduce((s, l) => s + Math.min(logged[l.id], l.target), 0);
    const remaining = Math.max(0, round2(STACK_TOTAL - creditable));
    const pct = (creditable / STACK_TOTAL) * 100;

    el.heroRemaining.innerHTML = `${fmtNum(remaining)}<small>h</small>`;
    const pctText = creditable <= 0 ? '0%' : pct < 0.1 ? '<0.1%' : `${fmtNum(pct)}%`;
    el.heroSub.textContent = `${fmtNum(creditable)} of ${STACK_TOTAL.toLocaleString()} h done (${pctText})`;
    const pace = renderPace(remaining, entries);

    renderWeek(entries);
    renderQuick(logged);
    renderField(logged);
    renderChart();
    renderHistory();
    renderData();
    renderToday();
    renderSync();
    setAtmosphere(pace.ratio, pct);
    el.chartFocusBtn.textContent = BY_ID[state.focus].name;
  }

  function renderSync() {
    if (togglFailed) {
      el.sync.hidden = false;
      el.sync.textContent = 'Couldn’t load Toggl hours. Showing sessions logged here only.';
      return;
    }
    if (!toggl.syncedAt) { el.sync.hidden = true; return; }
    const ageH = (Date.now() - new Date(toggl.syncedAt)) / 36e5;
    const langs = (toggl.projects || []).map(id => BY_ID[id]?.name).filter(Boolean).join(', ');
    el.sync.hidden = false;
    el.sync.textContent = ageH > 3
      ? `Toggl last synced ${relTime(toggl.syncedAt)}.${ageH > 24 ? ' Check the GitHub Action.' : ''}`
      : `Toggl synced ${relTime(toggl.syncedAt)}${langs ? ` (${langs})` : ''}`;
  }
  function relTime(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}${NB}min ago`;
    const h = Math.round(mins / 60);
    if (h < 36) return `${h}${NB}h ago`;
    return `${Math.round(h / 24)} days ago`;
  }

  // ---------- pace, target date, timeline ----------
  function targetDate() {
    try { const v = localStorage.getItem(TARGET_KEY); if (/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return v; } catch {}
    return DEFAULT_TARGET;
  }
  function spanText(a, b) {
    // calendar distance between two dates, in plain words
    let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months--;
    if (months < 1) {
      const w = Math.max(1, Math.round((b - a) / 864e5 / 7));
      return `${w} ${w === 1 ? 'week' : 'weeks'}`;
    }
    const y = Math.floor(months / 12), m = months % 12;
    const ys = y ? `${y} ${y === 1 ? 'year' : 'years'}` : '';
    const ms = m ? `${m} ${m === 1 ? 'month' : 'months'}` : '';
    return ys && ms ? `${ys} and ${ms}` : ys || ms;
  }

  function renderPace(remaining, entries) {
    const tIso = todayIso();
    const today = parseIso(tIso);
    const target = parseIso(targetDate());
    const daysLeft = Math.round((target - today) / 864e5);
    const since = isoLocal(addDays(today, -(PACE_DAYS - 1)));
    const windowHours = entries.filter(e => e.date >= since && e.date <= tIso).reduce((s, e) => s + e.hours, 0);
    const pace = windowHours / (PACE_DAYS / 7);
    const passed = daysLeft <= 0;
    const done = remaining === 0;
    const needed = !passed && !done ? remaining / (daysLeft / 7) : null;

    el.daysLeft.textContent = passed ? '0' : daysLeft.toLocaleString();
    el.pacePair.hidden = needed === null;
    el.paceYours.innerHTML = `${fmtNum(pace)}<small>h</small>`;
    if (needed !== null) {
      el.paceNeeded.innerHTML = `${fmtNum(needed)}<small>h</small>`;
      el.paceNeededNote.textContent = `to finish by ${fmtDate(targetDate())}.${needed > 40 ? ' That’s more than 40 h a week.' : ''}`;
      // Both bars share one scale so the gap reads at a glance.
      const scale = Math.max(needed, pace, 0.01);
      el.paceNeededBar.style.transform = `scaleX(${needed / scale})`;
      el.paceYoursBar.style.transform = `scaleX(${pace / scale})`;
    }

    if (done) el.paceGap.textContent = 'All targets reached.';
    else if (passed) el.paceGap.textContent = 'The target date has passed. Pick a new date.';
    else {
      const diff = round2(needed - pace);
      const ratio = pace / needed;
      const pctTxt = pace <= 0 ? '0%' : ratio < 0.01 ? '<1%' : `${Math.round(ratio * 100)}%`;
      el.paceGap.textContent = Math.abs(diff) < 0.05
        ? 'You’re on the pace needed.'
        : diff > 0
          ? `${fmtNum(diff)}${NB}h a week short. You’re at ${pctTxt} of the pace needed.`
          : `${fmtNum(-diff)}${NB}h a week ahead of the pace needed.`;
    }
    el.paceGap.classList.toggle('is-alert', passed && !done);

    let finish = null;
    if (done) el.projection.textContent = '';
    else if (pace <= 0) el.projection.textContent = `No hours in the ${PACE_LABEL}, so no finish date yet.`;
    else {
      finish = addDays(today, Math.ceil((remaining / pace) * 7));
      let rel = '';
      if (!passed) {
        const days = Math.round((finish - target) / 864e5);
        if (days > 0) rel = `, ${spanText(target, finish)} after the target date`;
        else if (days < 0) rel = `, ${spanText(finish, target)} before the target date`;
      }
      el.projection.textContent = `At your current pace you finish in ${fmtMonthYear(finish)}${rel}.`;
    }
    renderTimeline({ today, target, finish, passed, done });
    const ratio = done ? 1 : needed ? Math.min(1, pace / needed) : 0;
    return { ratio };
  }

  let tlState = null;
  function renderTimeline(t) {
    tlState = t;
    const DAY = 864e5;
    const start = t.today.getTime();
    let end = Math.max(t.target.getTime(), t.finish ? t.finish.getTime() : 0, start + 365 * DAY);
    const cap = new Date(t.today); cap.setFullYear(cap.getFullYear() + 50);
    const clipped = end > cap.getTime();
    if (clipped) end = cap.getTime();
    const span = (end - start) * 1.03;
    const pos = d => Math.max(0, Math.min(1, (d - start) / span));
    const pct = v => `${(v * 100).toFixed(3)}%`;
    const width = el.timeline.clientWidth || 800;

    const xT = t.passed ? 0 : pos(t.target.getTime());
    const xF = t.finish ? pos(Math.min(t.finish.getTime(), end)) : null;

    // year ticks: pick a step that leaves room for the labels
    const y0 = t.today.getFullYear() + 1, y1 = new Date(end).getFullYear();
    const pxPerYear = width / (span / (365.25 * DAY));
    const step = [1, 2, 5, 10, 20].find(s => s * pxPerYear >= 54) || 20;
    let years = '';
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const x = pos(new Date(y, 0, 1).getTime());
      if (x > 0.97 || x * width < 40) continue;
      years += `<span class="tl-year" style="left:${pct(x)}">${y}</span><span class="tl-tick" style="left:${pct(x)}"></span>`;
    }

    let segs = '';
    if (!t.passed) segs += `<span class="tl-seg tl-have" style="left:0;width:${pct(xT)}"></span>`;
    if (xF !== null) {
      if (xF > xT) segs += `<span class="tl-seg tl-over" style="left:${pct(xT)};width:${pct(xF - xT)}"></span>`;
      else segs += `<span class="tl-seg tl-early" style="left:0;width:${pct(xF)}"></span>`;
    }
    const marks = [`<span class="tl-mark tl-today" style="left:0"></span>`];
    if (!t.passed) marks.push(`<span class="tl-mark tl-target" style="left:${pct(xT)}"></span>`);
    if (xF !== null) marks.push(`<span class="tl-mark tl-finish${clipped && t.finish.getTime() > end ? ' is-clipped' : ''}" style="left:${pct(xF)}"></span>`);

    const labels = [{ x: 0, cls: 'is-today', k: 'Today', v: fmtDate(isoLocal(t.today)) }];
    if (!t.passed) labels.push({ x: xT, cls: 'is-target', k: 'Target date', v: fmtDate(isoLocal(t.target)) });
    if (xF !== null) labels.push({ x: xF, cls: 'is-finish', k: 'At your pace', v: fmtMonShort(t.finish) });
    labels.sort((a, b) => a.x - b.x);

    el.timeline.innerHTML = `<div class="tl-years">${years}</div><div class="tl-axis"><span class="tl-track"></span>${segs}${marks.join('')}</div><div class="tl-labels">${
      labels.map(l => `<span class="tl-label ${l.cls}" data-x="${l.x}"><span class="k">${l.k}</span><span class="v">${l.v}</span></span>`).join('')}</div>`;
    const sr = [`Timeline from today, ${fmtDate(isoLocal(t.today))}`];
    if (t.passed) sr.push('the target date has passed');
    else sr.push(`target date ${fmtDate(isoLocal(t.target))}`);
    if (t.finish) sr.push(`finish at your pace ${fmtMonthYear(t.finish)}`);
    el.timeline.setAttribute('aria-label', `${sr.join(', ')}.`);
    layoutTimelineLabels();
  }
  function layoutTimelineLabels() {
    const box = el.timeline.querySelector('.tl-labels');
    if (!box) return;
    const W = box.clientWidth;
    const rowEnd = [-Infinity, -Infinity];
    let rows = 1;
    box.querySelectorAll('.tl-label').forEach(lab => {
      lab.classList.remove('row-2', 'is-start', 'is-end');
      const x = +lab.dataset.x * W;
      const w = lab.offsetWidth;
      let left = x - w / 2;
      if (left < 0) { left = x; lab.classList.add('is-start'); }
      else if (x + w / 2 > W) { left = x - w; lab.classList.add('is-end'); }
      left = Math.max(0, Math.min(W - w, left));
      if (left < rowEnd[0] + 16) { lab.classList.add('row-2'); rows = 2; rowEnd[1] = left + w; }
      else rowEnd[0] = left + w;
      lab.style.left = `${left}px`;
    });
    box.classList.toggle('has-2', rows === 2);
  }

  // ---------- today ----------
  function renderToday() {
    const now = new Date();
    const mid = new Date(now); mid.setHours(0, 0, 0, 0);
    const frac = Math.min(1, (now - mid) / 864e5);
    const hoursToday = allEntries().filter(e => e.date === todayIso()).reduce((s, e) => s + e.hours, 0);
    const mins = Math.round(hoursToday * 60);
    el.todayElapsed.style.transform = `scaleX(${frac})`;
    el.todayLogged.style.transform = `scaleX(${Math.min(1, hoursToday / 24)})`;
    el.todayTrack.setAttribute('aria-label', `${Math.floor(frac * 100)}% of today has passed`);
    el.todayText.textContent = mins >= 60 ? `${fmtNum(hoursToday)}${NB}h logged` : `${mins}${NB}min logged`;
  }

  // ---------- this week ----------
  function renderWeek(entries) {
    const weekStart = isoLocal(addDays(new Date(), -6));
    const prevStart = isoLocal(addDays(new Date(), -13));
    const week = entries.filter(e => e.date >= weekStart).reduce((s, e) => s + e.hours, 0);
    const prev = entries.filter(e => e.date >= prevStart && e.date < weekStart).reduce((s, e) => s + e.hours, 0);
    el.statWeek.innerHTML = `${fmtNum(week)}<small>h</small>`;
    const delta = round2(week - prev);
    el.statWeekNote.textContent = !prev && !week ? 'No hours in the last 14 days'
      : Math.abs(delta) < 0.05 ? 'Same as the week before'
      : delta > 0 ? `${hrs(delta)} more than the week before` : `${hrs(-delta)} less than the week before`;
    const st = streak();
    el.statStreak.innerHTML = `${st.n}<small>${st.n === 1 ? 'day' : 'days'}</small>`;
    el.statStreakNote.textContent = !st.n ? 'Log today to start one.' : st.today ? 'Including today' : 'Log today to keep it going.';
  }

  // ---------- quick log row ----------
  function renderQuick(logged) {
    const f = BY_ID[state.focus];
    const focusDone = logged[f.id] >= f.target;
    el.quickLang.textContent = f.name;
    el.quick.hidden = focusDone;
    const cands = focusDone ? nextFocusCandidates(3, logged) : [];
    el.nextFocus.hidden = !focusDone;
    if (focusDone) {
      el.nextLabel.textContent = cands.length ? `${f.name} target reached. Pick the next focus:` : 'All targets reached.';
      el.nextChips.innerHTML = cands.map(l => `<button type="button" class="chip" data-focus="${l.id}" aria-label="Make ${l.name} the focus language">${l.name}</button>`).join('')
        + `<button type="button" class="chip chip-other" data-open-form>Other…</button>`;
    }
  }

  // ---------- atmosphere palette (CSS fallback + fx.js canvas) ----------
  // Cool and dim when behind the needed pace, warmer as the pace catches up.
  const ATMO = {
    dark:  { behind: ['#0a0a0c', '#0f1a30', '#09090a', '#17264a'], onPace: ['#0d0a08', '#2a1708', '#0b0908', '#40250f'], finish: '#1c1a17' },
    light: { behind: ['#f3efe7', '#e9e6e0', '#f2eee6', '#e3e2df'], onPace: ['#f4eee4', '#f2d6b4', '#f2ebe0', '#ecc393'], finish: '#ebe4d8' },
  };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  function setAtmosphere(ratio, pct) {
    const theme = root.dataset.theme === 'light' ? 'light' : 'dark';
    const p = ATMO[theme];
    const t = Math.max(0, Math.min(1, ratio)) ** 1.6;
    const colors = p.behind.map((c, i) => mixHex(c, p.onPace[i], t));
    colors[2] = mixHex(colors[2], p.finish, Math.min(1, pct / 100) * 0.6);
    colors.forEach((c, i) => root.style.setProperty(`--atmo-${i + 1}`, c));
    const detail = { colors, ratio: t, pct, theme };
    window.__stackAtmosphere = detail;
    document.dispatchEvent(new CustomEvent('stack-stats', { detail }));
  }

  // ---------- the hour field: one cell per target hour, one run per language ----------
  const runs = {};
  let fieldFill = {};      // lang -> creditable hours currently drawn
  let flash = null;        // { lang, from, to, start }

  function buildField() {
    el.field.innerHTML = '';
    for (const l of FIELD_LANGS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'run';
      b.dataset.lang = l.id;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-controls', 'readout');
      b.innerHTML = `<span class="run-label"><span class="run-name">${l.name}<span class="block-badge" aria-hidden="true"></span></span><span class="run-nums"></span><span class="run-reached"></span></span><span class="run-cells"><canvas aria-hidden="true"></canvas></span>`;
      b.addEventListener('click', () => selectRun(fieldSel === l.id ? null : l.id));
      el.field.appendChild(b);
      runs[l.id] = { el: b, canvas: b.querySelector('canvas'), cells: b.querySelector('.run-cells'), nums: b.querySelector('.run-nums'), reached: b.querySelector('.run-reached') };
    }
    if ('ResizeObserver' in window) {
      let w = 0;
      new ResizeObserver(([e]) => {
        const nw = Math.round(e.contentRect.width);
        if (nw !== w) { w = nw; drawField(); layoutTimelineLabels(); }
      }).observe(el.field);
    }
  }

  function selectRun(id) {
    fieldSel = id;
    for (const k in runs) {
      const on = k === id;
      runs[k].el.classList.toggle('is-sel', on);
      runs[k].el.setAttribute('aria-pressed', String(on));
    }
    el.field.classList.toggle('has-sel', !!id);
    if (id) runs[id].el.after(el.readout); // the readout opens right under the selected run
    renderReadout();
  }

  function renderField(logged) {
    for (const l of FIELD_LANGS) {
      const have = Math.min(logged[l.id], l.target);
      fieldFill[l.id] = have;
      const r = runs[l.id];
      const isDone = have >= l.target;
      r.nums.textContent = `${fmtNum(have)} of ${l.target.toLocaleString()}${NB}h`;
      const reached = isDone ? reachedText(reachedOn(l)) : '';
      r.reached.textContent = reached;
      r.reached.hidden = !isDone;
      r.el.classList.toggle('is-focus', l.id === state.focus);
      r.el.classList.toggle('is-done', isDone);
      r.el.setAttribute('aria-label', `${l.name}${l.id === state.focus ? ', focus language' : ''}: ${fmtNum(have)} of ${l.target} hours, ${isDone ? reached : `${fmtNum(l.target - have)} left`}`);
    }
    el.fieldTable.innerHTML = FIELD_LANGS.map(l => `<tr><th scope="row">${l.name}</th><td>${l.level}</td><td class="num">${hrs(fieldFill[l.id])}</td><td class="num">${hrs(l.target)}</td><td class="num">${fieldFill[l.id] >= l.target ? 'Reached' : hrs(l.target - fieldFill[l.id])}</td></tr>`).join('');
    renderReadout();
    drawField();
  }

  function renderReadout() {
    const id = fieldSel;
    el.readout.hidden = !id;
    if (!id) return;
    const l = BY_ID[id], have = fieldFill[id] || 0;
    el.roName.textContent = l.name;
    el.roLevel.textContent = `Target level: ${l.level}`;
    el.roLogged.textContent = hrs(have);
    el.roTarget.textContent = hrs(l.target);
    el.roLeft.textContent = have >= l.target ? '0' + NB + 'h' : hrs(l.target - have);
    const isDone = have >= l.target;
    el.roReached.hidden = !isDone;
    el.roReached.textContent = isDone ? reachedText(reachedOn(l)) : '';
    const isFocus = id === state.focus;
    el.roFocus.hidden = isFocus;
    el.roFocus.setAttribute('aria-label', `Make ${l.name} the focus language`);
    el.roIsFocus.hidden = !isFocus;
    if (document.activeElement !== el.fStart) el.fStart.value = startHours[id] ? String(startHours[id]) : '';
    el.fStart.placeholder = '0';
  }

  function fieldGeometry(width) {
    // desktop 9 px cells / 2 px gaps; tablet 7 / 2; phone 5 / 1.5
    const phone = window.innerWidth <= 600;
    const cell = phone ? 5 : window.innerWidth <= 980 ? 7 : 9;
    const gap = phone ? 1.5 : 2;
    const pitch = cell + gap;
    const cols = Math.max(1, Math.floor((width + gap) / pitch));
    return { cell, gap, pitch, cols };
  }

  function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  const forcedColors = matchMedia('(forced-colors: active)');

  function drawField(now) {
    const forced = forcedColors.matches;
    const colors = forced
      ? { empty: 'CanvasText', other: 'Highlight', focus: 'Highlight', flash: 'Highlight', done: 'CanvasText' }
      : { empty: cssVar('--cell-empty'), other: cssVar('--cell-other'), focus: cssVar('--cell-focus'), flash: cssVar('--cell-flash'), done: cssVar('--cell-done') };
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const glow = root.dataset.theme !== 'light' && !forced;
    const first = runs[FIELD_LANGS[0].id];
    const width = first ? first.cells.clientWidth : 0;
    if (!width) return;
    const g = fieldGeometry(width);
    for (const l of FIELD_LANGS) {
      const r = runs[l.id];
      const rows = Math.ceil(l.target / g.cols);
      const h = Math.ceil(rows * g.pitch - g.gap);
      const cw = Math.round(width * dpr), ch = Math.round(h * dpr);
      if (r.canvas.width !== cw || r.canvas.height !== ch) {
        r.canvas.width = cw; r.canvas.height = ch; r.canvas.style.height = `${h}px`;
      }
      const ctx = r.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, h);
      const have = fieldFill[l.id] || 0;
      const isDone = have >= l.target;
      const fill = isDone ? colors.done : l.id === state.focus ? colors.focus : colors.other;
      const full = Math.floor(have), part = have - full;
      const fl = flash && flash.lang === l.id ? flash : null;
      const pos = i => [(i % g.cols) * g.pitch, Math.floor(i / g.cols) * g.pitch];
      const startEmpty = Math.min(full + (part > 0 ? 1 : 0), l.target);
      if (forced) {
        ctx.strokeStyle = colors.empty; ctx.lineWidth = 1;
        for (let i = startEmpty; i < l.target; i++) { const [x, y] = pos(i); ctx.strokeRect(x + 0.5, y + 0.5, g.cell - 1, g.cell - 1); }
      } else {
        ctx.fillStyle = colors.empty;
        for (let i = startEmpty; i < l.target; i++) { const [x, y] = pos(i); ctx.fillRect(x, y, g.cell, g.cell); }
      }
      // a faint glow on the focus language in the dark edition; finished hours stay flat ink
      if (glow && !isDone && l.id === state.focus) { ctx.shadowColor = fill; ctx.shadowBlur = 5; }
      for (let i = 0; i < startEmpty; i++) {
        const [x, y] = pos(i);
        if (i >= full) { // the partial hour: an empty cell with a proportional fill
          ctx.shadowBlur = 0;
          ctx.fillStyle = colors.empty; if (!forced) ctx.fillRect(x, y, g.cell, g.cell);
          if (glow && !isDone && l.id === state.focus) ctx.shadowBlur = 5;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, i < full ? g.cell : Math.max(1, g.cell * part), g.cell);
      }
      ctx.shadowBlur = 0;
      if (fl) {
        const a0 = Math.floor(fl.from), a1 = Math.ceil(fl.to), n = Math.max(1, a1 - a0);
        for (let i = a0; i < a1 && i < l.target; i++) {
          const [x, y] = pos(i);
          // newly filled cells light up in order, then settle
          const local = (now - fl.start - ((i - a0) / n) * 500) / 700;
          const a = local < 0 ? 0 : Math.max(0, 1 - local);
          if (a > 0) { ctx.globalAlpha = a; ctx.fillStyle = colors.flash; ctx.fillRect(x - 0.5, y - 0.5, g.cell + 1, g.cell + 1); ctx.globalAlpha = 1; }
        }
      }
    }
  }

  function flashField(lang, from, to) {
    if (reduceMotion.matches || to <= from) return;
    const run = runs[lang]?.el;
    let delay = 0;
    if (run) {
      const r = run.getBoundingClientRect();
      // keep the run clear of the topbar and of the toast at the bottom
      if (r.top < 72 || r.bottom > innerHeight - 110) {
        const top = window.scrollY + r.top - Math.max(80, (innerHeight - 110 - r.height) / 2);
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        delay = 500;
      }
    }
    setTimeout(() => {
      flash = { lang, from, to, start: performance.now() };
      const step = now => {
        if (!flash) return;
        drawField(now);
        if (now - flash.start < 1300) requestAnimationFrame(step);
        else { flash = null; drawField(); }
      };
      requestAnimationFrame(step);
    }, delay);
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

  function niceStep(max) {
    // 4 integer ticks: step from 1, 2, 5 x 10^k
    if (max <= 0) return 1;
    const raw = (max * 1.1) / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / pow;
    const s = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
    return Math.max(1, s);
  }

  function renderChart() {
    const data = weeklySeries();
    const svg = el.chart;
    const W = Math.max(280, Math.round(svg.getBoundingClientRect().width || 800)), H = 220;
    const padL = 34, padR = 6, padT = 18, padB = 26;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; };

    const max = Math.max(...data.map(d => d.hours), 0);
    const step = niceStep(max);
    const yMax = step * 4;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const y = v => padT + plotH - (v / yMax) * plotH;
    const band = plotW / data.length;
    const barW = Math.min(24, band * 0.6);
    const labelEvery = W < 480 ? 3 : 2;

    for (let i = 0; i <= 4; i++) {
      const v = step * i, yy = y(v);
      svg.appendChild(mk('line', { class: i === 0 ? 'baseline' : 'grid', x1: padL, x2: W - padR, y1: yy, y2: yy }));
      svg.appendChild(mk('text', { class: 'tick', x: padL - 8, y: yy + 4, 'text-anchor': 'end' }, v.toLocaleString()));
    }

    data.forEach((d, i) => {
      const cx = padL + band * i + band / 2;
      const g = mk('g', { class: 'col' });
      const top = y(d.hours), h = padT + plotH - top;
      if (d.hours > 0) {
        // 4px rounded data-end, square at the baseline
        const r = Math.min(4, h, barW / 2), x0 = cx - barW / 2, x1 = cx + barW / 2, yb = padT + plotH;
        g.appendChild(mk('path', { class: 'bar', d: `M${x0},${yb} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x1 - r} Q${x1},${top} ${x1},${top + r} V${yb} Z` }));
      }
      const isCur = i === data.length - 1, isMax = d.hours > 0 && d.hours === max;
      if ((isCur && d.hours > 0) || isMax) g.appendChild(mk('text', { class: 'bar-label', x: cx, y: top - 6 }, fmtNum(d.hours)));
      if ((data.length - 1 - i) % labelEvery === 0) svg.appendChild(mk('text', { class: 'tick', x: cx, y: H - 8, 'text-anchor': 'middle' }, isCur ? 'Now' : fmtShort(d.start)));
      const hit = mk('rect', { class: 'hit', x: padL + band * i, y: padT, width: band, height: plotH });
      const show = () => showTip(d, cx, Math.max(top, padT));
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') hideTip(); });
      g.appendChild(hit);
      svg.appendChild(g);
    });
    if (max === 0) svg.appendChild(mk('text', { class: 'nodata', x: padL + plotW / 2, y: padT + plotH / 2 }, 'No hours in the last 12 weeks'));

    el.chartTable.innerHTML = data.map(d => `<tr><td>${fmtShort(d.start)} to ${fmtShort(addDays(d.start, 6))}</td><td class="num">${fmtNum(d.hours)}</td></tr>`).join('');
  }
  function showTip(d, x, y) {
    el.chartTip.innerHTML = `<strong>${hrs(d.hours)}</strong>, ${fmtShort(d.start)} to ${fmtShort(addDays(d.start, 6))}${chartLang === 'all' ? '' : ` (${BY_ID[state.focus].name})`}`;
    const w = el.chart.getBoundingClientRect().width;
    el.chartTip.style.left = `${Math.max(70, Math.min(w - 70, x))}px`;
    el.chartTip.style.top = `${Math.max(y, 28)}px`;
    el.chartTip.hidden = false;
  }
  function hideTip() { el.chartTip.hidden = true; }
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('.chart')) hideTip(); });

  // ---------- sessions ----------
  const displayNote = e => (e.source === 'toggl' && /^\d+ Toggl sessions?$/.test(e.note) ? 'Toggl, no tags' : e.note);
  function renderHistory() {
    const manual = state.entries.map((e, i) => [e, 1e6 + i]);
    const synced = toggl.entries.map((e, i) => [e, i]);
    const sorted = manual.concat(synced).sort((a, b) => b[0].date.localeCompare(a[0].date) || b[1] - a[1]).map(x => x[0]);
    const LIMIT = 60;
    const shown = showAllHistory ? sorted : sorted.slice(0, LIMIT);
    el.historyBody.innerHTML = shown.map(e => {
      const name = BY_ID[e.lang].name, note = escapeHtml(displayNote(e));
      return `
      <tr data-id="${e.id}">
        <td class="date">${fmtDate(e.date)}</td>
        <td>${name}${e.source === 'toggl' ? ' <span class="badge">Toggl</span>' : ''}</td>
        <td class="num">${fmtExact(e.hours)}</td>
        <td class="note" title="${note}">${note}</td>
        <td class="act">${e.source === 'toggl' ? '' : `<button type="button" class="icon-btn del-btn" data-del="${e.id}" aria-label="Delete ${name} session, ${fmtDate(e.date)}, ${fmtExact(e.hours)} h"><svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>`}</td>
      </tr>`;
    }).join('');
    el.historyEmpty.hidden = sorted.length > 0;
    el.history.hidden = sorted.length === 0;
    el.showAll.hidden = sorted.length <= LIMIT;
    el.showAll.textContent = showAllHistory ? 'Show the latest 60' : `Show all ${sorted.length} sessions`;
  }
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- data (footer) ----------
  function renderData() {
    const togglH = toggl.entries.reduce((s, e) => s + e.hours, 0);
    const manualH = state.entries.reduce((s, e) => s + e.hours, 0);
    const startH = Object.values(startHours).reduce((s, v) => s + v, 0);
    const parts = [];
    if (togglH) parts.push(`${hrs(togglH)} from Toggl`);
    if (manualH) parts.push(`${hrs(manualH)} logged here`);
    if (startH) parts.push(`${hrs(startH)} from before tracking`);
    el.dataSplit.textContent = !parts.length ? 'No hours yet.'
      : parts.length === 1 && togglH ? `All ${hrs(togglH)} so far are from Toggl.`
      : `${parts.join(', ')}.`;
    el.reset.disabled = !state.entries.length;
    el.resetNote.hidden = state.entries.length > 0;
  }

  // ---------- toast (fixed, with optional actions) ----------
  let toastTimer = null, toastMs = 0;
  function toast(msg, actions = []) {
    el.toast.innerHTML = '';
    const p = document.createElement('span');
    p.className = 'toast-msg';
    p.textContent = msg;
    el.toast.appendChild(p);
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-btn'; b.textContent = a.label;
      if (a.aria) b.setAttribute('aria-label', a.aria);
      b.addEventListener('click', () => { hideToast(); a.run(); });
      el.toast.appendChild(b);
    }
    el.toast.classList.add('is-on');
    toastMs = actions.length ? 6500 : 4000;
    armToast();
  }
  function armToast() { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, toastMs); }
  function hideToast() {
    clearTimeout(toastTimer);
    const hadFocus = el.toast.contains(document.activeElement);
    el.toast.classList.remove('is-on');
    setTimeout(() => { if (!el.toast.classList.contains('is-on')) el.toast.innerHTML = ''; }, 300);
    if (hadFocus) el.form.hidden ? el.btnOther.focus() : el.fHours.focus();
  }
  // keep the toast up while it is being used
  el.toast.addEventListener('pointerenter', () => clearTimeout(toastTimer));
  el.toast.addEventListener('pointerleave', () => { if (el.toast.classList.contains('is-on')) armToast(); });
  el.toast.addEventListener('focusin', () => clearTimeout(toastTimer));
  el.toast.addEventListener('focusout', () => { if (el.toast.classList.contains('is-on')) armToast(); });

  // ---------- actions ----------
  function setFocus(id) {
    if (!BY_ID[id]?.target) return;
    state.focus = id; el.fLang.value = id;
    save(); render();
  }

  function removeEntry(id) {
    const i = state.entries.findIndex(e => e.id === id);
    if (i < 0) return null;
    const [gone] = state.entries.splice(i, 1);
    return { gone, i };
  }

  function addEntry(lang, hours, date, note) {
    const entry = sanitize({ entries: [{ id: uid(), lang, hours, date, note }] })?.entries[0];
    if (!entry) return false;
    const l = BY_ID[lang];
    const wasFocus = lang === state.focus;
    const before = loggedBy()[lang];
    const togglSame = round2(toggl.entries.filter(e => e.lang === lang && e.date === entry.date).reduce((s, e) => s + e.hours, 0));
    state.entries.push(entry);
    const ok = save();
    render();
    if (state.entries.length) askPersist();
    const after = loggedBy()[lang];
    const crossed = l.target && before < l.target && after >= l.target;
    let msg;
    if (!l.target) msg = `Logged ${fmtExact(entry.hours)}${NB}h of ${l.name}.`;
    else if (crossed) msg = `Logged ${fmtExact(entry.hours)}${NB}h. ${l.name} target reached: ${l.target} of ${l.target}${NB}h.`;
    else if (after >= l.target) msg = `Logged ${fmtExact(entry.hours)}${NB}h of ${l.name}.`;
    else msg = `Logged ${fmtExact(entry.hours)}${NB}h of ${l.name}. ${hrs(l.target - after)} left.`;
    if (togglSame > 0) msg += ` Toggl already has ${hrs(togglSame)} of ${l.name} for this day.`;
    const actions = [{ label: 'Undo', aria: `Undo: remove the ${fmtExact(entry.hours)} h ${l.name} session`, run: () => { removeEntry(entry.id); save(); render(); toast('Removed that session.'); } }];
    if (crossed && wasFocus) {
      const next = nextFocusCandidates(1)[0];
      if (next) actions.push({ label: `Make ${next.name} the focus`, run: () => { setFocus(next.id); toast(`${next.name} is the focus language.`); } });
    }
    if (ok) toast(msg, actions);
    if (l.target) flashField(lang, Math.min(before, l.target), Math.min(after, l.target));
    // Hooks for fx.js (optional visual layer). Nothing here depends on it.
    document.dispatchEvent(new CustomEvent('session-logged', { detail: { lang, hours } }));
    if (crossed) document.dispatchEvent(new CustomEvent('target-reached', { detail: { lang } }));
    return true;
  }

  const coarse = matchMedia('(pointer: coarse)');
  el.form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!el.form.reportValidity()) return;
    if (addEntry(el.fLang.value, +el.fHours.value, el.fDate.value, el.fNote.value.trim())) {
      el.fHours.value = ''; el.fNote.value = '';
      if (coarse.matches) document.activeElement?.blur(); // don't reopen the iOS keyboard
      else el.fHours.focus();
    }
  });
  document.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => addEntry(state.focus, +b.dataset.quick, todayIso(), '')));

  function toggleForm(open) {
    el.form.hidden = !open;
    el.btnOther.setAttribute('aria-expanded', String(open));
    el.btnOther.classList.toggle('is-open', open);
    if (open) { el.fLang.value = state.focus; el.fDate.value = el.fDate.value || todayIso(); el.fHours.focus({ preventScroll: true }); }
  }
  el.btnOther.addEventListener('click', () => toggleForm(el.form.hidden));

  document.addEventListener('click', ev => {
    const del = ev.target.closest('[data-del]');
    if (del) {
      const btns = [...document.querySelectorAll('[data-del]')];
      const idx = btns.indexOf(del);
      const res = removeEntry(del.dataset.del);
      if (!res) return;
      save(); render();
      const after = [...document.querySelectorAll('[data-del]')];
      const target = after[Math.min(idx, after.length - 1)];
      (target || $('#history-title')).focus();
      toast('Session deleted.', [{ label: 'Undo', aria: 'Undo: restore the deleted session', run: () => { state.entries.splice(Math.min(res.i, state.entries.length), 0, res.gone); save(); render(); } }]);
      return;
    }
    const focus = ev.target.closest('[data-focus]');
    if (focus) { setFocus(focus.dataset.focus); return; }
    if (ev.target.closest('[data-open-form]')) { toggleForm(el.form.hidden); return; }
    const seg = ev.target.closest('[data-chart-lang]');
    if (seg) {
      chartLang = seg.dataset.chartLang;
      document.querySelectorAll('[data-chart-lang]').forEach(b => b.setAttribute('aria-pressed', String(b === seg)));
      renderChart();
    }
  });

  el.roFocus.addEventListener('click', () => {
    if (!fieldSel) return;
    const id = fieldSel;
    setFocus(id);
    toast(`${BY_ID[id].name} is the focus language.`);
    el.roIsFocus.setAttribute('tabindex', '-1');
    el.roIsFocus.focus();
  });
  el.roStart.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!fieldSel || !el.roStart.reportValidity()) return;
    const v = el.fStart.value === '' ? 0 : +el.fStart.value;
    if (!isFinite(v) || v < 0) return;
    const prev = startHours[fieldSel] || 0;
    if (v > 0) startHours[fieldSel] = round2(v); else delete startHours[fieldSel];
    const id = fieldSel;
    if (saveStart()) {
      el.fStart.blur();
      render();
      toast(`${BY_ID[id].name}: ${hrs(v)} from before tracking.`, [{ label: 'Undo', run: () => { if (prev) startHours[id] = prev; else delete startHours[id]; saveStart(); render(); } }]);
    }
  });

  el.showAll.addEventListener('click', () => { showAllHistory = !showAllHistory; renderHistory(); });

  el.reset.addEventListener('click', () => {
    const n = state.entries.length;
    if (!n) return;
    if (confirm(`Delete all ${n} ${n === 1 ? 'session' : 'sessions'} logged in this browser? Toggl hours stay. Export first to keep a copy.`)) {
      const kept = state.entries;
      state.entries = []; save(); render();
      toast(`Deleted ${n} ${n === 1 ? 'session' : 'sessions'}.`, [{ label: 'Undo', run: () => { state.entries = kept.concat(state.entries); save(); render(); } }]);
    }
  });

  $('#btn-export').addEventListener('click', () => {
    // Same shape as before ({entries, focus}); startHours is an extra field older versions ignore.
    const out = { ...state, ...(Object.keys(startHours).length ? { startHours } : {}), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `language-stack-${todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async ev => {
    const file = ev.target.files?.[0]; if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const incoming = sanitize(json);
      if (!incoming) throw new Error('bad file');
      const known = new Set(state.entries.map(e => e.id));
      // Toggl rows come from the sync, never from a backup file.
      const added = incoming.entries.filter(e => !known.has(e.id) && e.source !== 'toggl');
      state.entries.push(...added);
      const inStart = cleanStart(json.startHours);
      let startAdded = 0;
      for (const k in inStart) if (!startHours[k]) { startHours[k] = inStart[k]; startAdded++; }
      save(); if (startAdded) saveStart(); render();
      toast(`Imported ${added.length} new ${added.length === 1 ? 'session' : 'sessions'}.${startAdded ? ` Added hours from before tracking for ${startAdded} ${startAdded === 1 ? 'language' : 'languages'}.` : ''}`);
      if (added.length) askPersist();
    } catch { toast('Couldn’t read that file. Choose a .json file exported from this page.'); }
    ev.target.value = '';
  });

  // ---------- theme ----------
  // Dark is the default edition, whatever the OS setting; the toggle stores an explicit choice.
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') root.dataset.theme = t; } catch {}
  const syncThemeBtn = () => {
    const light = root.dataset.theme === 'light';
    el.themeBtn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f3efe7' : '#0b0a09');
  };
  el.themeBtn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch {}
    syncThemeBtn();
    render();
  });
  syncThemeBtn();

  // ---------- init ----------
  el.fLang.innerHTML = FIELD_LANGS.map(l => `<option value="${l.id}">${l.name}, target ${l.level} (${l.target}${NB}h)</option>`).join('');
  el.fLang.value = state.focus;
  el.fDate.value = todayIso();
  el.fDate.max = todayIso();
  el.fTarget.value = targetDate();
  el.fTarget.addEventListener('change', () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(el.fTarget.value)) { el.fTarget.value = targetDate(); return; }
    try { localStorage.setItem(TARGET_KEY, el.fTarget.value); } catch {}
    render();
  });
  if (matchMedia('(hover: none)').matches) el.fieldHint.textContent = 'Tap a language for details.';
  buildField();
  document.querySelectorAll('.pace-note-window').forEach(n => { n.textContent = `average of the ${PACE_LABEL}`; });
  render();
  if (state.entries.length) askPersist();
  if (loadProblem) {
    askPersist().then(() => toast(`Couldn’t read saved sessions. A copy was kept.${persistRefused ? ' This browser may clear saved data, so use Export to keep a copy.' : ''}`));
  }

  // Keep dates honest when the tab stays open past midnight.
  let lastDay = todayIso();
  function tick() {
    const t = todayIso();
    if (t !== lastDay) {
      if (el.fDate.value === lastDay) el.fDate.value = t;
      el.fDate.max = t; lastDay = t;
      render();
    } else { renderToday(); renderSync(); }
  }
  setInterval(tick, 60 * 1000);

  // Re-render the chart and timeline labels at their real width.
  if ('ResizeObserver' in window) {
    let cw = 0;
    new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w !== cw) { cw = w; renderChart(); } }).observe(el.chart);
    let tw = 0;
    new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w !== tw) { tw = w; if (tlState) renderTimeline(tlState); } }).observe(el.timeline);
  }

  // Toggl data is written to data/toggl.json by the scheduled GitHub Action.
  let lastFetch = 0;
  function fetchToggl() {
    lastFetch = Date.now();
    return fetch(`data/toggl.json?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(json => {
        const clean = json && sanitize(json);
        if (!clean) throw new Error('bad toggl.json');
        togglFailed = false;
        toggl = { entries: clean.entries.filter(e => e.source === 'toggl'), syncedAt: json.syncedAt || null, projects: json.projects || [] };
        render();
      })
      .catch(err => { console.info('Toggl hours unavailable', err); togglFailed = true; renderSync(); });
  }
  fetchToggl();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    tick();
    if (Date.now() - lastFetch > 60 * 60 * 1000) fetchToggl();
  });
})();
