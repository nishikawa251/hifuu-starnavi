/* =========================================================
 * 秘封倶楽部の星空ナビ — メインスクリプト
 *  気象: Open-Meteo（気象庁モデル） / 気象庁 bosai JSON
 *  天体: Astronomy Engine
 * ========================================================= */
(() => {
  'use strict';

  const A = window.Astronomy;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
  const PLANETS = [
    { body: 'Mercury', name: '水星', color: '#d8c3a0' },
    { body: 'Venus', name: '金星', color: '#fff4c8' },
    { body: 'Mars', name: '火星', color: '#ff8a5c' },
    { body: 'Jupiter', name: '木星', color: '#ffd9a0' },
    { body: 'Saturn', name: '土星', color: '#eadb9c' },
  ];
  const SLIDER_START_MIN = 18 * 60;
  const SLIDER_STEP_MIN = 15;
  const NIGHTS = 7;
  const STORAGE_KEY = 'hifuu-starnavi:loc';

  const state = {
    loc: null,
    obs: null,
    base: null,         // 「今夜」の日付 (YYYY-MM-DD)
    offset: 1,          // 0=今夜, 1=明日 …
    step: 12,           // 星図の時刻（18:00 + step*15分）
    showLines: true,
    hourMap: null,
    weatherStatus: 'idle',
    jma: null,
    jmaStatus: 'idle',
    nation: null,
    summaries: [],
    skies: [],
    reqId: 0,
    introDone: false,   // オープニングが終わるまでセリフを始めない
  };

  /* ---------------------------------------------------------
   * 時刻まわり（日本時間で固定。日本は夏時間なし）
   * --------------------------------------------------------- */
  const JST_MS = 9 * 3600e3;
  const jstParts = (d) => {
    const t = new Date(d.getTime() + JST_MS);
    return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds(), wd: t.getUTCDay() };
  };
  const jstDate = (d) => new Date(d.getTime() + JST_MS).toISOString().slice(0, 10);
  const atJst = (dateStr, minutes) => new Date(Date.parse(dateStr + 'T00:00:00+09:00') + minutes * 60000);
  const addDays = (dateStr, n) => jstDate(atJst(dateStr, 12 * 60 + n * 1440));
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const hourKey = (d) => `${jstDate(d)}T${pad(jstParts(d).h)}:00`;
  function fmtHM(d, baseDate) {
    if (!d) return '—';
    const p = jstParts(d);
    const next = baseDate && jstDate(d) > baseDate ? '翌' : '';
    return `${next}${p.h}:${pad(p.mi)}`;
  }
  function dateInfo(dateStr) {
    const p = jstParts(atJst(dateStr, 720));
    return { md: `${p.mo}/${p.d}`, mo: p.mo, d: p.d, wd: WD[p.wd], wdIdx: p.wd };
  }
  // セリフ用の時刻の言い方（夜中の2時、明け方の4時 …）
  const hourWord = (h) => (h >= 18 ? `${h}時` : h <= 3 ? `夜中の${h}時` : `明け方の${h}時`);
  const dirName = (az) => DIRS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

  function whenWord(offset, dateStr) {
    if (offset === 0) return '今夜';
    if (offset === 1) return '明日';
    if (offset === 2) return 'あさって';
    const i = dateInfo(dateStr);
    return `${i.mo}月${i.d}日`;
  }
  function tabLabel(offset, dateStr) {
    if (offset === 0) return '今夜';
    if (offset === 1) return '明日の夜';
    const i = dateInfo(dateStr);
    return `${i.md}（${i.wd}）`;
  }

  /* ---------------------------------------------------------
   * データ取得
   * --------------------------------------------------------- */
  async function fetchJSON(url, ms = 15000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const HOURLY_VARS = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,relative_humidity_2m,temperature_2m';
  function meteoURL(lats, lons, model) {
    const p = new URLSearchParams({ latitude: lats, longitude: lons, hourly: HOURLY_VARS, timezone: 'Asia/Tokyo', past_days: '1', forecast_days: '8' });
    if (model) p.set('models', model);
    return `https://api.open-meteo.com/v1/forecast?${p}`;
  }
  async function fetchMeteo(lats, lons) {
    try {
      return await fetchJSON(meteoURL(lats, lons, 'jma_seamless'));
    } catch (e) {
      console.warn('気象庁モデルの取得に失敗したので標準モデルで再試行します', e);
      return await fetchJSON(meteoURL(lats, lons, null));
    }
  }
  function toHourMap(json) {
    const h = json.hourly;
    const map = new Map();
    h.time.forEach((t, i) => {
      map.set(t, {
        cc: h.cloud_cover[i], low: h.cloud_cover_low?.[i], mid: h.cloud_cover_mid?.[i], high: h.cloud_cover_high?.[i],
        precip: h.precipitation?.[i] ?? 0, rh: h.relative_humidity_2m?.[i], temp: h.temperature_2m?.[i],
      });
    });
    return map;
  }

  // 気象庁の府県天気予報（公式APIではないので、仕様が変わったら取れなくなる可能性あり）
  async function fetchJma(code) {
    const data = await fetchJSON(`https://www.jma.go.jp/bosai/forecast/data/forecast/${code}.json`);
    const short = data[0];
    const ts0 = short.timeSeries[0];
    const area = ts0.areas[0];
    const text = {};
    ts0.timeDefines.forEach((t, i) => { text[t.slice(0, 10)] = (area.weathers?.[i] || '').replace(/　+/g, ' ').trim(); });
    const pops = {};
    const ts1 = short.timeSeries[1];
    const a1 = ts1?.areas?.[0];
    if (a1) ts1.timeDefines.forEach((t, i) => { pops[t] = a1.pops[i]; });
    return { office: short.publishingOffice, area: area.area.name, text, pops };
  }

  /* ---------------------------------------------------------
   * 星空指数（雲量・降水・湿度から独自に計算）
   * --------------------------------------------------------- */
  function hourIndex(w) {
    if (!w || w.cc == null) return null;
    let eff = w.cc;
    if (w.low != null && w.mid != null && w.high != null) {
      // 上層の薄い雲は明るい星なら透けて見えるので、少し軽く数える
      const layered = 100 * (1 - (1 - w.low / 100) * (1 - (0.9 * w.mid) / 100) * (1 - (0.55 * w.high) / 100));
      eff = Math.min(eff, layered);
    }
    let idx = 100 - eff;
    if (w.precip >= 0.5) idx = Math.min(idx, 5);
    else if (w.precip >= 0.1) idx = Math.min(idx, 20);
    if (w.rh != null && w.rh >= 97) idx -= 10; // 霧・もや
    return Math.round(clamp(idx, 0, 100));
  }
  const levelOf = (idx) => (idx == null ? 0 : idx >= 80 ? 5 : idx >= 60 ? 4 : idx >= 40 ? 3 : idx >= 20 ? 2 : 1);
  const LEVELS = {
    0: { label: 'データなし', short: '—', stars: '' },
    5: { label: '満天の星', short: '満天', stars: '★★★★★' },
    4: { label: 'よく見える', short: 'よく見える', stars: '★★★★☆' },
    3: { label: '雲の合間に見える', short: '雲の合間', stars: '★★★☆☆' },
    2: { label: '見えにくい', short: '見えにくい', stars: '★★☆☆☆' },
    1: { label: '見えない', short: '見えない', stars: '★☆☆☆☆' },
  };
  const lvColor = (lv) => (lv ? `var(--lv${lv})` : 'var(--lv1)');

  function bodyHorizon(body, date, obs) {
    const eq = A.Equator(body, date, obs, true, true);
    return A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  }

  function summarizeNight(dateStr, hourMap, obs) {
    const hours = [];
    for (let h = 18; h <= 29; h++) {
      const t = atJst(dateStr, h * 60);
      const w = hourMap ? hourMap.get(hourKey(t)) : null;
      const idx = hourIndex(w);
      const sunAlt = bodyHorizon('Sun', t, obs).altitude;
      hours.push({ t, h: h % 24, w, idx, lv: levelOf(idx), dark: sunAlt < -6, morning: h >= 24 });
    }
    let use = hours.filter((x) => x.dark && x.idx != null);
    if (!use.length) use = hours.filter((x) => x.idx != null);
    const has = use.length > 0;
    const avg = has ? Math.round(use.reduce((s, x) => s + x.idx, 0) / use.length) : null;
    // 狙い目の時間は、もう過ぎた時間を除いて選ぶ
    const cutoff = Date.now() - 30 * 60000;
    const future = use.filter((x) => x.t.getTime() >= cutoff);
    let best = null;
    for (const x of future.length ? future : use) if (!best || x.idx > best.idx) best = x;
    const temps = use.map((x) => x.w.temp).filter((v) => v != null);
    const rainHours = use.filter((x) => x.w.precip >= 0.1).length;
    return {
      date: dateStr, hours, idx: avg, lv: levelOf(avg), best, hasData: has,
      avgCloud: has ? Math.round(use.reduce((s, x) => s + x.w.cc, 0) / use.length) : null,
      tmin: temps.length ? Math.round(Math.min(...temps)) : null,
      rain: has && rainHours >= Math.max(2, use.length / 3),
    };
  }

  /* ---------------------------------------------------------
   * 天体計算
   * --------------------------------------------------------- */
  const MOON_NAMES = [
    [0.8, '新月'], [2.0, '繊月'], [3.5, '三日月'], [6.2, '夕月'], [8.6, '上弦の月'], [10.6, '十日夜の月'],
    [12.6, '十三夜月'], [13.8, '小望月'], [15.3, '満月'], [16.3, '十六夜'], [17.3, '立待月'], [18.3, '居待月'],
    [19.3, '寝待月'], [20.6, '更待月'], [23.6, '下弦の月'], [27.0, '有明月'], [28.9, '晦日月'], [30, '新月'],
  ];
  const moonName = (age) => (MOON_NAMES.find(([lim]) => age < lim) || MOON_NAMES[0])[1];

  function nightSky(dateStr, obs) {
    const noon = atJst(dateStr, 12 * 60);
    const T = (x) => (x ? x.date : null);
    const sunset = T(A.SearchRiseSet('Sun', obs, -1, noon, 1));
    const sunrise = T(A.SearchRiseSet('Sun', obs, +1, sunset || noon, 1));
    const dusk = T(A.SearchAltitude('Sun', obs, -1, noon, 1, -6)) || atJst(dateStr, 18 * 60 + 30);
    const dawn = T(A.SearchAltitude('Sun', obs, +1, dusk, 1, -6)) || atJst(dateStr, 29 * 60);
    const astroDusk = T(A.SearchAltitude('Sun', obs, -1, noon, 1, -18));
    const astroDawn = T(A.SearchAltitude('Sun', obs, +1, astroDusk || dusk, 1, -18));
    const at21 = atJst(dateStr, 21 * 60);

    const phase = A.MoonPhase(at21);
    const moon = {
      phase,
      age: (phase / 360) * 29.530589,
      illum: A.Illumination('Moon', at21).phase_fraction,
      rise: T(A.SearchRiseSet('Moon', obs, +1, noon, 1)),
      set: T(A.SearchRiseSet('Moon', obs, -1, noon, 1)),
      upAtDusk: bodyHorizon('Moon', dusk, obs).altitude > 0,
    };
    moon.name = moonName(moon.age);
    let up = 0;
    let n = 0;
    for (let m = dusk.getTime(); m <= dawn.getTime(); m += 30 * 60000) {
      n++;
      if (bodyHorizon('Moon', new Date(m), obs).altitude > 0) up++;
    }
    moon.upFrac = n ? up / n : 0;

    const planets = PLANETS.map((p) => planetNight(p, dusk, dawn, at21, obs));
    return { date: dateStr, sunset, sunrise, dusk, dawn, astroDusk, astroDawn, moon, planets };
  }

  function planetNight(p, dusk, dawn, at21, obs) {
    const samples = [];
    for (let m = dusk.getTime(); m <= dawn.getTime(); m += 10 * 60000) {
      const d = new Date(m);
      const h = bodyHorizon(p.body, d, obs);
      samples.push({ t: d, alt: h.altitude, az: h.azimuth });
    }
    const vis = samples.filter((s) => s.alt > 5);
    const eqJ2000 = A.Equator(p.body, at21, obs, false, true);
    const con = A.Constellation(eqJ2000.ra, eqJ2000.dec);
    const info = { ...p, mag: A.Illumination(p.body, at21).mag, constellation: window.CONSTELLATION_JA[con.symbol] || `${con.name}座`, visible: vis.length > 0 };
    if (!info.visible) return info;
    const best = vis.reduce((a, b) => (b.alt > a.alt ? b : a));
    const start = vis[0].t;
    const end = vis[vis.length - 1].t;
    const fromDusk = start - dusk < 20 * 60000;
    const toDawn = dawn - end < 20 * 60000;
    const startH = jstParts(start).h;
    const lateRise = startH >= 18 || startH < 2; // 夜中の2時より前に昇る
    info.period = fromDusk && toDawn ? '一晩中' : fromDusk ? '宵の空' : toDawn ? (lateRise ? '夜半〜明け方' : '明け方の空') : '夜半';
    Object.assign(info, { start, end, best, bestDir: dirName(best.az) });
    return info;
  }

  function constellationsAt(date, obs) {
    const res = [];
    for (const c of window.CONSTELLATIONS) {
      const keys = [...new Set(c.lines.flat())];
      const pos = keys.map((k) => {
        const s = window.STARS[k];
        return A.Horizon(date, obs, s[0], s[1], 'normal');
      });
      const avgAlt = pos.reduce((s, p) => s + p.altitude, 0) / pos.length;
      const upCount = pos.filter((p) => p.altitude > 5).length;
      if (avgAlt < 15 || upCount < pos.length / 2) continue;
      const sx = pos.reduce((s, p) => s + Math.sin((p.azimuth * Math.PI) / 180), 0);
      const cx = pos.reduce((s, p) => s + Math.cos((p.azimuth * Math.PI) / 180), 0);
      const az = (Math.atan2(sx, cx) * 180) / Math.PI;
      res.push({ ...c, alt: avgAlt, az, dir: dirName(az), size: keys.length });
    }
    return res.sort((a, b) => b.alt - a.alt);
  }
  const posText = (alt, dir) => (alt > 72 ? '頭の真上あたり' : `${dir}の空・高さ${Math.round(alt)}°`);

  function upcomingShowers(fromDate, days) {
    const list = [];
    const y = Number(fromDate.slice(0, 4));
    for (const yy of [y, y + 1]) {
      for (const s of window.METEOR_SHOWERS) {
        const date = `${yy}-${pad(s.month)}-${pad(s.day)}`;
        const diff = dayDiff(fromDate, date);
        if (diff >= -1 && diff <= days) list.push({ ...s, date, diff });
      }
    }
    return list.sort((a, b) => a.diff - b.diff);
  }

  /* ---------------------------------------------------------
   * 月の満ち欠けの絵
   * --------------------------------------------------------- */
  function moonPath(phaseDeg, r) {
    const ph = ((phaseDeg % 360) + 360) % 360;
    const c = Math.cos((ph * Math.PI) / 180);
    const k = (1 - c) / 2;
    const rx = Math.abs(c) * r;
    const waxing = ph < 180;
    const limb = waxing ? 1 : 0;
    const term = waxing ? (k < 0.5 ? 0 : 1) : (k < 0.5 ? 1 : 0);
    return `M0,${-r} A${r},${r} 0 0 ${limb} 0,${r} A${rx.toFixed(2)},${r} 0 0 ${term} 0,${-r} Z`;
  }
  function moonSVG(phaseDeg, r = 40) {
    const v = r + 3;
    return `<svg viewBox="${-v} ${-v} ${2 * v} ${2 * v}" aria-hidden="true"><circle r="${r}" fill="#262c4f"/><path d="${moonPath(phaseDeg, r)}" fill="#fff3c4"/></svg>`;
  }

  /* ---------------------------------------------------------
   * 立ち絵
   * --------------------------------------------------------- */
  const PLACEHOLDER = {
    renko: `<svg viewBox="0 0 120 160" aria-hidden="true">
      <path d="M14 160 C18 128 38 118 60 118 C82 118 102 128 106 160 Z" fill="#f4f4f8"/>
      <path d="M57 124 L63 124 L66 148 L60 155 L54 148 Z" fill="#d9374a"/>
      <rect x="53" y="102" width="14" height="18" fill="#f6d5c3"/>
      <path d="M27 74 C25 100 30 116 40 118 L80 118 C90 116 95 100 93 74 Z" fill="#3b2a27"/>
      <ellipse cx="60" cy="80" rx="28" ry="30" fill="#fde3d3"/>
      <path d="M31 76 C34 58 48 52 60 52 C72 52 86 58 89 76 C82 68 74 66 68 72 C64 65 56 65 52 72 C46 66 38 68 31 76 Z" fill="#3b2a27"/>
      <ellipse cx="49" cy="86" rx="3.6" ry="5" fill="#5a2e2a"/><ellipse cx="71" cy="86" rx="3.6" ry="5" fill="#5a2e2a"/>
      <circle cx="50.2" cy="84.2" r="1.3" fill="#fff"/><circle cx="72.2" cy="84.2" r="1.3" fill="#fff"/>
      <path d="M55 99 Q60 103 65 99" stroke="#c0645c" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="60" cy="56" rx="50" ry="10" fill="#15151c"/>
      <path d="M35 56 C35 32 43 21 60 21 C77 21 85 32 85 56 Z" fill="#1f1f29"/>
      <rect x="35" y="44" width="50" height="8" fill="#f4f4f8"/>
      <path d="M80 48 l11 -8 l1 13 Z" fill="#f4f4f8"/>
    </svg>`,
    maribel: `<svg viewBox="0 0 120 160" aria-hidden="true">
      <path d="M24 70 C19 110 21 140 30 152 L46 152 L46 110 L74 110 L74 152 L90 152 C99 140 101 110 96 70 Z" fill="#f2d47e"/>
      <path d="M14 160 C18 128 38 118 60 118 C82 118 102 128 106 160 Z" fill="#7d58d1"/>
      <path d="M47 119 C52 128 68 128 73 119 Z" fill="#f4f0ff"/>
      <rect x="53" y="102" width="14" height="18" fill="#f6d5c3"/>
      <ellipse cx="60" cy="80" rx="28" ry="30" fill="#fde3d3"/>
      <path d="M31 78 C32 58 46 50 60 50 C74 50 88 58 89 78 C84 70 76 68 70 74 C66 66 54 66 50 74 C44 68 36 70 31 78 Z" fill="#f2d47e"/>
      <ellipse cx="49" cy="87" rx="3.6" ry="5" fill="#6b4bb8"/><ellipse cx="71" cy="87" rx="3.6" ry="5" fill="#6b4bb8"/>
      <circle cx="50.2" cy="85.2" r="1.3" fill="#fff"/><circle cx="72.2" cy="85.2" r="1.3" fill="#fff"/>
      <path d="M55 100 Q60 104 65 100" stroke="#c0645c" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M20 60 C14 38 36 22 60 22 C84 22 106 38 100 60 C90 54 78 52 60 52 C42 52 30 54 20 60 Z" fill="#fbfbff"/>
      <path d="M20 60 q5 5 10 0 q5 5 10 -1 q5 5 10 -1 q5 5 10 0 q5 5 10 0 q5 5 10 1 q5 5 10 1 q5 5 10 1" stroke="#e3dff2" stroke-width="3" fill="none"/>
      <path d="M58 50 l-11 -7 l0 13 Z M62 50 l11 -7 l0 13 Z" fill="#d9374a"/><circle cx="60" cy="50" r="3.2" fill="#d9374a"/>
    </svg>`,
  };
  const imgProbe = {};
  function probe(url) {
    if (!(url in imgProbe)) {
      imgProbe[url] = new Promise((res) => {
        const im = new Image();
        im.onload = () => res(true);
        im.onerror = () => res(false);
        im.src = url;
      });
    }
    return imgProbe[url];
  }
  const portraitSeq = {};
  async function setPortrait(char, expr) {
    const fig = document.querySelector(`.portrait[data-char="${char}"]`);
    const cfg = (window.CHARACTER_IMAGES || {})[char] || {};
    const crop = (window.PORTRAIT_CROP || {})[char] || {};
    const seq = (portraitSeq[char] = (portraitSeq[char] || 0) + 1);
    for (const url of [cfg[expr], cfg.normal].filter(Boolean)) {
      const ok = await probe(url);
      if (seq !== portraitSeq[char]) return; // あとから別の表情が指定された
      if (ok) {
        if (fig.dataset.src !== url) {
          fig.innerHTML = `<img src="${esc(url)}" alt="">`;
          fig.dataset.src = url;
        }
        fig.style.setProperty('--crop-zoom', crop.zoom ?? 1);
        fig.style.setProperty('--crop-y', crop.y ?? '0%');
        return;
      }
    }
    if (fig.dataset.src !== 'placeholder') {
      fig.innerHTML = PLACEHOLDER[char];
      fig.dataset.src = 'placeholder';
    }
  }

  /* ---------------------------------------------------------
   * セリフ（タイプライター表示）
   * --------------------------------------------------------- */
  const talkTokens = {};
  function speak(who, parts) {
    const bubble = $(`${who}-bubble`);
    const fig = document.querySelector(`.portrait[data-char="${who === 'renko' ? 'renko' : 'maribel'}"]`);
    const speaker = who === 'renko' ? '宇佐見蓮子' : 'マエリベリー・ハーン';
    const token = Symbol(who);
    talkTokens[who] = token;
    bubble.innerHTML = `<span class="speaker">${speaker}</span>`;
    const ps = parts.map((p) => {
      const el = document.createElement('p');
      if (p.cls) el.className = p.cls;
      bubble.appendChild(el);
      return el;
    });
    const char = who === 'renko' ? 'renko' : 'maribel';
    if (REDUCE_MOTION) {
      parts.forEach((p, i) => { ps[i].textContent = p.text; });
      const last = [...parts].reverse().find((p) => p.expr);
      if (last) setPortrait(char, last.expr);
      return;
    }
    fig.classList.add('speaking');
    const caret = document.createElement('span');
    caret.className = 'caret';
    (async () => {
      for (let i = 0; i < parts.length; i++) {
        if (talkTokens[who] !== token) return;
        if (parts[i].expr) setPortrait(char, parts[i].expr); // セリフの区切りで表情を変える
        const txt = parts[i].text;
        for (let j = 1; j <= txt.length; j++) {
          if (talkTokens[who] !== token) return;
          ps[i].textContent = txt.slice(0, j);
          ps[i].appendChild(caret);
          await sleep(parts[i].speed || 30);
        }
        await sleep(parts[i].pause ?? 220);
      }
      if (talkTokens[who] === token) {
        caret.remove();
        fig.classList.remove('speaking');
      }
    })();
  }
  function showWaiting(who, text, expr) {
    talkTokens[who] = Symbol('wait');
    if (expr) setPortrait(who === 'renko' ? 'renko' : 'maribel', expr);
    const speaker = who === 'renko' ? '宇佐見蓮子' : 'マエリベリー・ハーン';
    $(`${who}-bubble`).innerHTML = `<span class="speaker">${speaker}</span><p class="lead">${esc(text)}<span class="caret"></span></p>`;
  }

  // 画面に入ったときにしゃべり始める
  const pendingTalk = new Map();
  const talkObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const who = e.target.id.replace('-bubble', '');
        const parts = pendingTalk.get(who);
        if (parts) { pendingTalk.delete(who); speak(who, parts); }
        e.target.dataset.seen = '1';
      }
    }, { threshold: 0.4 })
    : null;
  function speakWhenVisible(who, parts) {
    const el = $(`${who}-bubble`);
    if (!talkObserver || el.dataset.seen) { speak(who, parts); return; }
    pendingTalk.set(who, parts);
    showWaiting(who, parts[0].text, parts[0].expr);
    talkObserver.observe(el);
  }

  function renkoScript(sum, sky, offset) {
    const when = whenWord(offset, sum.date);
    const lead = { text: `${when}の星空は……`, cls: 'lead', speed: 70, pause: 700, expr: 'think' };
    if (state.weatherStatus === 'error') {
      return { expr: 'error', parts: [lead,
        { expr: 'error', text: '……あれ、天気のデータが来ない。結界の向こうで回線でも切れたのかしら。' },
        { text: '星と月の位置なら、メリーのほうで見られるはずよ。' }] };
    }
    if (!sum.hasData) {
      return { expr: 'normal', parts: [lead, { expr: 'normal', text: '……そこまで先の雲は、さすがにまだ読めないわ。近くなったらまた聞いて。' }] };
    }
    const best = sum.best ? hourWord(sum.best.h) : '';
    let expr = 'normal';
    let verdict;
    if (sum.rain) {
      verdict = '……雨。星が出ないと、私の目もただの目よ。';
      expr = 'rain';
    } else if (sum.lv === 5) {
      verdict = `……快晴。雲ひとつないわ。狙い目は${best}ごろ。`
        + (offset === 0 ? 'メリー、今夜は寝かせないわよ。' : '月面ツアーは高過ぎるけど、こっちは自販機のコーヒー代で済むわ。');
      expr = 'great';
    } else if (sum.lv === 4) {
      verdict = `……まあまあね。ときどき雲が流れるけど、${best}ごろは開けてるはず。`;
      expr = 'good';
    } else if (sum.lv === 3) {
      verdict = `……半々ね。雲と星が。${best}ごろの晴れ間に賭けるしかないわ。`;
    } else if (sum.lv === 2) {
      verdict = `……雲が多いわね。${best}ごろに少し切れるかもしれない、くらい。`;
      expr = 'cloudy';
    } else {
      verdict = '……曇り。星が見えないと、私の時計は止まったままよ。';
      expr = 'cloudy';
    }
    const parts = [lead, { expr, text: verdict }];

    // 狙い目の時刻を、その土地の「本当の時刻」に直すのが蓮子のくせ（日本標準時は明石＝東経135度が基準）
    if (sum.best && !sum.rain && sum.lv >= 2) {
      const diffMin = Math.round((state.loc.lon - 135) * 4);
      if (Math.abs(diffMin) >= 2) {
        const real = jstParts(new Date(sum.best.t.getTime() - diffMin * 60000));
        const place = state.loc.id === 'here' ? 'ここ' : state.loc.name;
        parts.push({ text: `厳密には、${place}の本当の${sum.best.h}時は${real.h}時${pad(real.mi)}分。明石より${diffMin > 0 ? '東' : '西'}だから。……まあ、私の目が読めるのは日本標準時だけで、それ以外は能力外なんだけど。` });
      }
    }

    // 月明かり・気象庁の予報・寒さの話を、話題ごとに段落を分けて続ける
    const m = sky.moon;
    if (sum.lv >= 3 && !sum.rain) {
      const setInNight = m.set && m.set > sky.dusk && m.set < sky.dawn;
      const riseInNight = m.rise && m.rise > sky.dusk && m.rise < sky.dawn;
      let ml = '';
      if (m.illum >= 0.75 && m.upFrac > 0.4) ml = 'ただ、月が明るいから暗い星は諦めて。';
      else if (m.upFrac < 0.15 || m.illum < 0.15) ml = '月も出てないから、暗い星まで拾えるはずよ。';
      else if (setInNight && m.illum > 0.3) ml = `月が${fmtHM(m.set, sum.date)}に沈むまでは我慢ね。`;
      else if (riseInNight && m.illum > 0.3) ml = `${fmtHM(m.rise, sum.date)}に月が昇ってくるから、それまでが勝負。`;
      if (ml) parts.push({ text: ml });
    }
    const jmaText = state.jma?.text?.[sum.date];
    if (jmaText) parts.push({ text: `気象庁は「${jmaText}」だって。` });
    if (sum.tmin != null && !sum.rain && sum.lv >= 2) {
      if (sum.tmin <= 3) parts.push({ text: `${sum.tmin}℃まで下がるわよ。着込んできて。` });
      else if (sum.tmin <= 10) parts.push({ text: `${sum.tmin}℃くらい。上着は要るわね。` });
    }
    return { expr, parts };
  }

  function maryScript(sum, sky, offset) {
    const when = whenWord(offset, sky.date);
    const parts = [{ text: `蓮子、${when}はこんな星が見れるはずよ！`, cls: 'lead', speed: 45, pause: 400, expr: 'happy' }];
    const PLANET_NOTE = {
      土星: '輪っかは肉眼じゃ見えないけどね。',
      木星: '明るいから、すぐわかるわ。',
      金星: '眩しいくらいよ。',
      火星: '赤っぽいから、すぐわかるわ。',
      水星: '低いから、見えたら運がいいほう。',
    };

    // 惑星 → 月 → 星座 → 流星群 → （曇りなら）ひとこと、の順に話す
    const vis = sky.planets.filter((p) => p.visible).sort((a, b) => a.mag - b.mag);
    const evening = vis.filter((p) => p.period === '宵の空' || p.period === '一晩中');
    const late = vis.filter((p) => p.period === '夜半' || p.period === '夜半〜明け方');
    const morning = vis.filter((p) => p.period === '明け方の空');
    if (evening.length) {
      const p = evening[0];
      let s = p.period === '宵の空'
        ? `日が暮れたら${p.bestDir}の空に${p.name}。${PLANET_NOTE[p.name] || ''}`
        : `${p.name}は一晩中出てるわ。${fmtHM(p.best.t, sky.date)}ごろ、${p.bestDir}の空でいちばん高くなる。`;
      const others = evening.slice(1).map((x) => x.name);
      if (others.length) s += `${others.join('と')}もいるわよ。`;
      parts.push({ text: s });
    }
    if (late.length) {
      const names = late.map((p) => p.name).join('と');
      const start = fmtHM(late[0].start, sky.date);
      parts.push({ text: evening.length ? `夜が更けたら${names}も昇ってくる。${start}ごろから。` : `${start}ごろになると、${names}が昇ってくるわ。` });
    }
    if (morning.length) {
      const names = morning.map((p) => p.name).join('と');
      parts.push({ text: evening.length || late.length
        ? `明け方には${names}。早起きできたらの話だけど。`
        : `惑星なら明け方ね。${morning[0].bestDir}の空に${names}。早起きできたらの話だけど。` });
    }

    const m = sky.moon;
    const setInNight = m.set && m.set > sky.dusk && m.set < sky.dawn;
    const riseInNight = m.rise && m.rise > sky.dusk && m.rise < sky.dawn;
    let ms = `月は${m.name}。`;
    if (m.upFrac < 0.05) ms += '夜は沈んでるから、邪魔はされないわ。';
    else if (m.upFrac > 0.9) ms += '一晩中出てるわ。';
    else if (m.upAtDusk && setInNight) ms += `${fmtHM(m.set, sky.date)}に沈む。`;
    else if (riseInNight) ms += `${fmtHM(m.rise, sky.date)}に昇ってくる。`;
    if (m.illum > 0.9) ms += '……池に映った月なら、向こう側も見えるんだけど。今のは聞かなかったことにして。';
    parts.push({ text: ms });

    const c = constellationsAt(atJst(sky.date, 21 * 60), state.obs).find((x) => x.size >= 3 && x.name !== 'こぐま座');
    if (c) parts.push({ text: `21時ごろは${c.name}が${c.alt > 72 ? '頭の真上' : `${c.dir}の空`}。${c.tip}` });

    let expr = 'happy';
    const shower = upcomingShowers(sky.date, 10)[0];
    if (shower && (shower.diff === 0 || shower.diff === 1)) {
      parts.push({ expr: 'excited', text: `しかも${shower.name}の極大の夜よ。` });
      expr = 'excited';
    } else if (shower && shower.diff > 1) {
      parts.push({ text: `${dateInfo(shower.date).md}は${shower.name}の極大。忘れないでね。` });
    }

    if (state.weatherStatus === 'ok' && sum.hasData && (sum.rain || sum.lv <= 2)) {
      parts.push({ expr: 'gentle', text: '雲で見えなくても、星はそこにあるわよ。……私には、ちょっと見えちゃってるけど。' });
      expr = 'gentle';
    }
    return { expr, parts };
  }

  /* ---------------------------------------------------------
   * 部室の雑談（二人の掛け合い）
   *  その夜の天気・月・流星群・時刻に合う話題を選んで、1行ずつ表示する
   * --------------------------------------------------------- */
  function chatTopics(sum, sky, offset) {
    const when = whenWord(offset, sum.date);
    const hasW = state.weatherStatus === 'ok' && sum.hasData;
    const m = sky.moon;
    const R = (expr, text) => ['renko', expr, text];
    const M = (expr, text) => ['maribel', expr, text];
    const topics = [];
    const add = (title, lines) => topics.push({ title, lines });

    // 天気しだいの話題を先頭に
    if (hasW && sum.rain) {
      add('雨の日の部室', [
        R('cry', '……雨。うちは不良サークルだから、雨の日は活動休止ね'),
        M('jitome', '晴れの日も、大した活動はしてないじゃない'),
        R('smile', '失礼ね。毎晩ちゃんと時刻は確認してるわ'),
        M('smile', 'それ、活動なの？'),
      ]);
    } else if (hasW && sum.lv <= 2 && sum.best) {
      add('雲待ち', [
        M('smile', '曇りなのに、なんでずっと空を見てるの？'),
        R('jitome', `雲の切れ目待ち。${hourWord(sum.best.h)}ごろに一瞬だけ開くはずなのよ`),
        M('jitome', 'その一瞬のために、この寒い中？'),
        R('smile', '理系はみんなこうよ'),
      ]);
    } else if (hasW && sum.lv >= 4) {
      add(offset === 0 ? '晴れた夜' : '晴れの前の晩', [
        M('smile', '空の仕掛けが全部わかっちゃうと、そのうち虚無主義になりそうね'),
        R('jitome', offset === 0
          ? '誰が虚無主義よ。今夜が楽しみすぎて、昼間ぐっすり寝ちゃったくらいなんだから'
          : `誰が虚無主義よ。${when}の晴れ間が楽しみで、今夜はぐっすり眠れそうなくらいなんだから`),
        M('jitome', '……それ、楽しみにしてる人の台詞？'),
      ]);
    }

    const shower = upcomingShowers(sum.date, 10)[0];
    if (shower && shower.diff <= 1) {
      add('流れ星の数', [
        R('laugh', `${when}は流れ星が1時間に${shower.zhr}個見えるわよ`),
        M('jitome', 'また嘘でしょ'),
        R('smile', `今回は本当。${shower.name}の極大だもの`),
        R('eyes_closed', '……条件が理想的なら、だけど'),
        M('smile', 'やっぱり半分嘘じゃない'),
      ]);
    } else {
      add('流れ星の数', [
        R('laugh', `${when}は流れ星が1時間に100個見えるわよ`),
        M('surprise', '本当？'),
        R('smile', '嘘。でも、せっかくだし数えに行く？'),
        M('jitome', '……行くけど'),
      ]);
    }

    if (hasW && !sum.rain && sum.tmin != null && sum.tmin <= 5) {
      add('夜の寒さ', [
        M('jitome', `${sum.tmin}℃ですって`),
        R('smile', '宇宙はマイナス270℃よ。それに比べたら'),
        M('jitome', '比べる相手がおかしいのよ'),
      ]);
    }

    const skyHidden = hasW && (sum.rain || sum.lv <= 1); // 雨や曇りの夜に月明かりの話はしない
    if (!skyHidden && m.illum >= 0.75 && m.upFrac > 0.4) {
      add('明るすぎる月', [
        R('jitome', '月が明るすぎるわ。暗い星は全滅ね'),
        M('eyes_closed', '私には、月の向こう側のほうがよく見えるけど'),
        R('smile', 'それ、星空観察って言わないのよ'),
      ]);
    }

    const jmaText = state.jma?.text?.[sum.date];
    if (jmaText) {
      add('予報の当て合い', [
        R('smile', `気象庁は「${jmaText}」だって`),
        M('smile', '蓮子の目と気象庁、どっちが当たるの？'),
        R('laugh', '星が出てるうちは私'),
        M('smile', '出てないときは？'),
        R('eyes_closed', '……神頼みね'),
      ]);
    }

    const ev = sky.planets.filter((p) => p.visible && (p.period === '宵の空' || p.period === '一晩中')).sort((a, b) => a.mag - b.mag)[0];
    if (ev) {
      add('惑星を見に', [
        M('smile', `${ev.name}って、肉眼で見えるのかしら`),
        R('smile', `見えるわよ。${ev.mag.toFixed(1)}等だもの。ただの明るい点だけど`),
        M('jitome', 'ただの点を見に、わざわざ夜中に出かけるのね、私たち'),
        R('laugh', '点でも本物よ。プラネタリウムの星は照明だもの'),
      ]);
    }

    if (sky.planets.some((p) => p.body === 'Venus' && p.visible && p.period === '明け方の空')) {
      add('明けの明星', [
        M('smile', '明け方には金星がよく見えるわよ'),
        R('smile', '明け方ね。起きられたら見るわ'),
        M('jitome', '待ち合わせにも毎回遅れてくる人が、よく言うわ'),
        R('panic', '2分くらいでしょ'),
        M('smile', '2分19秒'),
      ]);
    }

    // 時刻は表示した瞬間の本物の時刻。夜は星で、昼は……
    add('星の時計', () => {
      const now = new Date();
      const p = jstParts(now);
      const night = bodyHorizon('Sun', now, state.obs).altitude < -6;
      return night
        ? [
          R('eyes_closed', `（空を見上げて）${p.h}時${pad(p.mi)}分${pad(p.s)}秒`),
          M('jitome', '……毎回思うけど、その目、気持ち悪いわよ'),
          R('smile', 'メリーにだけは言われたくない'),
        ]
        : [
          R('smile', 'メリー、今何時？'),
          M('jitome', '自分の目で見ればいいじゃない'),
          R('jitome', '昼間は星が出てないのよ'),
          M('smile', `${p.h}時${pad(p.mi)}分。……スマホで見たけど`),
        ];
    });

    add('250万年前の光', [
      M('smile', 'アンドロメダ銀河の光って、250万年前のものなのよ'),
      R('smile', '京都の人が好きそうね。古いから'),
      M('jitome', 'それ、京都の人の前で言わないでね'),
    ]);

    add('いつかの月', [
      M('eyes_closed', 'いつか、本物の月の上から星を見てみたいわね'),
      R('smile', 'まずはバイトね'),
      M('jitome', '……夢の話をしてたんだけど'),
    ]);
    return topics;
  }

  const chat = { topics: [], idx: 0, token: null, seen: false, pending: false };

  function chatLineEl(who, expr, text) {
    const div = document.createElement('div');
    div.className = `chat-line ${who === 'renko' ? 'renko' : 'mary'}`;
    const name = who === 'renko' ? '蓮子' : 'メリー';
    div.innerHTML = `<span class="chat-face"><img src="img/face/${who}-${expr}.png" alt=""></span><p class="chat-msg"><span class="chat-name">${name}</span>${esc(text)}</p>`;
    const img = div.querySelector('img');
    img.addEventListener('error', () => { if (!img.src.endsWith('-smile.png')) img.src = `img/face/${who}-smile.png`; }, { once: true });
    return div;
  }

  function playChat() {
    const t = chat.topics[chat.idx];
    if (!t) return;
    const token = Symbol('chat');
    chat.token = token;
    $('chat-topic').textContent = `話題：${t.title}`;
    $('chat-count').textContent = `${chat.idx + 1} / ${chat.topics.length}`;
    const log = $('chat-log');
    log.innerHTML = '';
    const lines = typeof t.lines === 'function' ? t.lines() : t.lines;
    (async () => {
      for (let i = 0; i < lines.length; i++) {
        if (i > 0 && !REDUCE_MOTION) await sleep(Math.min(2600, 700 + lines[i - 1][2].length * 45)); // 前の台詞を読む時間
        if (chat.token !== token) return;
        log.appendChild(chatLineEl(...lines[i]));
      }
    })();
  }

  function startChat() {
    chat.topics = chatTopics(state.summaries[state.offset], state.skies[state.offset], state.offset);
    chat.idx = 0;
    if (chat.seen) playChat();
    else chat.pending = true; // 画面に入ったら始める
  }
  function showChatWaiting() {
    chat.token = Symbol('wait');
    $('chat-topic').textContent = '';
    $('chat-count').textContent = '';
    $('chat-log').innerHTML = '<p class="loading">二人が部室に来るのを待っています…</p>';
  }

  /* ---------------------------------------------------------
   * 描画：蓮子の星空予報
   * --------------------------------------------------------- */
  function renderTabs() {
    // タブは「今夜」「明日の夜」だけ。ほかの日は「1週間」から選ぶと3つ目のタブとして出る
    const box = $('night-tabs');
    box.innerHTML = '';
    const shown = state.offset >= 2 ? [0, 1, state.offset] : [0, 1];
    for (const i of shown) {
      const date = addDays(state.base, i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === state.offset));
      b.textContent = tabLabel(i, date);
      b.addEventListener('click', () => setOffset(i));
      box.appendChild(b);
    }
  }

  function renderForecast() {
    const sum = state.summaries[state.offset];
    const sky = state.skies[state.offset];
    const info = dateInfo(sum.date);
    $('index-date').textContent = `${info.md}（${info.wd}）の夜 ・ ${state.loc.name}`;

    const ring = $('index-ring');
    const facts = $('index-facts');
    if (state.weatherStatus === 'loading') {
      $('index-num').textContent = '--';
      $('index-label').textContent = '雲の様子を調べています…';
      $('index-stars').textContent = '';
      ring.style.setProperty('--val', 0);
      facts.innerHTML = '';
      $('hourly').innerHTML = '<p class="loading">読み込み中…</p>';
    } else if (state.weatherStatus === 'error' || !sum.hasData) {
      $('index-num').textContent = '--';
      $('index-label').textContent = state.weatherStatus === 'error' ? '天気データを取得できませんでした' : 'まだ予報がありません';
      $('index-stars').textContent = '';
      ring.style.setProperty('--val', 0);
      facts.innerHTML = `<dt>月</dt><dd>${esc(sky.moon.name)}</dd>`;
      $('hourly').innerHTML = `<p class="${state.weatherStatus === 'error' ? 'error-note' : 'empty'}">${state.weatherStatus === 'error' ? '通信に失敗しました。時間をおいて再読み込みしてください。' : 'この日の時間別予報はまだありません。'}</p>`;
    } else {
      const L = LEVELS[sum.lv];
      $('index-num').textContent = sum.idx;
      $('index-label').textContent = L.label;
      $('index-stars').textContent = L.stars;
      ring.style.setProperty('--val', sum.idx);
      ring.style.setProperty('--col', lvColor(sum.lv));
      const m = sky.moon;
      const moonLight = m.upFrac < 0.1 || m.illum < 0.15 ? 'なし' : m.illum >= 0.75 ? '明るい' : m.illum >= 0.4 ? 'ふつう' : '弱い';
      facts.innerHTML = `
        <dt>狙い目</dt><dd>${sum.best.morning ? '翌' : ''}${sum.best.h}時ごろ</dd>
        <dt>雲の量</dt><dd>${sum.avgCloud}%</dd>
        <dt>月明かり</dt><dd>${moonLight}</dd>`;
      renderHourly(sum);
    }
    renderJmaLine(sum.date);
  }

  function renderHourly(sum) {
    const box = $('hourly');
    box.innerHTML = sum.hours.map((x) => {
      if (x.idx == null) return `<div class="hour"><span>${x.h}時</span><div class="bar-wrap"></div><span class="val">--</span><span class="icon"></span></div>`;
      const icon = x.w.precip >= 0.1 ? '☂' : x.lv >= 4 ? '★' : x.lv === 3 ? '☆' : '☁';
      const cls = ['hour'];
      if (!x.dark) cls.push(x.morning ? 'dawn' : 'dusk');
      if (sum.best && x.t === sum.best.t) cls.push('best');
      const title = `${x.h}時 星空指数${x.idx} 雲量${x.w.cc}%${x.w.precip ? ` 降水${x.w.precip}mm` : ''}`;
      return `<div class="${cls.join(' ')}" title="${title}">
        <span>${x.h}時</span>
        <div class="bar-wrap"><div class="bar" style="height:${Math.max(4, x.idx)}%;background:${lvColor(x.lv)}"></div></div>
        <span class="val">${x.idx}</span>
        <span class="icon" aria-hidden="true">${icon}</span>
      </div>`;
    }).join('');
  }

  function renderJmaLine(date) {
    const el = $('jma-line');
    const near = state.loc.jmaNear ? `（最寄りの予報区: ${esc(state.loc.jmaNear)}）` : '';
    if (state.jmaStatus === 'loading') { el.textContent = '気象庁の予報を確認中…'; return; }
    if (state.jmaStatus === 'error' || !state.jma) { el.textContent = '気象庁の予報文は取得できませんでした。'; return; }
    const text = state.jma.text[date];
    if (!text) { el.innerHTML = `気象庁の予報文は3日先までです。${near}`; return; }
    const p1 = state.jma.pops[`${date}T18:00:00+09:00`];
    const p2 = state.jma.pops[`${addDays(date, 1)}T00:00:00+09:00`];
    const pops = [p1 != null ? `18-24時 ${esc(p1)}%` : null, p2 != null ? `0-6時 ${esc(p2)}%` : null].filter(Boolean).join(' / ');
    el.innerHTML = `気象庁 ${esc(state.jma.office)}（${esc(state.jma.area)}）${near}: <strong>${esc(text)}</strong>${pops ? `<br>降水確率 ${pops}` : ''}`;
  }

  function renderWeekly() {
    const box = $('weekly');
    box.innerHTML = '';
    state.summaries.forEach((sum, i) => {
      const info = dateInfo(sum.date);
      const lv = state.weatherStatus === 'ok' ? sum.lv : 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day';
      b.style.setProperty('--lvc', lvColor(lv));
      b.setAttribute('aria-pressed', String(i === state.offset));
      b.innerHTML = `
        <span class="d-date">${i === 0 ? '今夜' : info.md}</span>
        <span class="d-wd ${info.wdIdx === 0 ? 'sun' : info.wdIdx === 6 ? 'sat' : ''}">${info.wd}</span>
        ${moonSVG(state.skies[i].moon.phase, 40)}
        <span class="d-val">${lv ? sum.idx : '--'}</span>
        <span class="d-lbl">${LEVELS[lv].short}</span>`;
      b.addEventListener('click', () => setOffset(i));
      box.appendChild(b);
    });
  }

  function renderNation() {
    const box = $('nation');
    $('nation-when').textContent = tabLabel(state.offset, addDays(state.base, state.offset));
    if (!state.nation) { box.innerHTML = '<p class="loading">読み込み中…</p>'; return; }
    if (state.nation === 'error') { box.innerHTML = '<p class="error-note">全国のデータを取得できませんでした。</p>'; return; }
    const date = addDays(state.base, state.offset);
    box.innerHTML = '';
    window.LOCATIONS.forEach((loc, i) => {
      const obs = new A.Observer(loc.lat, loc.lon, 0);
      const sum = summarizeNight(date, state.nation[i], obs);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `city${state.loc.id === loc.id ? ' current' : ''}`;
      b.style.setProperty('--lvc', lvColor(sum.lv));
      b.innerHTML = `<span class="c-name">${esc(loc.name)}</span><span class="c-val">${sum.hasData ? sum.idx : '--'}</span><span class="c-lbl">${LEVELS[sum.lv].label}</span>`;
      b.addEventListener('click', () => selectLocation(loc.id));
      box.appendChild(b);
    });
  }

  /* ---------------------------------------------------------
   * 描画：メリーの星空案内
   * --------------------------------------------------------- */
  function renderSkyCards() {
    const sky = state.skies[state.offset];
    const m = sky.moon;
    const d = sky.date;
    const riseText = m.upAtDusk ? '夕方にはもう空に' : fmtHM(m.rise, d);
    $('moon-card').innerHTML = `
      <h3>月</h3>
      <div class="moon-wrap">
        ${moonSVG(m.phase)}
        <div>
          <p class="moon-name">${m.name}</p>
          <dl class="facts">
            <dt>月齢</dt><dd>${m.age.toFixed(1)}</dd>
            <dt>月の出</dt><dd>${riseText}</dd>
            <dt>月の入</dt><dd>${fmtHM(m.set, d)}</dd>
          </dl>
        </div>
      </div>`;
    $('sun-card').innerHTML = `
      <h3>夜の時間</h3>
      <dl class="facts">
        <dt>日の入</dt><dd>${fmtHM(sky.sunset, d)}</dd>
        <dt>星が見えはじめる</dt><dd>${fmtHM(sky.dusk, d)}</dd>
        <dt>空が白みはじめる</dt><dd>${fmtHM(sky.astroDawn, d)}</dd>
        <dt>日の出</dt><dd>${fmtHM(sky.sunrise, d)}</dd>
      </dl>`;
    renderPlanets(sky);

    const showers = upcomingShowers(state.base, 60);
    $('meteors').innerHTML = showers.length ? showers.map((s) => {
      const moonIllum = A.Illumination('Moon', atJst(s.date, 2 * 60)).phase_fraction;
      const cond = moonIllum < 0.35 ? '◎ 月明かりの影響なし' : moonIllum < 0.7 ? '○ 月明かりがやや邪魔' : '△ 月明かりが強い';
      const days = s.diff < 0 ? '<span>昨夜</span>' : s.diff === 0 ? '<span>今夜</span>' : `${s.diff}<small>日後</small>`;
      return `<div class="meteor${s.diff <= 10 ? ' soon' : ''}">
        <div class="m-days">${days}</div>
        <div><div class="m-name">${s.name}</div><div class="m-sub">${dateInfo(s.date).md} ごろ極大 ・ 放射点 ${s.radiant} ・ 1時間に最大${s.zhr}個ほど</div></div>
        <div class="m-moon">${cond}</div>
      </div>`;
    }).join('') : '<p class="empty">60日以内に大きな流星群はありません。</p>';
  }

  function chartDate() {
    return atJst(state.skies[state.offset].date, SLIDER_START_MIN + state.step * SLIDER_STEP_MIN);
  }

  function renderChartTime() {
    const sky = state.skies[state.offset];
    const date = chartDate();
    const label = fmtHM(date, sky.date);
    const info = dateInfo(sky.date);
    $('chart-when').textContent = `${info.md}（${info.wd}） ${label} の空`;
    $('const-when').textContent = `${label}ごろ`;
    renderChart(date);
    const consts = constellationsAt(date, state.obs).slice(0, 6);
    $('consts').innerHTML = consts.length ? consts.map((c) => `
      <div class="const">
        <div class="k-head"><span class="k-name">${c.name}</span><span class="k-pos">${posText(c.alt, c.dir)}</span></div>
        <p>${c.tip}</p>
      </div>`).join('') : '<p class="empty">この時刻は明るい星座が低い位置にあります。</p>';
  }

  // 見える惑星だけカードにして、見えないものは1行にまとめる
  function renderPlanets(sky) {
    const order = { 宵の空: 0, 一晩中: 1, 夜半: 2, '夜半〜明け方': 3, 明け方の空: 4 };
    const vis = sky.planets.filter((p) => p.visible).sort((a, b) => order[a.period] - order[b.period] || a.mag - b.mag);
    const off = sky.planets.filter((p) => !p.visible).map((p) => p.name);
    const cards = vis.map((p) => `<div class="planet">
        <div class="p-head"><span class="p-dot" style="background:${p.color};color:${p.color}"></span><span class="p-name">${p.name}</span><span class="p-mag">${p.mag.toFixed(1)}等・${p.constellation}</span></div>
        <p><strong>${p.period}</strong> ${fmtHM(p.start, sky.date)}〜${fmtHM(p.end, sky.date)}</p>
        <p>${fmtHM(p.best.t, sky.date)}ごろ ${p.bestDir}の空・高さ${Math.round(p.best.alt)}°</p>
      </div>`).join('');
    $('planets').innerHTML = (cards || '<p class="empty">この夜に見やすい惑星はありません。</p>')
      + (off.length ? `<p class="planet-off">この夜は見えない: ${off.join('、')}（太陽に近い位置）</p>` : '');
  }

  function renderChart(date) {
    const obs = state.obs;
    const C = 320;
    const R = 288;
    const f = (n) => n.toFixed(1);
    const proj = (alt, az) => {
      const r = (R * (90 - alt)) / 90;
      const a = (az * Math.PI) / 180;
      return [C - r * Math.sin(a), C - r * Math.cos(a)]; // 北が上・東が左（空を見上げた向き）
    };
    const pos = {};
    for (const [k, s] of Object.entries(window.STARS)) {
      const h = A.Horizon(date, obs, s[0], s[1], 'normal');
      pos[k] = { alt: h.altitude, xy: proj(h.altitude, h.azimuth), s };
    }

    let out = `<defs>
      <radialGradient id="skyg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#18235e"/><stop offset="100%" stop-color="#0a1030"/></radialGradient>
      <clipPath id="skyclip"><circle cx="${C}" cy="${C}" r="${R}"/></clipPath>
    </defs>
    <circle cx="${C}" cy="${C}" r="${R}" fill="url(#skyg)"/>`;
    for (const alt of [30, 60]) out += `<circle cx="${C}" cy="${C}" r="${f((R * (90 - alt)) / 90)}" fill="none" stroke="rgba(190,205,255,.13)" stroke-dasharray="3 6"/>`;
    out += `<path d="M${C} ${C - 5}v10M${C - 5} ${C}h10" stroke="rgba(190,205,255,.3)"/>`;

    let g = '';
    let labels = '';
    // ラベル同士が重なったら少しずらす（先に置いたものが優先）
    const placed = [];
    const place = (x0, x1, y, size) => {
      let yy = y;
      for (let i = 0; i < 4; i++) {
        const hit = placed.some((b) => x0 < b.x1 && x1 > b.x0 && yy - size < b.y && yy > b.y - b.size);
        if (!hit) break;
        yy += size + 2;
      }
      placed.push({ x0, x1, y: yy, size });
      return yy;
    };
    const sizeOf = (attrs) => Number((attrs.match(/font-size="([\d.]+)"/) || [])[1] || 11);
    // 円の右側では文字を左に出して、はみ出さないようにする
    const label = (x, y, dx, dy, text, attrs) => {
      const right = x > C + R * 0.5;
      const size = sizeOf(attrs);
      const w = text.length * size;
      const tx = right ? x - dx : x + dx;
      const ty = place(right ? tx - w : tx, right ? tx : tx + w, y + dy, size);
      return `<text x="${f(tx)}" y="${f(ty)}" text-anchor="${right ? 'end' : 'start'}" ${attrs}>${text}</text>`;
    };
    const centerLabel = (x, y, text, attrs) => {
      const size = sizeOf(attrs);
      const w = text.length * size;
      const ty = place(x - w / 2, x + w / 2, y, size);
      return `<text x="${f(x)}" y="${f(ty)}" text-anchor="middle" ${attrs}>${text}</text>`;
    };
    const asterismLabels = [];
    const constLabels = [];
    if (state.showLines) {
      for (const a of window.ASTERISMS) {
        const pts = a.stars.map((k) => pos[k]);
        if (pts.some((p) => p.alt < 0)) continue;
        g += `<polygon points="${pts.map((p) => p.xy.map(f).join(',')).join(' ')}" fill="none" stroke="rgba(255,217,102,.35)" stroke-width="1" stroke-dasharray="5 6"/>`;
        const cx = pts.reduce((s, p) => s + p.xy[0], 0) / 3;
        const cy = pts.reduce((s, p) => s + p.xy[1], 0) / 3;
        asterismLabels.push([cx, cy, a.name]);
      }
      for (const c of window.CONSTELLATIONS) {
        for (const [a, b] of c.lines) {
          if (a === b) continue;
          const p = pos[a];
          const q = pos[b];
          if (Math.max(p.alt, q.alt) < -3) continue;
          g += `<line x1="${f(p.xy[0])}" y1="${f(p.xy[1])}" x2="${f(q.xy[0])}" y2="${f(q.xy[1])}" stroke="rgba(185,155,255,.5)" stroke-width="1.1"/>`;
        }
      }
    }
    for (const c of window.CONSTELLATIONS) {
      const keys = [...new Set(c.lines.flat())];
      if (keys.length < 3) continue;
      const up = keys.map((k) => pos[k]).filter((p) => p.alt > 6);
      if (up.length < 2) continue;
      const cx = up.reduce((s, p) => s + p.xy[0], 0) / up.length;
      const cy = up.reduce((s, p) => s + p.xy[1], 0) / up.length;
      constLabels.push([cx, cy + 16, c.name.replace(/（.*）/, '')]);
    }
    // ラベルは優先度の高い順（月 → 惑星 → 明るい星 → 星団 → 星座名 → 大三角）に置く
    const deepLabels = [];
    for (const d of window.DEEP_SKY) {
      const h = A.Horizon(date, obs, d.ra, d.dec, 'normal');
      if (h.altitude < 2) continue;
      const [x, y] = proj(h.altitude, h.azimuth);
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="rgba(200,215,255,.12)" stroke="rgba(200,215,255,.5)" stroke-dasharray="2 2"/>`;
      deepLabels.push([x, y, d.name]);
    }
    const starLabels = [];
    const stars = Object.values(pos).filter((p) => p.alt > -1).sort((a, b) => b.s[2] - a.s[2]);
    for (const p of stars) {
      const [, , mag, name, color] = p.s;
      const r = clamp(3.6 - 0.72 * mag, 0.9, 5.6);
      const [x, y] = p.xy;
      if (mag < 1) g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.6)}" fill="${color || '#fff'}" opacity=".16"/>`;
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color || '#f4f6ff'}"/>`;
      if (name && p.alt > 2) starLabels.push([x, y, r + 3, name, mag]);
    }
    const planetLabels = [];
    for (const pl of PLANETS) {
      const h = bodyHorizon(pl.body, date, obs);
      if (h.altitude < -1) continue;
      const [x, y] = proj(h.altitude, h.azimuth);
      g += `<circle cx="${f(x)}" cy="${f(y)}" r="5.4" fill="${pl.color}" stroke="#fff" stroke-width=".8"/>`;
      if (h.altitude > 0) planetLabels.push([x, y, pl]);
    }
    const mh = bodyHorizon('Moon', date, obs);
    if (mh.altitude > -1) {
      const [x, y] = proj(mh.altitude, mh.azimuth);
      g += `<g transform="translate(${f(x)},${f(y)})"><circle r="13" fill="#fff3c4" opacity=".15"/><circle r="10" fill="#262c4f"/><path d="${moonPath(A.MoonPhase(date), 10)}" fill="#fff3c4"/></g>`;
      if (mh.altitude > 0) labels += label(x, y, 14, 4, '月', 'font-size="13" font-weight="700" fill="#fff3c4"');
    }
    for (const [x, y, pl] of planetLabels) labels += label(x, y, 8, -6, pl.name, `font-size="13" font-weight="700" fill="${pl.color}"`);
    starLabels.sort((a, b) => a[4] - b[4]);
    for (const [x, y, dx, name] of starLabels) labels += label(x, y, dx, 4, name, 'font-size="11" fill="#cdd5ff"');
    for (const [x, y, name] of deepLabels) labels += label(x, y, 8, 4, name, 'font-size="10.5" fill="#aab4e0"');
    for (const [x, y, name] of constLabels) labels += centerLabel(x, y, name, 'font-size="12" fill="rgba(200,180,255,.85)"');
    for (const [x, y, name] of asterismLabels) labels += centerLabel(x, y, name, 'font-size="11" fill="rgba(255,217,102,.7)"');
    out += `<g clip-path="url(#skyclip)">${g}</g><g paint-order="stroke" stroke="#0a1030" stroke-width="3" stroke-linejoin="round">${labels}</g>`;
    out += `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="rgba(190,205,255,.4)" stroke-width="1.5"/>`;
    DIRS.forEach((d, i) => {
      if (i % 2) return;
      const main = i % 4 === 0;
      const rr = R + (main ? 18 : 15);
      const a = (i * 22.5 * Math.PI) / 180;
      out += `<text x="${f(C - rr * Math.sin(a))}" y="${f(C - rr * Math.cos(a))}" text-anchor="middle" dominant-baseline="central" font-size="${main ? 17 : 11}" font-weight="${main ? 700 : 400}" fill="${main ? '#e9edff' : '#8f97c2'}">${d}</text>`;
    });
    $('star-chart').innerHTML = out;
  }

  /* ---------------------------------------------------------
   * 全体の流れ
   * --------------------------------------------------------- */
  function computeSkies() {
    state.skies = [];
    for (let i = 0; i < NIGHTS; i++) state.skies.push(nightSky(addDays(state.base, i), state.obs));
  }
  function computeSummaries() {
    state.summaries = [];
    for (let i = 0; i < NIGHTS; i++) state.summaries.push(summarizeNight(addDays(state.base, i), state.hourMap, state.obs));
  }

  function defaultStep() {
    if (state.offset === 0) {
      const now = new Date();
      const mins = (now - atJst(state.base, SLIDER_START_MIN)) / 60000;
      if (mins >= 0 && mins <= 44 * SLIDER_STEP_MIN) return Math.round(mins / SLIDER_STEP_MIN);
    }
    return 12; // 21:00
  }

  function renderAll({ talk = true } = {}) {
    renderTabs();
    renderForecast();
    renderWeekly();
    renderNation();
    renderSkyCards();
    $('time-range').value = state.step;
    renderChartTime();
    if (talk) talkAll();
  }

  function talkAll() {
    if (!state.introDone) return; // オープニング中は待つ（終わったら initSplash から呼ぶ）
    const sum = state.summaries[state.offset];
    const sky = state.skies[state.offset];
    if (state.weatherStatus === 'loading') {
      showWaiting('renko', `${whenWord(state.offset, sum.date)}の星空は……`, 'think');
      showChatWaiting();
    } else {
      speak('renko', renkoScript(sum, sky, state.offset).parts);
      startChat();
    }
    speakWhenVisible('mary', maryScript(sum, sky, state.offset).parts);
  }

  function setOffset(i) {
    if (i === state.offset) return;
    state.offset = i;
    state.step = defaultStep();
    renderAll();
  }

  async function loadLocation(loc) {
    const req = ++state.reqId;
    state.loc = loc;
    state.obs = new A.Observer(loc.lat, loc.lon, 0);
    const now = new Date();
    state.base = jstParts(now).h < 6 ? addDays(jstDate(now), -1) : jstDate(now);
    state.hourMap = null;
    state.jma = null;
    state.weatherStatus = 'loading';
    state.jmaStatus = 'loading';
    computeSkies();
    computeSummaries();
    state.step = defaultStep();
    renderAll();

    const [w, j] = await Promise.allSettled([fetchMeteo(String(loc.lat), String(loc.lon)), fetchJma(loc.jma)]);
    if (req !== state.reqId) return;
    if (w.status === 'fulfilled') {
      state.hourMap = toHourMap(w.value);
      state.weatherStatus = 'ok';
    } else {
      console.error('天気データの取得に失敗', w.reason);
      state.weatherStatus = 'error';
    }
    if (j.status === 'fulfilled') {
      state.jma = j.value;
      state.jmaStatus = 'ok';
    } else {
      console.warn('気象庁予報の取得に失敗', j.reason);
      state.jmaStatus = 'error';
    }
    computeSummaries();
    renderAll();
  }

  async function loadNation() {
    const locs = window.LOCATIONS;
    try {
      const json = await fetchMeteo(locs.map((l) => l.lat).join(','), locs.map((l) => l.lon).join(','));
      const arr = Array.isArray(json) ? json : [json];
      state.nation = arr.map(toHourMap);
    } catch (e) {
      console.error('全国データの取得に失敗', e);
      state.nation = 'error';
    }
    if (state.loc) renderNation();
  }

  function selectLocation(id) {
    const loc = window.LOCATIONS.find((l) => l.id === id);
    if (!loc) return;
    $('loc-select').value = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* 保存できなくても動く */ }
    loadLocation(loc);
  }

  function useGeolocation() {
    if (!navigator.geolocation) { alert('このブラウザは位置情報に対応していません。'); return; }
    const btn = $('geo-btn');
    btn.disabled = true;
    btn.textContent = '測位中…';
    navigator.geolocation.getCurrentPosition((pos) => {
      btn.disabled = false;
      btn.textContent = '現在地';
      const { latitude: lat, longitude: lon } = pos.coords;
      const near = window.LOCATIONS.reduce((a, b) => (Math.hypot(b.lat - lat, b.lon - lon) < Math.hypot(a.lat - lat, a.lon - lon) ? b : a));
      const loc = { id: 'here', name: '現在地', lat, lon, jma: near.jma, jmaNear: near.name };
      const sel = $('loc-select');
      let opt = sel.querySelector('option[value="here"]');
      if (!opt) { opt = new Option('現在地', 'here'); sel.prepend(opt); }
      sel.value = 'here';
      loadLocation(loc);
    }, () => {
      btn.disabled = false;
      btn.textContent = '現在地';
      alert('位置情報を取得できませんでした。');
    }, { timeout: 10000, maximumAge: 600000 });
  }

  function tickClock() {
    const now = new Date();
    const p = jstParts(now);
    $('clock-time').textContent = `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
    if (state.loc) {
      const lst = (((A.SiderealTime(now) + state.loc.lon / 15) % 24) + 24) % 24;
      const h = Math.floor(lst);
      const m = Math.floor((lst - h) * 60);
      $('clock-sidereal').textContent = `地方恒星時 ${h}h${pad(m)}m ／ 北緯${state.loc.lat.toFixed(2)}° 東経${state.loc.lon.toFixed(2)}°`;
    }
  }

  /* ---------------------------------------------------------
   * オープニング（CSS アニメーション。ここでは終わりの合図とスキップだけ扱う）
   * --------------------------------------------------------- */
  function initSplash() {
    const el = $('splash');
    if (!el) { state.introDone = true; return; }
    document.documentElement.classList.add('splash-on');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.add('sp-leave');
      setTimeout(() => {
        el.remove();
        document.documentElement.classList.remove('splash-on');
      }, 420);
      state.introDone = true;
      if (state.summaries.length) talkAll();
    };
    el.addEventListener('click', finish);
    document.addEventListener('keydown', finish, { once: true });
    // CSS の最後のフェードアウト（sp-out）が終わったら本編へ。表示が遅れても演出どおりに終わる
    el.addEventListener('animationend', (e) => {
      if (e.target === el && e.animationName === 'sp-out') finish();
    });
    setTimeout(finish, 7000); // アニメーションが動かない環境向けの保険
  }

  function initBackground() {
    const c = $('sky-bg');
    const ctx = c.getContext('2d');
    let stars = [];
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((window.innerWidth * window.innerHeight) / 5200);
      stars = Array.from({ length: n }, () => ({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, r: Math.random() * 1.1 + 0.2, p: Math.random() * 6.28, s: 0.4 + Math.random() * 1.4 }));
      draw(0);
    };
    const draw = (t) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        ctx.globalAlpha = REDUCE_MOTION ? 0.6 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(s.p + (t / 1000) * s.s));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      }
    };
    window.addEventListener('resize', resize);
    resize();
    if (!REDUCE_MOTION) {
      let last = 0;
      const loop = (t) => {
        if (t - last > 60) { draw(t); last = t; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  function init() {
    initSplash();
    if (!A) {
      document.body.insertAdjacentHTML('afterbegin', '<p class="error-note wrap">天体計算ライブラリを読み込めませんでした。ネットワークを確認してください。</p>');
      return;
    }
    initBackground();
    const sel = $('loc-select');
    for (const l of window.LOCATIONS) sel.add(new Option(l.name, l.id));
    let id = window.DEFAULT_LOCATION;
    try { id = localStorage.getItem(STORAGE_KEY) || id; } catch (e) { /* noop */ }
    if (!window.LOCATIONS.some((l) => l.id === id)) id = window.DEFAULT_LOCATION;
    sel.value = id;
    sel.addEventListener('change', () => (sel.value === 'here' ? useGeolocation() : selectLocation(sel.value)));
    $('geo-btn').addEventListener('click', useGeolocation);
    $('time-range').addEventListener('input', (e) => {
      state.step = Number(e.target.value);
      renderChartTime();
    });
    $('show-lines').addEventListener('change', (e) => {
      state.showLines = e.target.checked;
      renderChartTime();
    });
    // 部室の雑談：「次の話題」と、画面に入ったときの開始
    $('chat-next').addEventListener('click', () => {
      if (!chat.topics.length) return;
      chat.idx = (chat.idx + 1) % chat.topics.length;
      chat.seen = true;
      playChat();
    });
    const chatPanel = $('chat');
    const startWhenSeen = () => {
      chat.seen = true;
      if (chat.pending) { chat.pending = false; playChat(); }
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries, obs) => {
        if (entries.some((e) => e.isIntersecting)) { startWhenSeen(); obs.disconnect(); }
      }, { threshold: 0.35 }).observe(chatPanel);
    } else {
      startWhenSeen();
    }
    // 各パネルの中のタブ切り替え
    document.querySelectorAll('.subtabs').forEach((tabs) => {
      const group = tabs.dataset.group;
      tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-view]');
        if (!btn) return;
        tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
        document.querySelectorAll(`.view[data-group="${group}"]`).forEach((v) => { v.hidden = v.dataset.view !== btn.dataset.view; });
      });
    });
    tickClock();
    setInterval(tickClock, 1000);
    loadLocation(window.LOCATIONS.find((l) => l.id === id));
    loadNation();
  }

  init();
})();
