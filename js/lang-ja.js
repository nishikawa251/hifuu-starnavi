/* =========================================================
 * 日本語版のことば — 画面の文言と、蓮子・メリーの台詞
 *  計算や描画は js/app.js。ここは「何と言うか」だけ。
 *  台詞の関数には、app.js の道具（時刻の書き方など）が h として渡されます。
 * ========================================================= */
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  // セリフ用の時刻の言い方（夜中の2時、明け方の4時 …）
  const hourWord = (h) => (h >= 18 ? `${h}時` : h <= 3 ? `夜中の${h}時` : `明け方の${h}時`);

  function whenWord(offset, info) {
    if (offset === 0) return '今夜';
    if (offset === 1) return '明日';
    if (offset === 2) return 'あさって';
    return `${info.mo}月${info.d}日`;
  }

  const MOON_NAMES = [
    [0.8, '新月'], [2.0, '繊月'], [3.5, '三日月'], [6.2, '夕月'], [8.6, '上弦の月'], [10.6, '十日夜の月'],
    [12.6, '十三夜月'], [13.8, '小望月'], [15.3, '満月'], [16.3, '十六夜'], [17.3, '立待月'], [18.3, '居待月'],
    [19.3, '寝待月'], [20.6, '更待月'], [23.6, '下弦の月'], [27.0, '有明月'], [28.9, '晦日月'], [30, '新月'],
  ];

  /* ---------------------------------------------------------
   * 台詞（原作寄り）
   * --------------------------------------------------------- */
  function renkoScript(sum, sky, offset, h) {
    const { state } = h;
    const when = h.whenWord(offset, sum.date);
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
      if (state.tz === 'Asia/Tokyo') {
        const diffMin = Math.round((state.loc.lon - 135) * 4);
        if (Math.abs(diffMin) >= 2) {
          const real = h.localParts(new Date(sum.best.t.getTime() - diffMin * 60000));
          const place = state.loc.id === 'here' ? 'ここ' : state.loc.name;
          parts.push({ text: `厳密には、${place}の本当の${sum.best.h}時は${real.h}時${pad(real.mi)}分。明石より${diffMin > 0 ? '東' : '西'}だから。……まあ、私の目が読めるのは日本標準時だけで、それ以外は能力外なんだけど。` });
        }
      } else {
        // 日本の外にいるとき：蓮子の目が読めるのは日本標準時だけ
        const jst = h.localParts(sum.best.t, 'Asia/Tokyo');
        parts.push({ text: `……私の目で読むと、その時刻は日本標準時の${jst.h}時${pad(jst.mi)}分。ここじゃ何の役にも立たないけど。` });
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
      else if (setInNight && m.illum > 0.3) ml = `月が${h.fmtHM(m.set, sum.date)}に沈むまでは我慢ね。`;
      else if (riseInNight && m.illum > 0.3) ml = `${h.fmtHM(m.rise, sum.date)}に月が昇ってくるから、それまでが勝負。`;
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

  function maryScript(sum, sky, offset, h) {
    const { state } = h;
    const when = h.whenWord(offset, sky.date);
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
    const evening = vis.filter((p) => p.period === 'evening' || p.period === 'allnight');
    const late = vis.filter((p) => p.period === 'midnight' || p.period === 'late');
    const morning = vis.filter((p) => p.period === 'morning');
    if (evening.length) {
      const p = evening[0];
      let s = p.period === 'evening'
        ? `日が暮れたら${p.bestDir}の空に${p.name}。${PLANET_NOTE[p.name] || ''}`
        : `${p.name}は一晩中出てるわ。${h.fmtHM(p.best.t, sky.date)}ごろ、${p.bestDir}の空でいちばん高くなる。`;
      const others = evening.slice(1).map((x) => x.name);
      if (others.length) s += `${others.join('と')}もいるわよ。`;
      parts.push({ text: s });
    }
    if (late.length) {
      const names = late.map((p) => p.name).join('と');
      const start = h.fmtHM(late[0].start, sky.date);
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
    else if (m.upAtDusk && setInNight) ms += `${h.fmtHM(m.set, sky.date)}に沈む。`;
    else if (riseInNight) ms += `${h.fmtHM(m.rise, sky.date)}に昇ってくる。`;
    if (m.illum > 0.9) ms += '……池に映った月なら、向こう側も見えるんだけど。今のは聞かなかったことにして。';
    parts.push({ text: ms });

    const c = h.constellationsAt(h.atLocal(sky.date, 21 * 60), state.obs).find((x) => x.size >= 3 && x.id !== 'umi');
    if (c) parts.push({ text: `21時ごろは${c.name}が${c.alt > 72 ? '頭の真上' : `${c.dir}の空`}。${c.tip}` });

    let expr = 'happy';
    const shower = h.upcomingShowers(sky.date, 10)[0];
    if (shower && (shower.diff === 0 || shower.diff === 1)) {
      parts.push({ expr: 'excited', text: `しかも${shower.name}の極大の夜よ。` });
      expr = 'excited';
    } else if (shower && shower.diff > 1) {
      parts.push({ text: `${h.dateInfo(shower.date).md}は${shower.name}の極大。忘れないでね。` });
    }

    if (state.weatherStatus === 'ok' && sum.hasData && (sum.rain || sum.lv <= 2)) {
      parts.push({ expr: 'gentle', text: '雲で見えなくても、星はそこにあるわよ。……私には、ちょっと見えちゃってるけど。' });
      expr = 'gentle';
    }
    return { expr, parts };
  }

  /* ---------------------------------------------------------
   * 旧版の台詞（比較用に残しているもの。?tone=classic で表示）
   *  原作寄りに書き直す前の、丁寧でたっぷり喋るバージョン
   * --------------------------------------------------------- */
  function renkoScriptClassic(sum, sky, offset, h) {
    const { state } = h;
    const when = h.whenWord(offset, sum.date);
    const lead = { text: `${when}の星空は……`, cls: 'lead', speed: 70, pause: 700, expr: 'think' };
    if (state.weatherStatus === 'error') {
      return { expr: 'error', parts: [lead, { expr: 'error', text: '……あれ？ 天気のデータが届かないわ。結界の向こうで通信が途切れたのかしら。星と月の位置なら、メリーが案内してくれるはずよ。' }] };
    }
    if (!sum.hasData) {
      return { expr: 'normal', parts: [lead, { expr: 'normal', text: '……そこまで先の雲は、さすがにまだ読めないわね。もう少し近くなったらまた聞いて。' }] };
    }
    const best = sum.best ? hourWord(sum.best.h) : '';
    const lines = [];
    let expr = 'normal';
    if (sum.rain) {
      lines.push(`……雨が降りそう。${offset === 0 ? '今夜' : 'その日'}は部室で星図を広げましょうか。`);
      expr = 'rain';
    } else if (sum.lv === 5) {
      lines.push(`……満天の星ね！ 雲はほとんどなし。いちばんの狙い目は${best}ごろよ。`);
      lines.push(offset === 0 ? 'メリー、今夜は徹夜で観測しましょう。' : 'メリー、今のうちに観測の準備をしておいて。');
      expr = 'great';
    } else if (sum.lv === 4) {
      lines.push(`……なかなか良さそうよ。ときどき雲が流れるけど、${best}ごろがいちばん見やすいわ。`);
      expr = 'good';
    } else if (sum.lv === 3) {
      lines.push(`……雲と星が半々ってところね。${best}ごろの晴れ間に賭けてみましょう。`);
    } else if (sum.lv === 2) {
      lines.push(`……うーん、雲が多いわね。${best}ごろに少し切れ間が出るかもしれないけど。`);
      expr = 'cloudy';
    } else {
      lines.push('……残念、ほとんど曇りね。星が見えないと、私の時計も止まったままだわ。');
      expr = 'cloudy';
    }
    const parts = [lead, { expr, text: lines.join('') }];
    const m = sky.moon;
    if (sum.lv >= 3 && !sum.rain) {
      const setInNight = m.set && m.set > sky.dusk && m.set < sky.dawn;
      const riseInNight = m.rise && m.rise > sky.dusk && m.rise < sky.dawn;
      let ml = '';
      if (m.illum >= 0.75 && m.upFrac > 0.4) ml = `ただ、${m.name}が明るいから、暗い星は見えにくいかも。`;
      else if (m.upFrac < 0.15 || m.illum < 0.15) ml = '月明かりの邪魔もないから、暗い星までよく見えるはずよ。';
      else if (setInNight && m.illum > 0.3) ml = `月が${h.fmtHM(m.set, sum.date)}に沈んだあとが勝負ね。`;
      else if (riseInNight && m.illum > 0.3) ml = `${h.fmtHM(m.rise, sum.date)}に月が昇ってくるまでが勝負ね。`;
      if (ml) parts.push({ text: ml });
    }
    const jmaText = state.jma?.text?.[sum.date];
    if (jmaText) parts.push({ text: `気象庁の予報だと「${jmaText}」だって。` });
    if (sum.tmin != null && !sum.rain && sum.lv >= 2) {
      if (sum.tmin <= 3) parts.push({ text: `夜は${sum.tmin}℃くらいまで冷えるから、しっかり着込んできてね。` });
      else if (sum.tmin <= 10) parts.push({ text: `${sum.tmin}℃くらいまで下がるから、上着を忘れずに。` });
    }
    return { expr, parts };
  }

  function maryScriptClassic(sum, sky, offset, h) {
    const { state } = h;
    const when = h.whenWord(offset, sky.date);
    const parts = [{ text: `蓮子、${when}はこんな星が見れるはずよ！`, cls: 'lead', speed: 45, pause: 400, expr: 'happy' }];
    const magWord = (mag) => (mag <= -3 ? 'ひときわ明るく' : mag <= -1.5 ? 'とても明るく' : mag <= 0.5 ? '明るく' : '');
    const vis = sky.planets.filter((p) => p.visible).sort((a, b) => a.mag - b.mag);
    const evening = vis.filter((p) => p.period === 'evening' || p.period === 'allnight');
    const late = vis.filter((p) => p.period === 'midnight' || p.period === 'late');
    const morning = vis.filter((p) => p.period === 'morning');
    if (evening.length) {
      const p = evening[0];
      const mw = magWord(p.mag);
      let s = p.period === 'evening'
        ? `日が暮れたら${p.bestDir}の空を見て。${p.constellation}のあたりで、${p.name}が${mw}輝いているわ。`
        : `${p.name}が一晩中見えるわ。${h.fmtHM(p.best.t, sky.date)}ごろ、${p.bestDir}の空で${mw}輝いているはずよ（${p.constellation}）。`;
      const others = evening.slice(1).map((x) => x.name);
      if (others.length) s += `${others.join('、')}も見えるわね。`;
      parts.push({ text: s });
    }
    if (late.length) {
      const names = late.map((p) => p.name).join('と');
      parts.push({ text: evening.length
        ? `夜が更けると、${names}も昇ってくるわ。${h.fmtHM(late[0].start, sky.date)}ごろからね。`
        : `${h.fmtHM(late[0].start, sky.date)}ごろになると、${names}が昇ってくるわ（${late[0].constellation}）。` });
    }
    if (morning.length) {
      const names = morning.map((p) => (p.mag <= -3 ? `ひときわ明るい${p.name}` : p.name)).join('、');
      parts.push({ text: evening.length || late.length
        ? `早起きするなら、明け方の空に${names}も並ぶわよ。`
        : `惑星を見るなら明け方ね。${morning[0].bestDir}の空に${names}が見えるわ。` });
    }
    const m = sky.moon;
    const setInNight = m.set && m.set > sky.dusk && m.set < sky.dawn;
    const riseInNight = m.rise && m.rise > sky.dusk && m.rise < sky.dawn;
    let ms = `月は${m.name}（月齢${m.age.toFixed(1)}）。`;
    if (m.upFrac < 0.05) ms += '夜のあいだは沈んでいるから、星を見るには絶好ね。';
    else if (m.upFrac > 0.9) ms += '一晩中、空にいるわね。';
    else if (m.upAtDusk && setInNight) ms += `${h.fmtHM(m.set, sky.date)}に沈むわ。`;
    else if (riseInNight) ms += `${h.fmtHM(m.rise, sky.date)}に昇ってくるわ。`;
    parts.push({ text: ms });
    const c = h.constellationsAt(h.atLocal(sky.date, 21 * 60), state.obs).find((x) => x.size >= 3 && x.id !== 'umi');
    if (c) parts.push({ text: `21時ごろは${c.name}が${c.alt > 72 ? '頭の真上あたり' : `${c.dir}の空`}に見えるわ。${c.tip}` });
    let expr = 'happy';
    const shower = h.upcomingShowers(sky.date, 10)[0];
    if (shower && (shower.diff === 0 || shower.diff === 1)) {
      parts.push({ expr: 'excited', text: `しかも${shower.name}の極大の夜よ！ 流れ星、いくつ数えられるかしら。` });
      expr = 'excited';
    } else if (shower && shower.diff > 1) {
      parts.push({ text: `それと、${h.dateInfo(shower.date).md}は${shower.name}の極大よ。覚えておいてね。` });
    }
    if (state.weatherStatus === 'ok' && sum.hasData && (sum.rain || sum.lv <= 2)) {
      parts.push({ expr: 'gentle', text: '……雲で隠れちゃっても、星はちゃんとそこにあるのよ。私の目には、ちょっとだけ見えちゃうけど。' });
      expr = 'gentle';
    }
    return { expr, parts };
  }

  window.LANG = {
    code: 'ja',
    tz: 'Asia/Tokyo',              // 観察地の標準のタイムゾーン
    weatherModel: 'jma_seamless',  // Open-Meteo のモデル（気象庁 MSM / GSM）。取れなければ標準モデル
    jma: true,                     // 気象庁の予報文を出す
    storageKey: 'hifuu-starnavi:loc',

    wd: WD,
    dirs: ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'],
    planets: { Mercury: '水星', Venus: '金星', Mars: '火星', Jupiter: '木星', Saturn: '土星' },
    periods: { evening: '宵の空', allnight: '一晩中', midnight: '夜半', late: '夜半〜明け方', morning: '明け方の空' },
    levels: {
      0: { label: 'データなし', short: '—', stars: '' },
      5: { label: '満天の星', short: '満天', stars: '★★★★★' },
      4: { label: 'よく見える', short: 'よく見える', stars: '★★★★☆' },
      3: { label: '雲の合間に見える', short: '雲の合間', stars: '★★★☆☆' },
      2: { label: '見えにくい', short: '見えにくい', stars: '★★☆☆☆' },
      1: { label: '見えない', short: '見えない', stars: '★☆☆☆☆' },
    },
    names: { renko: '宇佐見蓮子', maribel: 'マエリベリー・ハーン' },
    short: { renko: '蓮子', maribel: 'メリー' },

    moonName: (age) => (MOON_NAMES.find(([lim]) => age < lim) || MOON_NAMES[0])[1],
    conName: (symbol, name) => window.CONSTELLATION_JA[symbol] || `${name}座`,
    fmtHM: (p, next) => `${next ? '翌' : ''}${p.h}:${pad(p.mi)}`,
    md: (mo, d) => `${mo}/${d}`,
    whenWord,
    tabLabel(offset, info) {
      if (offset === 0) return '今夜';
      if (offset === 1) return '明日の夜';
      return `${info.md}（${info.wd}）`;
    },
    posText: (alt, dir) => (alt > 72 ? '頭の真上あたり' : `${dir}の空・高さ${Math.round(alt)}°`),

    ui: {
      loading: '読み込み中…',
      checkingClouds: '雲の様子を調べています…',
      weatherError: '天気データを取得できませんでした',
      noForecast: 'まだ予報がありません',
      fetchFailed: '通信に失敗しました。時間をおいて再読み込みしてください。',
      noHourly: 'この日の時間別予報はまだありません。',
      indexDate: (info, place) => `${info.md}（${info.wd}）の夜 ・ ${place}`,
      moon: '月',
      factBest: '狙い目',
      factCloud: '雲の量',
      factMoon: '月明かり',
      bestHour: (b) => `${b.morning ? '翌' : ''}${b.h}時ごろ`,
      moonLight: { none: 'なし', bright: '明るい', normal: 'ふつう', weak: '弱い' },
      hourLabel: (h) => `${h}時`,
      hourTitle: (x) => `${x.h}時 星空指数${x.idx} 雲量${x.w.cc}%${x.w.precip ? ` 降水${x.w.precip}mm` : ''}`,
      tonight: '今夜',
      nationError: '全国のデータを取得できませんでした。',
      moonAge: '月齢',
      moonRise: '月の出',
      moonSet: '月の入',
      moonUpAtDusk: '夕方にはもう空に',
      nightTimes: '夜の時間',
      sunset: '日の入',
      starsOut: '星が見えはじめる',
      skyBrightens: '空が白みはじめる',
      sunrise: '日の出',
      meteorMoon: ['◎ 月明かりの影響なし', '○ 月明かりがやや邪魔', '△ 月明かりが強い'],
      meteorDays: (diff) => (diff < 0 ? '<span>昨夜</span>' : diff === 0 ? '<span>今夜</span>' : `${diff}<small>日後</small>`),
      meteorSub: (md, radiant, zhr) => `${md} ごろ極大 ・ 放射点 ${radiant} ・ 1時間に最大${zhr}個ほど`,
      noMeteors: '60日以内に大きな流星群はありません。',
      chartWhen: (info, label) => `${info.md}（${info.wd}） ${label} の空`,
      constWhen: (label) => `${label}ごろ`,
      noConsts: 'この時刻は明るい星座が低い位置にあります。',
      planetMag: (mag, con) => `${mag.toFixed(1)}等・${con}`,
      planetSpan: (label, s, e) => `<strong>${label}</strong> ${s}〜${e}`,
      planetBest: (t, dir, alt) => `${t}ごろ ${dir}の空・高さ${alt}°`,
      noPlanets: 'この夜に見やすい惑星はありません。',
      planetsOff: (names) => `この夜は見えない: ${names.join('、')}（太陽に近い位置）`,
      chatTopic: (info, title) => `${info.md}（${info.wd}）の話題：${title}`,
      chatTapAll: 'タップで最後まで表示',
      chatNext: (beforeSwitch, hour) => `次の雑談は、${beforeSwitch ? '今朝' : '明日の朝'}${hour}時に`,
      chatWaiting: '二人が部室に来るのを待っています…',
      renkoWaiting: (when) => `${when}の星空は……`,
      geoUnsupported: 'このブラウザは位置情報に対応していません。',
      geoLocating: '測位中…',
      here: '現在地',
      geoFailed: '位置情報を取得できませんでした。',
      sidereal: (h, m, lat, lon) => `地方恒星時 ${h}h${pad(m)}m ／ ${lat >= 0 ? '北緯' : '南緯'}${Math.abs(lat).toFixed(2)}° ${lon >= 0 ? '東経' : '西経'}${Math.abs(lon).toFixed(2)}°`,
      astroLoadError: '天体計算ライブラリを読み込めませんでした。ネットワークを確認してください。',
      // 気象庁の予報文の行
      jmaLoading: '気象庁の予報を確認中…',
      jmaError: '気象庁の予報文は取得できませんでした。',
      jmaNear: (name) => `（最寄りの予報区: ${name}）`,
      jmaTooFar: (near) => `気象庁の予報文は3日先までです。${near}`,
      jmaLine: (office, area, near, text, pops) => `気象庁 ${office}（${area}）${near}: <strong>${text}</strong>${pops ? `<br>降水確率 ${pops}` : ''}`,
      jmaPops: (p1, p2) => [p1 != null ? `18-24時 ${p1}%` : null, p2 != null ? `0-6時 ${p2}%` : null].filter(Boolean).join(' / '),
    },

    // ページのいちばん下の墓石（蓮台野夜行にちなんだイースターエッグ）
    grave: {
      label: '古い墓石',
      // 丑三つ時以外に一回転させたときのひとこと（回すたびに次へ）
      hints: [
        ['renko', '……何も起きないわね'],
        ['maribel', 'こういうのは、時間が決まってるのよ。丑三つ時とか'],
        ['renko', '星図の時計を、丑三つ時に合わせてから回してみたら？'],
      ],
      title: '冥界の入口',
      place: '蓮台野 ・ 丑三つ時',
      // month は京都（日本時間）の今の月
      lines: (month) => [
        ['maribel', 'surprise', '……蓮子、見て。桜が咲いてる'],
        ['renko', 'surprise', month === 3 || month === 4 ? '……満開ね。ここ、墓地だけど' : `${month}月よ？`],
        ['maribel', 'eyes_closed', '向こう側の桜よ。……境界が、開いちゃったみたい'],
        ['renko', 'panic', '待って、星が読めない。……この空、日本標準時じゃないわ'],
        ['maribel', 'smile', '長居はしないほうがよさそうね。戻りましょう、蓮子'],
      ],
      back: '戻る',
    },

    // 台詞のバージョン（URL の ?tone= で指定。リンクを共有して見比べられる）
    tones: {
      hifuu: { label: '原作寄り', renko: renkoScript, mary: maryScript, chat: true },
      classic: { label: '旧版', renko: renkoScriptClassic, mary: maryScriptClassic, chat: false },
    },
  };
})();
