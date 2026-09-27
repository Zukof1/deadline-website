/* Deadline — marketing site behaviour.
   Everything that moves here is ported from the app, not approximated:
     getUrgency / formatLiveCountdown  ← utils/urgency.ts, components/TaskCard.tsx
     next-due pill                     ← app/subject/[id].tsx
     widget countdowns + colours       ← plugins/deadline-widget/ios/DeadlineWidget.swift
     reminder + daily strings          ← services/notificationService.ts            */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ICONS = 'assets/img/icons.svg#i-';
  const DAY = 864e5, HOUR = 36e5, MIN = 6e4;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ── utils/urgency.ts ───────────────────────────────────────────────── */
  function getUrgency(ms) {
    if (ms < 0) return { color: '#ef4444', text: 'OVERDUE', isLive: true, band: 'now' };
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    const mins = Math.floor((ms % HOUR) / MIN);
    if (days >= 5) return { color: '#22c55e', text: `${days}D LEFT`, isLive: false, band: 'calm' };
    if (days >= 2) return { color: '#eab308', text: `${days}D ${hours}H`, isLive: false, band: 'soon' };
    if (days >= 1) return { color: '#f97316', text: `${days}D ${hours}H`, isLive: false, band: 'move' };
    return { color: '#ef4444', text: `${hours}H ${mins}M`, isLive: true, band: 'now' };
  }
  /* ── TaskCard.formatLiveCountdown ───────────────────────────────────── */
  function formatLive(ms) {
    if (ms < 0) return 'OVERDUE';
    const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR),
          m = Math.floor((ms % HOUR) / MIN), s = Math.floor((ms % MIN) / 1000);
    return d > 0 ? `${d}D ${h}H ${m}M ${s}S` : `${h}H ${m}M ${s}S`;
  }
  /* TaskCard: ticks when (<24h && Live Countdown) || Extended Live Countdown */
  function cardText(ms, extended) {
    const u = getUrgency(ms);
    return { u, text: (u.isLive || extended) ? formatLive(ms) : u.text };
  }
  /* ── subject/[id].tsx nextDueString ─────────────────────────────────── */
  function nextDue(ms) {
    if (ms < 0) return 'Due Now!';
    const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN);
    if (d > 0) return `Next Due In: ${d}d ${h}h`;
    if (h > 0) return `Next Due In: ${h}h ${m}m`;
    return `Next Due In: ${m}m`;
  }
  const formatDue = (dt) =>
    `Due: ${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} @ ${dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

  function nextFriday(now = new Date()) {
    const t = new Date(now);
    t.setHours(23, 59, 0, 0);
    t.setDate(t.getDate() + ((5 - t.getDay() + 7) % 7));
    if (t <= now) t.setDate(t.getDate() + 7);
    return t;
  }

  /* One ticker for the whole page, aligned to whole seconds so every
     countdown on screen changes on the same frame, like the app. */
  const tickers = new Set();
  function onTick(fn) { tickers.add(fn); fn(Date.now()); }
  (function align() {
    setTimeout(() => {
      const now = Date.now();
      tickers.forEach((fn) => fn(now));
      align();
    }, 1000 - (Date.now() % 1000) + 5);
  })();

  /* ── chrome: time rail + nav ─────────────────────────────────────────── */
  const rail = $('.timerail span'), nav = $('.nav');
  let railQueued = false;
  function paintRail() {
    railQueued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    rail.style.width = (p * 100).toFixed(2) + '%';
    nav.classList.toggle('scrolled', scrollY > 8);
  }
  addEventListener('scroll', () => { if (!railQueued) { railQueued = true; requestAnimationFrame(paintRail); } }, { passive: true });
  addEventListener('resize', paintRail);
  paintRail();

  /* ── reveal on scroll ────────────────────────────────────────────────── */
  const seen = (el, fn, opts = {}) => {
    if (!('IntersectionObserver' in window)) { fn(el, true); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => fn(e.target, e.isIntersecting, io)), opts);
    io.observe(el);
  };
  $$('.reveal').forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    const i = sibs.indexOf(el);
    if (i > 0) el.style.transitionDelay = Math.min(i * 100, 400) + 'ms';
    seen(el, (t, on, io) => { if (on) { t.classList.add('in'); io && io.unobserve(t); } }, { rootMargin: '0px 0px -8% 0px' });
  });

  /* ── hero: “due friday” → the real time left, in the visitor’s zone ──── */
  const heroFriday = nextFriday();
  const morph = $('#morph'), heroCount = $('#heroCount'), heroDot = $('#heroDot'), heroNote = $('#heroNote');
  {
    const today = new Date();
    const sameDay = heroFriday.toDateString() === today.toDateString();
    const time = heroFriday.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    heroNote.textContent = `until ${sameDay ? 'tonight' : 'Friday'}, ${time} — your time`;
  }
  onTick((now) => {
    const ms = heroFriday - now;
    const u = getUrgency(ms);
    const text = formatLive(ms);
    heroCount.textContent = text;
    morph.style.setProperty('--n', Math.max(10, text.length));
    morph.style.setProperty('--uc', u.color);
    heroDot.style.setProperty('--uc', u.color);
    heroDot.classList.toggle('live', u.isLive);
  });
  if (reduced) morph.classList.add('swapped');
  else setTimeout(() => morph.classList.add('swapped'), 1300);

  /* ── the demo card ───────────────────────────────────────────────────── */
  const RANGE = 7 * DAY / 1000;                      // slider seconds, 7 days out → due
  const demo = {
    card: $('#demoCard'), title: $('#demoTitle'), due: $('#demoDue'), count: $('#demoCount'),
    check: $('#demoCheck'), scrub: $('#scrub'), out: $('#scrubOut'), ext: $('#extended'),
    pend: $('#pendPill'), pill: $('#duePill'), pillText: $('#duePillText'),
    ownTitle: $('#ownTitle'), ownWhen: $('#ownWhen'), ownEod: $('#ownEod'), own: $('#own'),
    target: Date.now() + 7 * DAY, extended: false, done: false, autoplay: 0,
  };
  const ladderItems = $$('#ladder li');

  function describe(ms) {
    if (ms < 0) { const h = Math.ceil(-ms / HOUR); return `${h} hour${h > 1 ? 's' : ''} overdue`; }
    const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR);
    if (d === 0 && h === 0) return 'due now';
    return [d && `${d} day${d > 1 ? 's' : ''}`, h && `${h} hour${h > 1 ? 's' : ''}`].filter(Boolean).join(' ') + ' out';
  }

  function paintDemo(now = Date.now()) {
    const ms = demo.target - now;
    const { u, text } = cardText(ms, demo.extended);
    demo.card.style.setProperty('--uc', u.color);
    demo.card.classList.toggle('live', u.isLive && !demo.done);
    demo.count.textContent = text;
    demo.due.textContent = formatDue(new Date(demo.target));
    demo.pill.style.setProperty('--uc', u.color);
    demo.pill.classList.toggle('live', u.isLive);
    demo.pill.hidden = demo.done;
    demo.pillText.textContent = nextDue(ms);
    demo.pend.textContent = demo.done ? '0 pending' : '1 pending';
    demo.out.textContent = describe(ms);
    demo.out.style.setProperty('--uc', u.color);
    demo.scrub.setAttribute('aria-valuetext', describe(ms));
    ladderItems.forEach((li) => li.classList.toggle('on', li.dataset.band === u.band && !demo.done));
  }
  function setFromSlider() {
    demo.target = Date.now() + (RANGE - Number(demo.scrub.value)) * 1000;
    paintDemo();
  }
  function syncSlider() {
    const left = (demo.target - Date.now()) / 1000;
    demo.scrub.value = String(Math.max(0, Math.min(Number(demo.scrub.max), RANGE - left)));
  }
  function stopAutoplay() { if (demo.autoplay) cancelAnimationFrame(demo.autoplay); demo.autoplay = 0; }

  demo.scrub.addEventListener('input', () => { stopAutoplay(); reopen(); setFromSlider(); });
  demo.scrub.addEventListener('pointerdown', stopAutoplay);
  demo.ext.addEventListener('change', () => { demo.extended = demo.ext.checked; paintDemo(); paintFinal(); });

  function reopen() {
    if (!demo.done && !demo.card.classList.contains('completing')) return;
    demo.done = false; demo.card.classList.remove('done', 'completing');
    demo.check.setAttribute('aria-label', 'Mark as complete');
  }
  demo.check.addEventListener('click', () => {
    if (demo.done) { reopen(); paintDemo(); return; }
    if (demo.card.classList.contains('completing')) return;
    stopAutoplay();
    demo.card.classList.add('completing');
    setTimeout(() => {                                   // the app waits 400ms, then toggles
      demo.card.classList.remove('completing');
      demo.card.classList.add('done');
      demo.done = true;
      demo.check.setAttribute('aria-label', 'Completed — tap to reopen');
      paintDemo();
    }, 400);
  });

  /* “The week falls”: once, when the demo first comes into view. */
  function playWeek() {
    const from = 0, to = RANGE - 20 * 3600 - 17 * 60;  // stop with ~20h left: red, ticking
    const dur = 5200, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = k * k * (1.6 - .6 * k);                  // accelerates: time runs out faster
      demo.scrub.value = String(Math.round(from + (to - from) * e));
      setFromSlider();
      demo.autoplay = k < 1 ? requestAnimationFrame(step) : 0;
    };
    demo.autoplay = requestAnimationFrame(step);
  }
  seen($('#demo'), (el, on, io) => {
    if (!on) return;
    io && io.unobserve(el);
    if (reduced) { demo.scrub.value = String(RANGE - 20 * 3600 - 17 * 60); setFromSlider(); }
    else playWeek();
  }, { threshold: .55 });
  setFromSlider();
  onTick(() => { if (!demo.autoplay) paintDemo(); });

  /* Your own deadline — remembered on this device only. */
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let own = store.get('dl-own');
  function applyOwn(save) {
    const title = demo.ownTitle.value.trim();
    const when = demo.ownWhen.value ? new Date(demo.ownWhen.value) : null;
    demo.title.textContent = title || 'Research Essay';
    if (when && !isNaN(when)) { stopAutoplay(); reopen(); demo.target = when.getTime(); syncSlider(); }
    paintDemo();
    if (save) { own = { title, when: when && !isNaN(when) ? when.getTime() : null }; store.set('dl-own', own); }
    paintFinal();
  }
  demo.own.addEventListener('toggle', () => {
    if (demo.own.open && !demo.ownWhen.value) { demo.ownWhen.value = toLocalInput(heroFriday); }
  });
  demo.ownTitle.addEventListener('input', () => applyOwn(true));
  demo.ownWhen.addEventListener('input', () => applyOwn(true));
  demo.ownEod.addEventListener('click', () => {
    const base = demo.ownWhen.value ? new Date(demo.ownWhen.value) : new Date();
    base.setHours(23, 59, 0, 0);
    demo.ownWhen.value = toLocalInput(base);
    applyOwn(true);
  });
  if (own && (own.title || own.when)) {
    demo.ownTitle.value = own.title || '';
    if (own.when) demo.ownWhen.value = toLocalInput(new Date(own.when));
  }

  /* ── final card: your deadline if you gave one, otherwise Friday ─────── */
  const fin = { card: $('#finalCard'), title: $('#finalTitle'), due: $('#finalDue'), count: $('#finalCount'), note: $('#finalNote'), sec: $('.final') };
  function finalTarget() { return own && own.when ? own.when : heroFriday.getTime(); }
  function paintFinal(now = Date.now()) {
    const t = finalTarget(), ms = t - now;
    const { u, text } = cardText(ms, true);             // Extended Live Countdown on: it ticks
    const title = (own && own.title) || 'Research Essay';
    fin.title.textContent = title;
    fin.due.textContent = formatDue(new Date(t));
    fin.count.textContent = text;
    fin.card.style.setProperty('--uc', u.color);
    fin.card.classList.toggle('live', u.isLive);
    fin.sec.style.setProperty('--uc', u.color);
    fin.note.textContent = ms < 0
      ? 'That one’s gone. The next one doesn’t have to.'
      : own && (own.title || own.when) ? 'That’s how long you’ve got. Might as well know.' : 'That’s how long Friday actually is. Might as well know.';
  }
  onTick(paintFinal);

  /* ── subject builder (the app’s COLORS and ICONS, in order) ──────────── */
  const COLORS = [['#5E5CE6', 'Indigo'], ['#FF3B30', 'Red'], ['#FF9500', 'Orange'], ['#34C759', 'Green'], ['#30B0C7', 'Teal'],
                  ['#007AFF', 'Blue'], ['#FF6B9D', 'Pink'], ['#8E8E93', 'Grey'], ['#FFD60A', 'Yellow'], ['#00875A', 'Forest green']];
  const SUBJECT_ICONS = ['book', 'calculator', 'flask', 'globe', 'code', 'brush', 'briefcase', 'fitness', 'musical-notes',
                         'terminal', 'trending-up', 'layers', 'chatbubbles', 'stats-chart', 'trophy'];
  const sc = $('#scCard'), scUse = $('#scIconUse'), sw = $('#swatches'), ip = $('#iconpick');
  const builder = $('.builder');
  let scColor = '#FF3B30', scIcon = 'book';
  function paintBuilder() {
    sc.style.setProperty('--sc', scColor);
    builder.style.setProperty('--sc', scColor);
    scUse.setAttribute('href', ICONS + scIcon);
    $$('.swatch', sw).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === scColor)));
    $$('.iconbtn', ip).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.i === scIcon)));
  }
  COLORS.forEach(([c, name]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.dataset.c = c; b.style.setProperty('--c', c);
    b.setAttribute('aria-label', name);
    b.addEventListener('click', () => { scColor = c; paintBuilder(); });
    sw.append(b);
  });
  SUBJECT_ICONS.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'iconbtn'; b.dataset.i = n;
    b.setAttribute('aria-label', n.replace('-', ' '));
    b.innerHTML = `<svg aria-hidden="true"><use href="${ICONS}${n}"/></svg>`;
    b.addEventListener('click', () => { scIcon = n; paintBuilder(); });
    ip.append(b);
  });
  paintBuilder();

  /* ── accent themes (constants/theme.ts) ──────────────────────────────── */
  const THEMES = [['Aurora', '#5E5CE6', '94, 92, 230', '#A8A7FF'], ['Midnight Rose', '#FF2D78', '255, 45, 120', '#FF8DB5'],
                  ['Neon Mint', '#00C9A7', '0, 201, 167', '#6BEBD4'], ['Solar', '#FF9500', '255, 149, 0', '#FFC266'],
                  ['Glacier', '#64D2FF', '100, 210, 255', '#A9E7FF']];
  const themes = $('#themes'), root = document.documentElement;
  THEMES.forEach(([name, hex, rgb, ink], i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'theme'; b.style.setProperty('--c', hex);
    b.setAttribute('aria-label', name); b.title = name;
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => {
      root.style.setProperty('--accent', hex); root.style.setProperty('--accent-rgb', rgb); root.style.setProperty('--accent-ink', ink);
      $$('.theme', themes).forEach((t) => t.setAttribute('aria-pressed', String(t === b)));
    });
    themes.append(b);
  });

  /* ── reminders ───────────────────────────────────────────────────────── */
  seen($('#notifs'), (el, on, io) => { if (on) { el.classList.add('in'); io && io.unobserve(el); } }, { threshold: .25 });
  const DAILY = ["You've got deadlines coming. Worth a check.", 'Quick look at your week — anything sneaking up?', 'Stay ahead. Open Deadline.',
    "What's due soon? Better to know now.", "Your assignments won't submit themselves.", 'Future you will thank present you for checking.',
    "Semester's moving. Are you?", 'Just a reminder your deadlines are waiting.', "30 seconds. Open Deadline. You'll feel better.",
    'One quick check. That’s all.', "Don't forget to check your deadlines today."].map((s) => s.replace(/'/g, '’'));
  const alt = $('#dailyAlt');
  let di = DAILY.indexOf('Semester’s moving. Are you?'), dailyTimer = 0;
  seen(alt, (el, on) => {
    clearInterval(dailyTimer);
    if (!on) return;
    dailyTimer = setInterval(() => {
      di = (di + 1) % DAILY.length;
      alt.classList.add('fade');
      setTimeout(() => { alt.textContent = `“${DAILY[di]}”`; alt.classList.remove('fade'); }, reduced ? 0 : 300);
    }, 3200);
  });

  /* ── real screen recordings: load + play only while on screen ────────── */
  $$('video[data-poster]').forEach((v) => {
    seen(v, (el, on, io) => { if (on) { el.poster = el.dataset.poster; io && io.unobserve(el); } }, { rootMargin: '1200px 0px' });
  });
  $$('video[data-src]').forEach((v) => {
    if (v.closest('dialog')) return;
    if (reduced || saveData) { v.controls = true; v.preload = 'none'; v.src = v.dataset.src; return; }
    seen(v, (el, on) => {
      if (on) {
        if (!el.src) el.src = el.dataset.src;
        const p = el.play(); if (p) p.catch(() => { el.controls = true; });
      } else if (!el.paused) el.pause();
    }, { threshold: .5 });
  });

  /* ── the 11:58 film ──────────────────────────────────────────────────── */
  const box = $('#filmBox'), film = $('#filmVideo');
  $('#filmBtn').addEventListener('click', () => {
    if (!film.src) film.src = film.dataset.src;
    if (box.showModal) box.showModal(); else box.setAttribute('open', '');
    const p = film.play(); if (p) p.catch(() => {});
  });
  const closeFilm = () => { film.pause(); box.close ? box.close() : box.removeAttribute('open'); };
  $('#filmClose').addEventListener('click', closeFilm);
  box.addEventListener('click', (e) => { if (e.target === box) closeFilm(); });
  box.addEventListener('close', () => film.pause());

  /* ── widgets (DeadlineWidget.swift) ──────────────────────────────────── */
  const t0 = Date.now();
  const SAMPLE = [
    { title: 'Research Essay', subject: 'PSY101', color: '#FF3B30', due: t0 + 22 * HOUR + 37 * MIN },
    { title: 'Case Study Report', subject: 'PSY101', color: '#FF3B30', due: t0 + 29 * HOUR + 12 * MIN },
    { title: 'Lab Report', subject: 'BIO204', color: '#00875A', due: t0 + 34 * HOUR + 12 * MIN },
    { title: 'Reading Summary', subject: 'SOC215', color: '#FF6B9D', due: t0 + 58 * HOUR + 12 * MIN },
    { title: 'Practical Exam', subject: 'BIO204', color: '#00875A', due: t0 + 106 * HOUR + 12 * MIN },
  ];
  const wCountdown = (sec) => {
    const tm = Math.max(1, Math.ceil(Math.max(0, sec) / 60));
    if (tm >= 1440) { const d = Math.floor(tm / 1440), h = Math.floor((tm % 1440) / 60); return h > 0 ? `${d}d ${h}h left` : `${d}d left`; }
    if (tm >= 60) return `${Math.floor(tm / 60)}h left`;
    return `${tm}m left`;
  };
  const wCompact = (sec) => {
    const tm = Math.max(1, Math.ceil(Math.max(0, sec) / 60));
    if (tm >= 1440) return `${Math.floor(tm / 1440)}d`;
    if (tm >= 60) return `${Math.floor(tm / 60)}h`;
    return `${tm}m`;
  };
  const wColor = (a, sec) => sec <= 86400 ? '#FF625F' : sec <= 259200 ? '#F4A340' : a.color;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wSmall = $('#wSmall'), wMedium = $('#wMedium'), wRect = $('#wRect'), wCirc = $('#wCirc'), wInline = $('#wInline'), lockTime = $('#lockTime');
  function paintWidgets(now) {
    const up = SAMPLE.filter((a) => a.due > now).sort((a, b) => a.due - b.due);
    const first = up[0];
    if (!first) return;
    const sec = (a) => (a.due - now) / 1000;
    wSmall.innerHTML = `<div class="w-head"><b>DEADLINE</b><span>UP NEXT</span></div>
      <p class="w-sub" style="color:${first.color}">${esc(first.subject.toUpperCase())}</p>
      <p class="w-title">${esc(first.title)}</p><p class="w-cd">${wCountdown(sec(first))}</p>
      <div class="w-cap" style="background:${wColor(first, sec(first))}"></div>`;
    const keys = [];
    up.forEach((a) => { const k = a.subject.trim().toLowerCase(); if (!keys.includes(k)) keys.push(k); });
    const cols = keys.slice(0, 2).map((k) => up.filter((a) => a.subject.trim().toLowerCase() === k).slice(0, 2));
    wMedium.innerHTML = `<div class="w-head"><b>DEADLINE</b><span>UPCOMING</span></div><div class="w-cols">${cols.map((c) =>
      `<div class="w-col"><b style="color:${c[0].color}">${esc(c[0].subject.toUpperCase())}</b>${c.map((a) =>
        `<div class="w-item"><p>${esc(a.title)}</p><p>${wCountdown(sec(a))}</p></div>`).join('')}</div>`).join('')}</div>`;
    wRect.innerHTML = `<span>${esc(first.subject.toUpperCase())}</span><b>${esc(first.title)}</b><small>${wCountdown(sec(first))}</small>`;
    const prog = Math.min(Math.max(sec(first) / (7 * 86400), 0), 1);
    const arc = 0.75, C = 2 * Math.PI * 27;
    wCirc.innerHTML = `<svg viewBox="0 0 62 62" aria-hidden="true">
      <circle cx="31" cy="31" r="27" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C * arc} ${C}"/>
      <circle cx="31" cy="31" r="27" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="${Math.max(.01, C * arc * prog)} ${C}"/></svg>
      <b>${wCompact(sec(first))}</b>`;
    wInline.textContent = `Deadline · ${first.title} in ${wCompact(sec(first))}`;
    lockTime.textContent = new Date(now).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?[ap]\.?m\.?$/i, '');
  }
  let lastMinute = -1;
  onTick((now) => { const m = Math.floor(now / MIN); if (m !== lastMinute) { lastMinute = m; paintWidgets(now); } });
})();
