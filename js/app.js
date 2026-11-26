/* =========================================================
 * 秘封倶楽部の星空ナビ — メインスクリプト
 *  気象: Open-Meteo / 気象庁 bosai JSON（日本版のみ）
 *  天体: Astronomy Engine
 *  画面の文言と台詞は言語ごとのファイル（日本語は js/lang-ja.js。英語版は english ブランチの js/lang-en.js）にあります。
 * ========================================================= */
(() => {
  'use strict';

  const A = window.Astronomy;
  const L = window.LANG;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PLANETS = [
    { body: 'Mercury', color: '#d8c3a0' },
    { body: 'Venus', color: '#fff4c8' },
    { body: 'Mars', color: '#ff8a5c' },
    { body: 'Jupiter', color: '#ffd9a0' },
    { body: 'Saturn', color: '#eadb9c' },
  ].map((p) => ({ ...p, name: L.planets[p.body] }));
  const SLIDER_START_MIN = 18 * 60;
  const SLIDER_STEP_MIN = 15;
  const NIGHTS = 7;
  const STORAGE_KEY = L.storageKey;
  const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || L.tz; } catch (e) { return L.tz; } })();

  const state = {
    loc: null,
    obs: null,
    tz: L.tz,           // 観察地のタイムゾーン
    base: null,         // 「今夜」の日付 (YYYY-MM-DD、観察地の暦)
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
    tone: 'hifuu',      // 台詞のバージョン（hifuu=原作寄り / classic=旧版）
  };

  /* ---------------------------------------------------------
   * 時刻まわり（観察地のタイムゾーンで数える。日本版はいつも日本時間）
   * --------------------------------------------------------- */
  const tzFormats = {};
  const offsetCache = new Map();
  // その瞬間の「現地時刻 − UTC」（ミリ秒）。夏時間も Intl に任せる
  function tzOffset(t, tz) {
    const key = `${tz}|${Math.floor(t / 900000)}`;
    let v = offsetCache.get(key);
    if (v === undefined) {
      const f = tzFormats[tz] || (tzFormats[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
      }));
      const o = {};
      for (const x of f.formatToParts(new Date(t))) o[x.type] = x.value;
      v = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - Math.floor(t / 1000) * 1000;
      if (offsetCache.size > 20000) offsetCache.clear();
      offsetCache.set(key, v);
    }
    return v;
  }
  const shifted = (d, tz) => new Date(d.getTime() + tzOffset(d.getTime(), tz));
  function localParts(d, tz = state.tz) {
    const t = shifted(d, tz);
    return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds(), wd: t.getUTCDay() };
  }
  const localDate = (d, tz = state.tz) => shifted(d, tz).toISOString().slice(0, 10);
  // 現地の暦の日付 + 0時からの分 → その瞬間
  function atLocal(dateStr, minutes, tz = state.tz) {
    const wall = Date.parse(`${dateStr}T00:00:00Z`) + minutes * 60000;
    let t = wall - tzOffset(wall, tz);
    t = wall - tzOffset(t, tz);
    return new Date(t);
  }
  const addDays = (dateStr, n) => new Date(Date.parse(`${dateStr}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  // 天気データは UTC の1時間ごと（Open-Meteo に timezone=GMT で頼む）
  const hourKey = (d) => `${d.toISOString().slice(0, 13)}:00`;
  function fmtHM(d, baseDate) {
    if (!d) return '—';
    return L.fmtHM(localParts(d), Boolean(baseDate && localDate(d) > baseDate));
  }
  function dateInfo(dateStr) {
    const t = new Date(Date.parse(`${dateStr}T12:00:00Z`));
    const mo = t.getUTCMonth() + 1;
    const d = t.getUTCDate();
    const wdIdx = t.getUTCDay();
    return { md: L.md(mo, d), mo, d, wd: L.wd[wdIdx], wdIdx };
  }
  const dirName = (az) => L.dirs[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
  const whenWord = (offset, dateStr) => L.whenWord(offset, dateInfo(dateStr));
  const tabLabel = (offset, dateStr) => L.tabLabel(offset, dateInfo(dateStr));

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
    const p = new URLSearchParams({ latitude: lats, longitude: lons, hourly: HOURLY_VARS, timezone: 'GMT', past_days: '1', forecast_days: '8' });
    if (model) p.set('models', model);
    return `https://api.open-meteo.com/v1/forecast?${p}`;
  }
  async function fetchMeteo(lats, lons) {
    if (!L.weatherModel) return fetchJSON(meteoURL(lats, lons, null));
    try {
      return await fetchJSON(meteoURL(lats, lons, L.weatherModel));
    } catch (e) {
      console.warn('指定のモデルの取得に失敗したので標準モデルで再試行します', e);
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
  const LEVELS = L.levels;
  const lvColor = (lv) => (lv ? `var(--lv${lv})` : 'var(--lv1)');

  function bodyHorizon(body, date, obs) {
    const eq = A.Equator(body, date, obs, true, true);
    return A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  }

  function summarizeNight(dateStr, hourMap, obs, tz = state.tz) {
    const hours = [];
    for (let h = 18; h <= 29; h++) {
      const t = atLocal(dateStr, h * 60, tz);
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
  function nightSky(dateStr, obs) {
    const noon = atLocal(dateStr, 12 * 60);
    const T = (x) => (x ? x.date : null);
    const sunset = T(A.SearchRiseSet('Sun', obs, -1, noon, 1));
    const sunrise = T(A.SearchRiseSet('Sun', obs, +1, sunset || noon, 1));
    const dusk = T(A.SearchAltitude('Sun', obs, -1, noon, 1, -6)) || atLocal(dateStr, 18 * 60 + 30);
    const dawn = T(A.SearchAltitude('Sun', obs, +1, dusk, 1, -6)) || atLocal(dateStr, 29 * 60);
    const astroDusk = T(A.SearchAltitude('Sun', obs, -1, noon, 1, -18));
    const astroDawn = T(A.SearchAltitude('Sun', obs, +1, astroDusk || dusk, 1, -18));
    const at21 = atLocal(dateStr, 21 * 60);

    const phase = A.MoonPhase(at21);
    const moon = {
      phase,
      age: (phase / 360) * 29.530589,
      illum: A.Illumination('Moon', at21).phase_fraction,
      rise: T(A.SearchRiseSet('Moon', obs, +1, noon, 1)),
      set: T(A.SearchRiseSet('Moon', obs, -1, noon, 1)),
      upAtDusk: bodyHorizon('Moon', dusk, obs).altitude > 0,
    };
    moon.name = L.moonName(moon.age);
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
    const info = { ...p, mag: A.Illumination(p.body, at21).mag, constellation: L.conName(con.symbol, con.name), visible: vis.length > 0 };
    if (!info.visible) return info;
    const best = vis.reduce((a, b) => (b.alt > a.alt ? b : a));
    const start = vis[0].t;
    const end = vis[vis.length - 1].t;
    const fromDusk = start - dusk < 20 * 60000;
    const toDawn = dawn - end < 20 * 60000;
    const startH = localParts(start).h;
    const lateRise = startH >= 18 || startH < 2; // 夜中の2時より前に昇る
    // evening=宵の空 / allnight=一晩中 / midnight=夜半 / late=夜半〜明け方 / morning=明け方の空
    info.period = fromDusk && toDawn ? 'allnight' : fromDusk ? 'evening' : toDawn ? (lateRise ? 'late' : 'morning') : 'midnight';
    info.periodLabel = L.periods[info.period];
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

  // 台詞の関数に渡す道具
  const helpers = {
    state, pad, esc, fmtHM, dateInfo, whenWord, localParts, atLocal, constellationsAt, upcomingShowers,
  };

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
    const want = cfg[expr] || (expr ? `img/${char}/${expr}.png` : null);
    for (const url of [want, cfg.normal].filter(Boolean)) {
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
    const char = who === 'renko' ? 'renko' : 'maribel';
    const fig = document.querySelector(`.portrait[data-char="${char}"]`);
    const token = Symbol(who);
    talkTokens[who] = token;
    bubble.innerHTML = `<span class="speaker">${L.names[char]}</span>`;
    const ps = parts.map((p) => {
      const el = document.createElement('p');
      if (p.cls) el.className = p.cls;
      bubble.appendChild(el);
      return el;
    });
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
    const char = who === 'renko' ? 'renko' : 'maribel';
    if (expr) setPortrait(char, expr);
    $(`${who}-bubble`).innerHTML = `<span class="speaker">${L.names[char]}</span><p class="lead">${esc(text)}<span class="caret"></span></p>`;
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

  /* ---------------------------------------------------------
   * 二人がスクロールについてくる舞台（広い画面だけ）
   *  立ち絵は、ページの下まで続く「レール」（.track）の中で sticky。
   *  蓮子はメリーのパネルの裏を通っておりていき、二人が「カフェテラスの雑談」まで来たら雑談が始まる。
   *  スマホでは、立ち絵を各パネルの中（.portrait-slot）に戻す
   * --------------------------------------------------------- */
  const stageMQ = window.matchMedia('(min-width: 681px)');
  const isStage = () => stageMQ.matches;
  function placePortraits() {
    for (const char of ['renko', 'maribel']) {
      const fig = document.querySelector(`.portrait[data-char="${char}"]`);
      const dest = document.querySelector(isStage() ? `.track[data-track="${char}"]` : `.portrait-slot[data-slot="${char}"]`);
      if (fig && dest && fig.parentNode !== dest) dest.appendChild(fig);
    }
  }
  // 二人が雑談のところまでおりてきたか
  function chatArrived() {
    const panel = $('chat');
    if (!panel || panel.hidden || document.documentElement.classList.contains('splash-on')) return false;
    const r = panel.getBoundingClientRect();
    const vh = window.innerHeight;
    if (isStage()) {
      const fig = document.querySelector('.portrait[data-char="maribel"]');
      const top = (fig && parseFloat(getComputedStyle(fig).top)) || 64;
      const atBottom = vh + window.scrollY >= document.documentElement.scrollHeight - 4;
      return r.top <= top + 48 || (atBottom && r.top < vh * 0.7);
    }
    const vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    return vis >= Math.min(r.height, vh) * 0.35;
  }
  // 立ち絵を一瞬だけ動かす（hop=着地、speaking=しゃべる）
  function nudge(char, cls, ms) {
    const fig = document.querySelector(`.portrait[data-char="${char}"]`);
    if (!fig || REDUCE_MOTION) return;
    fig.classList.remove(cls);
    void fig.offsetWidth; // アニメーションを最初から
    fig.classList.add(cls);
    clearTimeout(fig[`_${cls}`]);
    fig[`_${cls}`] = setTimeout(() => fig.classList.remove(cls), ms);
  }
  let checkArrival = () => {};

  // 背の高い画面では、いちばん下までスクロールしても雑談の部屋が画面の上のほうまで来ない。
  // そのぶん、最後の一画面ぶんのスクロールに合わせて二人をすーっとおろして、ちょうど一番下で部屋に着くようにする
  function updateDrop() {
    const figs = [...document.querySelectorAll('.track .portrait')];
    const room = $('chat');
    const clear = () => figs.forEach((f) => f.style.removeProperty('--drop'));
    if (!figs.length || !room || room.hidden || !isStage()) { clear(); return; }
    const vh = window.innerHeight;
    const r = room.getBoundingClientRect();
    const cs = getComputedStyle(room);
    const inset = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
    const stick = parseFloat(getComputedStyle(figs[0]).top) || 64;
    // いちばん下までスクロールしたときの部屋の上端（画面の中）。会話が伸びても変わらないよう、部屋のいちばん低い高さで計算
    const minH = parseFloat(cs.minHeight) || r.height;
    const below = document.documentElement.scrollHeight - (r.bottom + window.scrollY); // 部屋の下（地面とクレジット）
    const land = vh - (minH + below);
    // 二人の位置は「今、部屋の上端が画面のどこにあるか」だけで決める（ページの長さには左右されない）
    let drop = 0;
    if (land + inset > stick && r.top < vh && land < vh) {
      drop = r.top <= land
        ? Math.max(0, r.top + inset - stick)                            // 着いたあとは部屋の上のほうにいる
        : ((land + inset - stick) * (vh - r.top)) / (vh - land);        // 部屋が見えてから着くまで、すこしずつおりる
    }
    figs.forEach((f) => f.style.setProperty('--drop', `${drop.toFixed(1)}px`));
  }

  /* ---------------------------------------------------------
   * 台詞のバージョン切り替え（URL の ?tone= で指定。リンクを共有して見比べられる）
   *  台詞そのものは言語ファイル（L.tones）にある
   * --------------------------------------------------------- */
  const TONES = L.tones;
  function toneFromURL() {
    const t = new URLSearchParams(location.search).get('tone');
    return t && TONES[t] ? t : 'hifuu';
  }
  function applyTone(tone, { updateURL = false } = {}) {
    state.tone = tone;
    document.querySelectorAll('.tone-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tone === tone)));
    $('chat').hidden = !TONES[tone].chat; // 旧版には雑談はなかったので出さない
    if (updateURL) {
      const url = new URL(location.href);
      if (tone === 'hifuu') url.searchParams.delete('tone');
      else url.searchParams.set('tone', tone);
      history.replaceState(null, '', url);
    }
  }

  /* ---------------------------------------------------------
   * カフェテラスの雑談（二人の掛け合い）
   *  1日に1話（js/chats.js）。二人がいるのは京都なので、日本時間の朝6時に次の話に替わる
   * --------------------------------------------------------- */
  const CHAT_TZ = 'Asia/Tokyo';
  const CHAT_SWITCH_HOUR = 6; // 朝6時に次の話に替わる（サイトの「今夜」の区切りと同じ）
  const chat = { day: null, token: null, seen: false, pending: false, fast: false, wake: null };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  // 今日の雑談。日付から決まるので、誰がいつ開いても同じ日なら同じ話になる
  function todaysChat(now = new Date()) {
    const list = window.CLUB_CHATS || [];
    if (!list.length) return null;
    const day = Math.floor((now.getTime() + tzOffset(now.getTime(), CHAT_TZ) - CHAT_SWITCH_HOUR * 3600e3) / 86400000);
    let step = 5; // 話の数と互いに素な数ずつ進めて、順番どおりに並ばないようにしつつ全話を一巡させる
    while (gcd(step, list.length) !== 1) step++;
    return { day, ep: list[(((day * step) % list.length) + list.length) % list.length] };
  }
  // 待ち時間。タップされたらすぐ次へ
  const chatWait = (ms) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    chat.wake = () => { clearTimeout(t); resolve(); };
  });

  // 雑談の1行。顔アイコンは、スマホと冥界の場面だけで見える（広い画面では大きい立ち絵がそばにいるので CSS で隠す）
  function chatLineEl(who, expr, text) {
    const div = document.createElement('div');
    div.className = `chat-line ${who === 'renko' ? 'renko' : 'mary'}`;
    const name = L.short[who === 'renko' ? 'renko' : 'maribel'];
    div.innerHTML = `<span class="chat-face"><img src="img/face/${who}-${expr}.png" alt=""></span><p class="chat-msg"><span class="chat-name">${name}</span>${esc(text)}</p>`;
    const img = div.querySelector('img');
    img.addEventListener('error', () => { if (!img.src.endsWith('-smile.png')) img.src = `img/face/${who}-smile.png`; }, { once: true });
    return div;
  }

  // 台詞は1行ずつ足していく（会話が下に伸びていく）。タップで残りを一気に表示
  function playChat() {
    const t = todaysChat();
    if (!t) return;
    const token = Symbol('chat');
    chat.token = token;
    chat.day = t.day;
    chat.fast = REDUCE_MOTION;
    const now = new Date();
    const p = localParts(now, CHAT_TZ);
    const label = dateInfo(localDate(new Date(now.getTime() - CHAT_SWITCH_HOUR * 3600e3), CHAT_TZ));
    $('chat-topic').textContent = L.ui.chatTopic(label, t.ep.title);
    $('chat-count').textContent = L.ui.chatTapAll;
    const ctx = { night: bodyHorizon('Sun', now, state.obs).altitude < -6, h: p.h, mm: pad(p.mi), ss: pad(p.s) };
    const lines = typeof t.ep.lines === 'function' ? t.ep.lines(ctx) : t.ep.lines;
    const log = $('chat-log');
    log.innerHTML = '';
    (async () => {
      for (let i = 0; i < lines.length; i++) {
        if (i > 0 && !chat.fast) await chatWait(Math.min(2800, 800 + lines[i - 1][2].length * 50)); // 前の台詞を読む時間
        if (chat.token !== token) return;
        log.appendChild(chatLineEl(...lines[i]));
        updateDrop(); // 会話が伸びるとページの長さが変わる
        if (isStage()) { // そばにいる二人の表情も変える
          const char = lines[i][0] === 'renko' ? 'renko' : 'maribel';
          setPortrait(char, lines[i][1]);
          if (!chat.fast) nudge(char, 'speaking', 900);
        }
      }
      $('chat-count').textContent = L.ui.chatNext(p.h < CHAT_SWITCH_HOUR, CHAT_SWITCH_HOUR);
    })();
  }

  // 1日1話なので、夜や観察地を切り替えても同じ日のうちは最初から流し直さない
  function startChat() {
    const t = todaysChat();
    if (!t || chat.day === t.day) return;
    if (chat.seen) playChat();
    else { chat.pending = true; showChatWaiting(); } // 二人が来たら始める
  }
  function showChatWaiting() {
    if (chat.day !== null) return;
    chat.token = Symbol('wait');
    $('chat-topic').textContent = '';
    $('chat-count').textContent = '';
    $('chat-log').innerHTML = `<p class="loading">${L.ui.chatWaiting}</p>`;
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
    $('index-date').textContent = L.ui.indexDate(info, state.loc.name);

    const ring = $('index-ring');
    const facts = $('index-facts');
    if (state.weatherStatus === 'loading') {
      $('index-num').textContent = '--';
      $('index-label').textContent = L.ui.checkingClouds;
      $('index-stars').textContent = '';
      ring.style.setProperty('--val', 0);
      facts.innerHTML = '';
      $('hourly').innerHTML = `<p class="loading">${L.ui.loading}</p>`;
    } else if (state.weatherStatus === 'error' || !sum.hasData) {
      $('index-num').textContent = '--';
      $('index-label').textContent = state.weatherStatus === 'error' ? L.ui.weatherError : L.ui.noForecast;
      $('index-stars').textContent = '';
      ring.style.setProperty('--val', 0);
      facts.innerHTML = `<dt>${L.ui.moon}</dt><dd>${esc(sky.moon.name)}</dd>`;
      $('hourly').innerHTML = `<p class="${state.weatherStatus === 'error' ? 'error-note' : 'empty'}">${state.weatherStatus === 'error' ? L.ui.fetchFailed : L.ui.noHourly}</p>`;
    } else {
      const lvl = LEVELS[sum.lv];
      $('index-num').textContent = sum.idx;
      $('index-label').textContent = lvl.label;
      $('index-stars').textContent = lvl.stars;
      ring.style.setProperty('--val', sum.idx);
      ring.style.setProperty('--col', lvColor(sum.lv));
      const m = sky.moon;
      const ML = L.ui.moonLight;
      const moonLight = m.upFrac < 0.1 || m.illum < 0.15 ? ML.none : m.illum >= 0.75 ? ML.bright : m.illum >= 0.4 ? ML.normal : ML.weak;
      facts.innerHTML = `
        <dt>${L.ui.factBest}</dt><dd>${L.ui.bestHour(sum.best)}</dd>
        <dt>${L.ui.factCloud}</dt><dd>${sum.avgCloud}%</dd>
        <dt>${L.ui.factMoon}</dt><dd>${moonLight}</dd>`;
      renderHourly(sum);
    }
    renderJmaLine(sum.date);
  }

  function renderHourly(sum) {
    const box = $('hourly');
    box.innerHTML = sum.hours.map((x) => {
      if (x.idx == null) return `<div class="hour"><span>${L.ui.hourLabel(x.h)}</span><div class="bar-wrap"></div><span class="val">--</span><span class="icon"></span></div>`;
      const icon = x.w.precip >= 0.1 ? '☂' : x.lv >= 4 ? '★' : x.lv === 3 ? '☆' : '☁';
      const cls = ['hour'];
      if (!x.dark) cls.push(x.morning ? 'dawn' : 'dusk');
      if (sum.best && x.t === sum.best.t) cls.push('best');
      return `<div class="${cls.join(' ')}" title="${esc(L.ui.hourTitle(x))}">
        <span>${L.ui.hourLabel(x.h)}</span>
        <div class="bar-wrap"><div class="bar" style="height:${Math.max(4, x.idx)}%;background:${lvColor(x.lv)}"></div></div>
        <span class="val">${x.idx}</span>
        <span class="icon" aria-hidden="true">${icon}</span>
      </div>`;
    }).join('');
  }

  function renderJmaLine(date) {
    const el = $('jma-line');
    if (!el) return;
    el.hidden = !L.jma || state.jmaStatus === 'off';
    if (el.hidden) return;
    const U = L.ui;
    const near = state.loc.jmaNear ? esc(U.jmaNear(state.loc.jmaNear)) : '';
    if (state.jmaStatus === 'loading') { el.textContent = U.jmaLoading; return; }
    if (state.jmaStatus === 'error' || !state.jma) { el.textContent = U.jmaError; return; }
    const text = state.jma.text[date];
    if (!text) { el.innerHTML = U.jmaTooFar(near); return; }
    const p1 = state.jma.pops[`${date}T18:00:00+09:00`];
    const p2 = state.jma.pops[`${addDays(date, 1)}T00:00:00+09:00`];
    const pops = U.jmaPops(p1 != null ? esc(p1) : null, p2 != null ? esc(p2) : null);
    el.innerHTML = U.jmaLine(esc(state.jma.office), esc(state.jma.area), near, esc(text), pops);
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
        <span class="d-date">${i === 0 ? L.ui.tonight : info.md}</span>
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
    if (!state.nation) { box.innerHTML = `<p class="loading">${L.ui.loading}</p>`; return; }
    if (state.nation === 'error') { box.innerHTML = `<p class="error-note">${L.ui.nationError}</p>`; return; }
    const date = addDays(state.base, state.offset);
    box.innerHTML = '';
    window.LOCATIONS.forEach((loc, i) => {
      const obs = new A.Observer(loc.lat, loc.lon, 0);
      const sum = summarizeNight(date, state.nation[i], obs, loc.tz || L.tz);
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
    const U = L.ui;
    const riseText = m.upAtDusk ? U.moonUpAtDusk : fmtHM(m.rise, d);
    $('moon-card').innerHTML = `
      <h3>${U.moon}</h3>
      <div class="moon-wrap">
        ${moonSVG(m.phase)}
        <div>
          <p class="moon-name">${m.name}</p>
          <dl class="facts">
            <dt>${U.moonAge}</dt><dd>${m.age.toFixed(1)}</dd>
            <dt>${U.moonRise}</dt><dd>${riseText}</dd>
            <dt>${U.moonSet}</dt><dd>${fmtHM(m.set, d)}</dd>
          </dl>
        </div>
      </div>`;
    $('sun-card').innerHTML = `
      <h3>${U.nightTimes}</h3>
      <dl class="facts">
        <dt>${U.sunset}</dt><dd>${fmtHM(sky.sunset, d)}</dd>
        <dt>${U.starsOut}</dt><dd>${fmtHM(sky.dusk, d)}</dd>
        <dt>${U.skyBrightens}</dt><dd>${fmtHM(sky.astroDawn, d)}</dd>
        <dt>${U.sunrise}</dt><dd>${fmtHM(sky.sunrise, d)}</dd>
      </dl>`;
    renderPlanets(sky);

    const showers = upcomingShowers(state.base, 60);
    $('meteors').innerHTML = showers.length ? showers.map((s) => {
      const moonIllum = A.Illumination('Moon', atLocal(s.date, 2 * 60)).phase_fraction;
      const cond = U.meteorMoon[moonIllum < 0.35 ? 0 : moonIllum < 0.7 ? 1 : 2];
      return `<div class="meteor${s.diff <= 10 ? ' soon' : ''}">
        <div class="m-days">${U.meteorDays(s.diff)}</div>
        <div><div class="m-name">${s.name}</div><div class="m-sub">${U.meteorSub(dateInfo(s.date).md, s.radiant, s.zhr)}</div></div>
        <div class="m-moon">${cond}</div>
      </div>`;
    }).join('') : `<p class="empty">${U.noMeteors}</p>`;
  }

  function chartDate() {
    return atLocal(state.skies[state.offset].date, SLIDER_START_MIN + state.step * SLIDER_STEP_MIN);
  }

  function renderChartTime() {
    const sky = state.skies[state.offset];
    const date = chartDate();
    const label = fmtHM(date, sky.date);
    const info = dateInfo(sky.date);
    $('chart-when').textContent = L.ui.chartWhen(info, label);
    $('const-when').textContent = L.ui.constWhen(label);
    renderChart(date);
    const consts = constellationsAt(date, state.obs).slice(0, 6);
    $('consts').innerHTML = consts.length ? consts.map((c) => `
      <div class="const">
        <div class="k-head"><span class="k-name">${c.name}</span><span class="k-pos">${L.posText(c.alt, c.dir)}</span></div>
        <p>${c.tip}</p>
      </div>`).join('') : `<p class="empty">${L.ui.noConsts}</p>`;
  }

  // 見える惑星だけカードにして、見えないものは1行にまとめる
  function renderPlanets(sky) {
    const U = L.ui;
    const order = { evening: 0, allnight: 1, midnight: 2, late: 3, morning: 4 };
    const vis = sky.planets.filter((p) => p.visible).sort((a, b) => order[a.period] - order[b.period] || a.mag - b.mag);
    const off = sky.planets.filter((p) => !p.visible).map((p) => p.name);
    const cards = vis.map((p) => `<div class="planet">
        <div class="p-head"><span class="p-dot" style="background:${p.color};color:${p.color}"></span><span class="p-name">${p.name}</span><span class="p-mag">${U.planetMag(p.mag, p.constellation)}</span></div>
        <p>${U.planetSpan(p.periodLabel, fmtHM(p.start, sky.date), fmtHM(p.end, sky.date))}</p>
        <p>${U.planetBest(fmtHM(p.best.t, sky.date), p.bestDir, Math.round(p.best.alt))}</p>
      </div>`).join('');
    $('planets').innerHTML = (cards || `<p class="empty">${U.noPlanets}</p>`)
      + (off.length ? `<p class="planet-off">${U.planetsOff(off)}</p>` : '');
  }

  // ラベルの幅の見積もり（全角は1文字ぶん、半角はおよそ0.56文字ぶん）
  const textWidth = (text, size) => [...text].reduce((w, ch) => w + (ch.codePointAt(0) > 0x2e7f ? 1 : 0.56), 0) * size;

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
      const w = textWidth(text, size);
      const tx = right ? x - dx : x + dx;
      const ty = place(right ? tx - w : tx, right ? tx : tx + w, y + dy, size);
      return `<text x="${f(tx)}" y="${f(ty)}" text-anchor="${right ? 'end' : 'start'}" ${attrs}>${esc(text)}</text>`;
    };
    const centerLabel = (x, y, text, attrs) => {
      const size = sizeOf(attrs);
      const w = textWidth(text, size);
      const ty = place(x - w / 2, x + w / 2, y, size);
      return `<text x="${f(x)}" y="${f(ty)}" text-anchor="middle" ${attrs}>${esc(text)}</text>`;
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
      constLabels.push([cx, cy + 16, c.name.replace(/\s*[（(].*[）)]/, '')]);
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
      if (mh.altitude > 0) labels += label(x, y, 14, 4, L.ui.moon, 'font-size="13" font-weight="700" fill="#fff3c4"');
    }
    for (const [x, y, pl] of planetLabels) labels += label(x, y, 8, -6, pl.name, `font-size="13" font-weight="700" fill="${pl.color}"`);
    starLabels.sort((a, b) => a[4] - b[4]);
    for (const [x, y, dx, name] of starLabels) labels += label(x, y, dx, 4, name, 'font-size="11" fill="#cdd5ff"');
    for (const [x, y, name] of deepLabels) labels += label(x, y, 8, 4, name, 'font-size="10.5" fill="#aab4e0"');
    for (const [x, y, name] of constLabels) labels += centerLabel(x, y, name, 'font-size="12" fill="rgba(200,180,255,.85)"');
    for (const [x, y, name] of asterismLabels) labels += centerLabel(x, y, name, 'font-size="11" fill="rgba(255,217,102,.7)"');
    out += `<g clip-path="url(#skyclip)">${g}</g><g paint-order="stroke" stroke="#0a1030" stroke-width="3" stroke-linejoin="round">${labels}</g>`;
    out += `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="rgba(190,205,255,.4)" stroke-width="1.5"/>`;
    L.dirs.forEach((d, i) => {
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
      const mins = (now - atLocal(state.base, SLIDER_START_MIN)) / 60000;
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
    const tone = TONES[state.tone] || TONES.hifuu;
    if (state.weatherStatus === 'loading') {
      showWaiting('renko', L.ui.renkoWaiting(whenWord(state.offset, sum.date)), 'think');
      if (tone.chat) showChatWaiting();
    } else {
      speak('renko', tone.renko(sum, sky, state.offset, helpers).parts);
      if (tone.chat) startChat();
    }
    speakWhenVisible('mary', tone.mary(sum, sky, state.offset, helpers).parts);
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
    state.tz = loc.tz || L.tz;
    const now = new Date();
    state.base = localParts(now).h < 6 ? addDays(localDate(now), -1) : localDate(now);
    state.hourMap = null;
    state.jma = null;
    state.weatherStatus = 'loading';
    state.jmaStatus = L.jma && loc.jma ? 'loading' : 'off';
    computeSkies();
    computeSummaries();
    state.step = defaultStep();
    renderAll();

    const [w, j] = await Promise.allSettled([
      fetchMeteo(String(loc.lat), String(loc.lon)),
      state.jmaStatus === 'loading' ? fetchJma(loc.jma) : Promise.resolve(null),
    ]);
    if (req !== state.reqId) return;
    if (w.status === 'fulfilled') {
      state.hourMap = toHourMap(w.value);
      state.weatherStatus = 'ok';
    } else {
      console.error('天気データの取得に失敗', w.reason);
      state.weatherStatus = 'error';
    }
    if (state.jmaStatus === 'loading') {
      if (j.status === 'fulfilled') {
        state.jma = j.value;
        state.jmaStatus = 'ok';
      } else {
        console.warn('気象庁予報の取得に失敗', j.reason);
        state.jmaStatus = 'error';
      }
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
    const U = L.ui;
    if (!navigator.geolocation) { alert(U.geoUnsupported); return; }
    const btn = $('geo-btn');
    btn.disabled = true;
    btn.textContent = U.geoLocating;
    navigator.geolocation.getCurrentPosition((pos) => {
      btn.disabled = false;
      btn.textContent = U.here;
      const { latitude: lat, longitude: lon } = pos.coords;
      const loc = { id: 'here', name: U.here, lat, lon, tz: BROWSER_TZ, f: /^en-US$/i.test(navigator.language || '') };
      // 日本にいるときは、いちばん近い都市の気象庁の予報区を使う
      if (L.jma && BROWSER_TZ === 'Asia/Tokyo') {
        const near = window.LOCATIONS.reduce((a, b) => (Math.hypot(b.lat - lat, b.lon - lon) < Math.hypot(a.lat - lat, a.lon - lon) ? b : a));
        Object.assign(loc, { jma: near.jma, jmaNear: near.name });
      }
      const sel = $('loc-select');
      let opt = sel.querySelector('option[value="here"]');
      if (!opt) { opt = new Option(U.here, 'here'); sel.prepend(opt); }
      sel.value = 'here';
      loadLocation(loc);
    }, () => {
      btn.disabled = false;
      btn.textContent = U.here;
      alert(U.geoFailed);
    }, { timeout: 10000, maximumAge: 600000 });
  }

  function tickClock() {
    const now = new Date();
    const p = localParts(now);
    $('clock-time').textContent = `${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
    if (state.loc) {
      const lst = (((A.SiderealTime(now) + state.loc.lon / 15) % 24) + 24) % 24;
      const h = Math.floor(lst);
      const m = Math.floor((lst - h) * 60);
      $('clock-sidereal').textContent = L.ui.sidereal(h, m, state.loc.lat, state.loc.lon);
    }
  }

  // 最初に開く観察地。'auto' のときは、ブラウザのタイムゾーンに近い都市を選ぶ
  function initialLocationId() {
    const locs = window.LOCATIONS;
    let id = window.DEFAULT_LOCATION;
    try { id = localStorage.getItem(STORAGE_KEY) || id; } catch (e) { /* noop */ }
    if (locs.some((l) => l.id === id)) return id;
    const same = locs.find((l) => l.tz === BROWSER_TZ);
    if (same) return same.id;
    const now = Date.now();
    const mine = tzOffset(now, BROWSER_TZ);
    return locs.reduce((a, b) => (Math.abs(tzOffset(now, b.tz || L.tz) - mine) < Math.abs(tzOffset(now, a.tz || L.tz) - mine) ? b : a)).id;
  }

  /* ---------------------------------------------------------
   * 蓮台野の墓石（イースターエッグ。蓮台野夜行にちなんで）
   *  ページのいちばん下の墓石を一回転させると……丑三つ時（2:00〜2:30）なら冥界の入口が開く。
   *  観察地の今の時刻か、メリーの星図の時刻（スライダー）のどちらかが丑三つ時ならOK
   * --------------------------------------------------------- */
  const GRAVE_KEY = 'hifuu-starnavi:rendaino';
  function isUshimitsu() {
    const p = localParts(new Date());
    if (p.h === 2 && p.mi < 30) return true;
    const m = (SLIDER_START_MIN + state.step * SLIDER_STEP_MIN) % 1440;
    return m >= 120 && m <= 150;
  }

  function initGrave() {
    const btn = $('grave');
    const G = L.grave;
    if (!btn || !G) return;
    const stone = btn.querySelector('.rd-stone');
    const say = $('grave-say');
    try { if (localStorage.getItem(GRAVE_KEY)) btn.classList.add('rd-found'); } catch (e) { /* noop */ }
    let rot = 0;        // 今の向き（度）
    let turned = 0;     // 回した量の合計（行って戻すと打ち消し合う）
    let drag = null;
    let skipClick = false;
    let hint = 0;
    let sayTimer = null;
    const show = (anim) => {
      stone.style.transition = anim ? '' : 'none';
      stone.style.transform = `rotateY(${rot}deg)`;
    };
    const speakHint = () => {
      const [who, text] = G.hints[Math.min(hint, G.hints.length - 1)];
      hint++;
      say.innerHTML = `<span class="chat-name ${who === 'renko' ? 'renko' : 'mary'}">${L.short[who]}</span>${esc(text)}`;
      say.classList.add('show');
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => say.classList.remove('show'), 6000);
    };
    const check = () => {
      if (Math.abs(turned) < 359) return;
      turned = 0;
      if (isUshimitsu()) {
        say.classList.remove('show');
        openNetherworld();
      } else {
        speakHint();
      }
    };
    // ドラッグで回す（横に引っぱる）。タップやキーボードなら90度ずつ
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      skipClick = false;
      drag = { x: e.clientX, rot, moved: false };
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      drag.moved = true;
      const next = drag.rot + dx * 2;
      turned += next - rot;
      rot = next;
      show(false);
    });
    const end = () => {
      if (!drag) return;
      const { moved } = drag;
      drag = null;
      if (!moved) return;
      skipClick = true;
      const snapped = Math.round(rot / 90) * 90;
      turned += snapped - rot;
      rot = snapped;
      show(true);
      check();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', () => {
      if (skipClick) { skipClick = false; return; }
      rot += 90;
      turned += 90;
      show(true);
      check();
    });
  }

  // 冥界の桜吹雪（canvas）。止める関数を返す
  function petals(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let raf = 0;
    let alive = true;
    const fit = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);
    const n = Math.round(clamp((w * h) / 12000, 30, 110));
    const ps = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: -Math.random() * h, s: 4 + Math.random() * 5, vy: 0.6 + Math.random() * 1.1, vx: 0.2 + Math.random() * 0.7,
      a: Math.random() * 6.28, va: (Math.random() - 0.5) * 0.06, sw: Math.random() * 6.28, c: Math.random() < 0.5 ? '#ffd1df' : '#ffb9cf',
    }));
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.sw)));
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.moveTo(0, p.s);
        ctx.bezierCurveTo(p.s * 0.95, p.s * 0.4, p.s * 0.8, -p.s * 0.8, p.s * 0.22, -p.s);
        ctx.lineTo(0, -p.s * 0.72); // 花びらの先の切れ込み
        ctx.lineTo(-p.s * 0.22, -p.s);
        ctx.bezierCurveTo(-p.s * 0.8, -p.s * 0.8, -p.s * 0.95, p.s * 0.4, 0, p.s);
        ctx.fill();
        ctx.restore();
      }
    };
    const step = () => {
      if (!alive) return;
      for (const p of ps) {
        p.sw += 0.025;
        p.a += p.va;
        p.x += p.vx + Math.sin(p.sw) * 0.7;
        p.y += p.vy;
        if (p.y > h + 20 || p.x > w + 20) { p.y = -20; p.x = Math.random() * w * 1.2 - w * 0.2; }
      }
      draw();
      raf = requestAnimationFrame(step);
    };
    if (REDUCE_MOTION) {
      ps.forEach((p) => { p.y = Math.random() * h; });
      draw();
    } else {
      raf = requestAnimationFrame(step);
    }
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }

  function openNetherworld() {
    if (document.querySelector('.nw-veil')) return;
    const G = L.grave;
    const root = document.documentElement;
    const veil = document.createElement('div');
    veil.className = 'nw-veil';
    veil.innerHTML = `<canvas class="nw-petals" aria-hidden="true"></canvas>
      <div class="nw-card" role="dialog" aria-modal="true" aria-label="${esc(G.title)}">
        <p class="nw-place">${esc(G.place)}</p>
        <div class="nw-lines" aria-live="polite"></div>
        <button type="button" class="nw-back">${esc(G.back)}</button>
      </div>`;
    document.body.appendChild(veil);
    root.classList.add('netherworld');
    const stop = petals(veil.querySelector('canvas'));
    const box = veil.querySelector('.nw-lines');
    const back = veil.querySelector('.nw-back');
    const card = veil.querySelector('.nw-card');
    const lines = G.lines(localParts(new Date(), 'Asia/Tokyo').mo); // 二人がいるのは京都なので、京都の今の月
    (async () => {
      for (let i = 0; i < lines.length; i++) {
        await sleep(REDUCE_MOTION ? 0 : i === 0 ? 1300 : 1900);
        if (!veil.isConnected || veil.classList.contains('nw-leave')) return;
        box.appendChild(chatLineEl(...lines[i]));
        card.scrollTop = card.scrollHeight;
      }
      back.classList.add('ready');
      card.scrollTop = card.scrollHeight;
    })();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    function close() {
      if (veil.classList.contains('nw-leave')) return;
      document.removeEventListener('keydown', onKey);
      veil.classList.add('nw-leave');
      root.classList.remove('netherworld');
      setTimeout(() => { stop(); veil.remove(); }, 900);
      try { localStorage.setItem(GRAVE_KEY, '1'); } catch (e) { /* noop */ }
      const grave = $('grave');
      if (grave) {
        grave.classList.add('rd-found'); // 見つけた印に、墓石に花びらが一枚残る
        grave.focus({ preventScroll: true });
      }
    }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', close);
    back.focus({ preventScroll: true });
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
      setTimeout(() => checkArrival(), 450);
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
      document.body.insertAdjacentHTML('afterbegin', `<p class="error-note wrap">${L.ui.astroLoadError}</p>`);
      return;
    }
    initBackground();
    const sel = $('loc-select');
    for (const l of window.LOCATIONS) sel.add(new Option(l.name, l.id));
    const id = initialLocationId();
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
    // 台詞のバージョン（原作寄り／旧版）
    applyTone(toneFromURL());
    document.querySelectorAll('.tone-switch button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tone === state.tone) return;
      applyTone(b.dataset.tone, { updateURL: true });
      if (state.summaries.length) talkAll();
      checkArrival();
    }));
    // 雑談：タップ（またはキー）で残りを一気に表示
    const log = $('chat-log');
    const showAll = () => { chat.fast = true; if (chat.wake) chat.wake(); };
    log.addEventListener('click', showAll);
    log.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAll(); } });
    const startWhenSeen = () => {
      chat.seen = true;
      if (chat.pending) { chat.pending = false; playChat(); }
    };
    // 二人が雑談のところまでおりてきたら始める（スマホは、雑談が画面に入ったら）
    let arrived = false;
    checkArrival = () => {
      if (arrived || !chatArrived()) return;
      arrived = true;
      document.documentElement.classList.add('chat-arrived');
      if (isStage()) { nudge('renko', 'hop', 700); nudge('maribel', 'hop', 700); }
      startWhenSeen();
    };
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; updateDrop(); checkArrival(); });
    }, { passive: true });
    window.addEventListener('resize', () => { updateDrop(); checkArrival(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => updateDrop()).observe($('stage'));
    const onStageChange = () => { placePortraits(); updateDrop(); checkArrival(); };
    if (stageMQ.addEventListener) stageMQ.addEventListener('change', onStageChange);
    else if (stageMQ.addListener) stageMQ.addListener(onStageChange);
    placePortraits();
    initGrave();
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
