/* =========================================================
 * English version — UI text and Renko & Mary's lines
 *  (英語版の文言と台詞。計算や描画は js/app.js)
 *  The dialogue functions get app.js helpers as `h`.
 * ========================================================= */
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const DIR_WORDS = {
    N: 'north', NNE: 'north-northeast', NE: 'northeast', ENE: 'east-northeast', E: 'east', ESE: 'east-southeast', SE: 'southeast', SSE: 'south-southeast',
    S: 'south', SSW: 'south-southwest', SW: 'southwest', WSW: 'west-southwest', W: 'west', WNW: 'west-northwest', NW: 'northwest', NNW: 'north-northwest',
  };
  const dirWord = (d) => DIR_WORDS[d] || d;

  const ampm = (h) => (h < 12 ? 'AM' : 'PM');
  const h12 = (h) => (h % 12) || 12;
  const hourWord = (h) => `${h12(h)} ${ampm(h)}`;                 // "10 PM"
  const hm = (h, mi) => `${h12(h)}:${pad(mi)} ${ampm(h)}`;         // "10:30 PM"
  const joinAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  // when: 'tonight' | 'tomorrow night' | 'on Nov 29'
  function whenWord(offset, info) {
    if (offset === 0) return 'tonight';
    if (offset === 1) return 'tomorrow night';
    return `on ${info.md}`;
  }
  const renkoLead = (when) => (when === 'tonight' ? "Tonight's sky……" : when === 'tomorrow night' ? "Tomorrow night's sky……" : `The sky ${when}……`);

  const MOON_PHASES = [
    [1.0, 'New Moon'], [6.4, 'Waxing Crescent'], [8.4, 'First Quarter'], [13.8, 'Waxing Gibbous'], [15.8, 'Full Moon'],
    [21.2, 'Waning Gibbous'], [23.2, 'Last Quarter'], [28.5, 'Waning Crescent'], [30, 'New Moon'],
  ];
  const moonName = (age) => (MOON_PHASES.find(([lim]) => age < lim) || MOON_PHASES[0])[1];
  // Old Japanese names for the nights after the full moon (Mary is a Kyoto student, after all)
  const MOON_JA = [
    [15.3, 16.3, 'In Kyoto we\'d call it izayoi — the moon that hesitates.'],
    [16.3, 17.3, 'In Japan it\'s tachimachi — the moon you wait for standing up.'],
    [17.3, 18.3, 'In Japan it\'s imachi — the moon you wait for sitting down.'],
    [18.3, 19.3, 'In Japan it\'s nemachi — the moon you wait for lying down.'],
  ];

  // Temperatures: °F for US cities (loc.f), °C everywhere else
  const temp = (c, loc) => (loc && loc.f ? `${Math.round((c * 9) / 5 + 32)}°F` : `${c}°C`);

  /* ---------------------------------------------------------
   * Renko's forecast
   * --------------------------------------------------------- */
  function renkoScript(sum, sky, offset, h) {
    const { state } = h;
    const when = h.whenWord(offset, sum.date);
    const lead = { text: renkoLead(when), cls: 'lead', speed: 60, pause: 700, expr: 'think' };
    if (state.weatherStatus === 'error') {
      return { expr: 'error', parts: [lead,
        { expr: 'error', text: '……Huh. The weather data isn\'t coming through. Did the line get cut on the other side of the barrier?' },
        { text: 'Mary can still show you where the stars and the moon are.' }] };
    }
    if (!sum.hasData) {
      return { expr: 'normal', parts: [lead, { expr: 'normal', text: '……That\'s too far ahead to read the clouds. Ask me again when it\'s closer.' }] };
    }
    const best = sum.best ? hourWord(sum.best.h) : '';
    let expr = 'normal';
    let verdict;
    if (sum.rain) {
      verdict = '……Rain. No stars, and my eyes are just eyes.';
      expr = 'rain';
    } else if (sum.lv === 5) {
      verdict = `……Clear. Not a single cloud. Best around ${best}. `
        + (offset === 0 ? 'Mary, you\'re not sleeping tonight.' : 'A moon tour costs a fortune, but this only costs a vending-machine coffee.');
      expr = 'great';
    } else if (sum.lv === 4) {
      verdict = `……Not bad. A few clouds drifting through, but it should open up around ${best}.`;
      expr = 'good';
    } else if (sum.lv === 3) {
      verdict = `……Half and half. Clouds and stars. We'll have to bet on a gap around ${best}.`;
    } else if (sum.lv === 2) {
      verdict = `……Lots of cloud. Maybe a break around ${best}, if we're lucky.`;
      expr = 'cloudy';
    } else {
      verdict = '……Overcast. No stars, and my clock stays stopped.';
      expr = 'cloudy';
    }
    const parts = [lead, { expr, text: verdict }];

    // Renko's habit: convert the best time into "real" time. Her eyes only read Japan Standard Time.
    if (sum.best && !sum.rain && sum.lv >= 2) {
      if (state.tz === 'Asia/Tokyo') {
        const diffMin = Math.round((state.loc.lon - 135) * 4);
        if (Math.abs(diffMin) >= 2) {
          const real = h.localParts(new Date(sum.best.t.getTime() - diffMin * 60000));
          const place = state.loc.id === 'here' ? 'here' : `in ${state.loc.name}`;
          parts.push({ text: `Strictly speaking, the true ${best} ${place} is ${hm(real.h, real.mi)}. We're ${diffMin > 0 ? 'east' : 'west'} of Akashi. ……Not that it matters. My eyes only read Japan Standard Time.` });
        }
      } else {
        const jst = h.localParts(sum.best.t, 'Asia/Tokyo');
        parts.push({ text: `……My eyes would read that as ${hm(jst.h, jst.mi)}, Japan Standard Time. Very useful out here.` });
      }
    }

    const m = sky.moon;
    if (sum.lv >= 3 && !sum.rain) {
      const setInNight = m.set && m.set > sky.dusk && m.set < sky.dawn;
      const riseInNight = m.rise && m.rise > sky.dusk && m.rise < sky.dawn;
      let ml = '';
      if (m.illum >= 0.75 && m.upFrac > 0.4) ml = 'The moon\'s bright, though. Forget the faint stars.';
      else if (m.upFrac < 0.15 || m.illum < 0.15) ml = 'No moon in the way, either. We should pick up the faint ones.';
      else if (setInNight && m.illum > 0.3) ml = `We wait until the moon sets at ${h.fmtHM(m.set, sum.date)}.`;
      else if (riseInNight && m.illum > 0.3) ml = `The moon comes up at ${h.fmtHM(m.rise, sum.date)}, so that's our window.`;
      if (ml) parts.push({ text: ml });
    }
    if (sum.tmin != null && !sum.rain && sum.lv >= 2) {
      if (sum.tmin <= 3) parts.push({ text: `It'll drop to ${temp(sum.tmin, state.loc)}. Bundle up.` });
      else if (sum.tmin <= 10) parts.push({ text: `About ${temp(sum.tmin, state.loc)}. You'll want a jacket.` });
    }
    return { expr, parts };
  }

  /* ---------------------------------------------------------
   * Mary's sky guide
   * --------------------------------------------------------- */
  function maryScript(sum, sky, offset, h) {
    const { state } = h;
    const when = h.whenWord(offset, sky.date);
    const parts = [{ text: `Renko, here's what we should see ${when}!`, cls: 'lead', speed: 40, pause: 400, expr: 'happy' }];
    const PLANET_NOTE = {
      Saturn: 'You can\'t see the rings without a telescope, though.',
      Jupiter: 'It\'s bright. You can\'t miss it.',
      Venus: 'It\'s almost dazzling.',
      Mars: 'It\'s reddish, so you\'ll know it.',
      Mercury: 'It\'s low, so you\'re lucky if you catch it.',
    };

    // planets → moon → constellation → meteor shower → (if cloudy) a parting word
    const vis = sky.planets.filter((p) => p.visible).sort((a, b) => a.mag - b.mag);
    const evening = vis.filter((p) => p.period === 'evening' || p.period === 'allnight');
    const late = vis.filter((p) => p.period === 'midnight' || p.period === 'late');
    const morning = vis.filter((p) => p.period === 'morning');
    if (evening.length) {
      const p = evening[0];
      let s = p.period === 'evening'
        ? `Once the sun's down, ${p.name} in the ${dirWord(p.bestDir)}. ${PLANET_NOTE[p.body] || ''}`
        : `${p.name} is up all night. It's highest around ${h.fmtHM(p.best.t, sky.date)}, in the ${dirWord(p.bestDir)}.`;
      const others = evening.slice(1).map((x) => x.name);
      if (others.length) s += ` ${joinAnd(others)} ${others.length > 1 ? 'are' : 'is'} out too.`;
      parts.push({ text: s.trim() });
    }
    if (late.length) {
      const names = joinAnd(late.map((p) => p.name));
      const start = h.fmtHM(late[0].start, sky.date);
      const rise = late.length > 1 ? 'rise' : 'rises';
      parts.push({ text: evening.length ? `Later on, ${names} ${rise} too. From about ${start}.` : `Around ${start}, ${names} ${rise}.` });
    }
    if (morning.length) {
      const names = joinAnd(morning.map((p) => p.name));
      parts.push({ text: evening.length || late.length
        ? `Before dawn, ${names}. If you can get up that early.`
        : `For planets, it's the early morning. ${names} in the ${dirWord(morning[0].bestDir)}. If you can get up that early.` });
    }

    const m = sky.moon;
    const setInNight = m.set && m.set > sky.dusk && m.set < sky.dawn;
    const riseInNight = m.rise && m.rise > sky.dusk && m.rise < sky.dawn;
    let ms = m.name === 'New Moon' ? 'It\'s a new moon.' : m.name === 'Full Moon' ? 'It\'s a full moon.' : `The moon's a ${m.name.toLowerCase()}.`;
    if (m.upFrac < 0.05) ms += ' It\'s down all night, so it won\'t get in the way.';
    else if (m.upFrac > 0.9) ms += ' It\'s up all night.';
    else if (m.upAtDusk && setInNight) ms += ` It sets at ${h.fmtHM(m.set, sky.date)}.`;
    else if (riseInNight) ms += ` It rises at ${h.fmtHM(m.rise, sky.date)}.`;
    const ja = MOON_JA.find(([a, b]) => m.age >= a && m.age < b);
    if (ja) ms += ` ${ja[2]}`;
    else if (m.illum > 0.9) ms += ' ……If it\'s reflected in a pond, I can see the other side too. Pretend you didn\'t hear that.';
    parts.push({ text: ms });

    const c = h.constellationsAt(h.atLocal(sky.date, 21 * 60), state.obs).find((x) => x.size >= 3 && x.id !== 'umi');
    if (c) parts.push({ text: `Around 9 PM, ${c.name} is ${c.alt > 72 ? 'right overhead' : `in the ${dirWord(c.dir)}`}. ${c.tip}` });

    let expr = 'happy';
    const shower = h.upcomingShowers(sky.date, 10)[0];
    if (shower && (shower.diff === 0 || shower.diff === 1)) {
      parts.push({ expr: 'excited', text: `And it's the peak night of the ${shower.name}.` });
      expr = 'excited';
    } else if (shower && shower.diff > 1) {
      parts.push({ text: `The ${shower.name} peak on ${h.dateInfo(shower.date).md}. Don't forget.` });
    }

    if (state.weatherStatus === 'ok' && sum.hasData && (sum.rain || sum.lv <= 2)) {
      parts.push({ expr: 'gentle', text: 'Even if the clouds hide them, the stars are still there. ……I can kind of see them anyway.' });
      expr = 'gentle';
    }
    return { expr, parts };
  }

  window.LOCATIONS = window.WORLD_LOCATIONS;
  window.DEFAULT_LOCATION = 'auto'; // pick the city closest to the visitor's time zone

  window.LANG = {
    code: 'en',
    tz: 'Asia/Tokyo',
    weatherModel: null,            // Open-Meteo "best match" for each place
    jma: false,                    // no Japan Meteorological Agency text
    storageKey: 'hifuu-starnavi:en:loc',

    wd: WD,
    dirs: DIRS,
    planets: { Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn' },
    periods: { evening: 'Evening', allnight: 'All night', midnight: 'Midnight', late: 'Late night', morning: 'Before dawn' },
    levels: {
      0: { label: 'No data', short: '—', stars: '' },
      5: { label: 'Full of stars', short: 'Starry', stars: '★★★★★' },
      4: { label: 'Clear view', short: 'Clear', stars: '★★★★☆' },
      3: { label: 'Stars between clouds', short: 'Patchy', stars: '★★★☆☆' },
      2: { label: 'Hard to see', short: 'Poor', stars: '★★☆☆☆' },
      1: { label: 'Clouded out', short: 'Cloudy', stars: '★☆☆☆☆' },
    },
    names: { renko: 'Renko Usami', maribel: 'Maribel Hearn' },
    short: { renko: 'Renko', maribel: 'Mary' },

    moonName,
    conName: (symbol, name) => name,
    fmtHM: (p) => hm(p.h, p.mi),
    md: (mo, d) => `${MON[mo - 1]} ${d}`,
    whenWord,
    tabLabel(offset, info) {
      if (offset === 0) return 'Tonight';
      if (offset === 1) return 'Tomorrow';
      return `${info.wd} ${info.md}`;
    },
    posText: (alt, dir) => (alt > 72 ? 'Nearly overhead' : `${dir} · ${Math.round(alt)}° up`),

    ui: {
      loading: 'Loading…',
      checkingClouds: 'Checking the clouds…',
      weatherError: 'Couldn\'t get the weather data',
      noForecast: 'No forecast yet',
      fetchFailed: 'Network error. Please reload in a little while.',
      noHourly: 'No hourly forecast for this night yet.',
      indexDate: (info, place) => `Night of ${info.wd}, ${info.md} · ${place}`,
      moon: 'Moon',
      factBest: 'Best time',
      factCloud: 'Cloud cover',
      factMoon: 'Moonlight',
      bestHour: (b) => `~${hourWord(b.h)}`,
      moonLight: { none: 'None', bright: 'Bright', normal: 'Moderate', weak: 'Faint' },
      hourLabel: (h) => `${h12(h)}${h < 12 ? 'am' : 'pm'}`,
      hourTitle: (x) => `${hourWord(x.h)} · index ${x.idx} · clouds ${x.w.cc}%${x.w.precip ? ` · rain ${x.w.precip} mm` : ''}`,
      tonight: 'Tonight',
      nationError: 'Couldn\'t load the forecast for other cities.',
      moonAge: 'Age (days)',
      moonRise: 'Moonrise',
      moonSet: 'Moonset',
      moonUpAtDusk: 'Up by dusk',
      nightTimes: 'Night hours',
      sunset: 'Sunset',
      starsOut: 'Stars come out',
      skyBrightens: 'Sky starts to brighten',
      sunrise: 'Sunrise',
      meteorMoon: ['◎ The moon won\'t interfere', '○ Some moonlight', '△ Bright moonlight'],
      meteorDays: (diff) => (diff < 0 ? '<span>Last night</span>' : diff === 0 ? '<span>Tonight</span>' : `${diff}<small>${diff === 1 ? 'day' : 'days'}</small>`),
      meteorSub: (md, radiant, zhr) => `Peaks around ${md} · radiant in ${radiant} · up to ~${zhr} an hour`,
      noMeteors: 'No major meteor showers in the next 60 days.',
      chartWhen: (info, label) => `The sky at ${label}, ${info.wd} ${info.md}`,
      constWhen: (label) => `around ${label}`,
      noConsts: 'The bright constellations are low at this hour.',
      planetMag: (mag, con) => `mag ${mag.toFixed(1)} · ${con}`,
      planetSpan: (label, s, e) => `<strong>${label}</strong> ${s} – ${e}`,
      planetBest: (t, dir, alt) => `Highest ~${t} · ${dir}, ${alt}° up`,
      noPlanets: 'No planets well placed this night.',
      planetsOff: (names) => `Not visible this night: ${names.join(', ')} (too close to the Sun)`,
      chatTopic: (info, title) => `${info.wd} ${info.md} — ${title}`,
      chatTapAll: 'Tap to show the rest',
      chatNext: (beforeSwitch, hour) => `Next chat: ${hour} AM, Kyoto time`,
      chatWaiting: 'Waiting for the two of them to get to the café…',
      renkoWaiting: renkoLead,
      geoUnsupported: 'This browser doesn\'t support location.',
      geoLocating: 'Locating…',
      here: 'My location',
      geoFailed: 'Couldn\'t get your location.',
      sidereal: (h, m, lat, lon) => `Local sidereal time ${h}h${pad(m)}m / ${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
      astroLoadError: 'Couldn\'t load the astronomy library. Please check your connection.',
    },

    // The gravestone at the very bottom of the page (an Easter egg after "Ghostly Field Club")
    grave: {
      label: 'An old gravestone',
      hints: [
        ['renko', '……Nothing happened.'],
        ['maribel', 'Things like this have a set hour. Ushimitsu, the dead of night. Two to two-thirty.'],
        ['renko', 'Try setting the star chart\'s clock to ushimitsu first, then turn it.'],
      ],
      title: 'The entrance to the Netherworld',
      place: 'Rendaino · Ushimitsu, the dead of night',
      lines: (month) => [
        ['maribel', 'surprise', '……Renko, look. The cherry trees are in bloom.'],
        ['renko', 'surprise', month === 3 || month === 4 ? '……Full bloom. In a graveyard, though.' : `In ${MONTHS[month - 1]}?`],
        ['maribel', 'eyes_closed', 'They\'re the cherry blossoms of the other side. ……The boundary\'s open.'],
        ['renko', 'panic', 'Hold on, I can\'t read the stars. ……This sky isn\'t on Japan Standard Time.'],
        ['maribel', 'smile', 'We shouldn\'t stay long. Let\'s go back, Renko.'],
      ],
      back: 'Go back',
    },

    tones: {
      hifuu: { label: 'Hifuu', renko: renkoScript, mary: maryScript, chat: true },
    },
  };
})();
