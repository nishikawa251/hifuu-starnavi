/* =========================================================
 * 設定ファイル — 画像や観察地はここを書き換えればOK
 * ========================================================= */

/*
 * 立ち絵の画像
 *  素材: 4riON 様「宇佐見蓮子／マエリベリー・ハーン（霊長新益京）立ち絵素材」
 *        （ニコニコ静画 im11866135 / im11881275、tachie.net でも配布）
 *  同梱の表情差分PNGを、胸から上に切り抜いて縮小したものを img/ に置いています。
 *  素材の利用規約（再配布禁止など）に従い、元のPNGやPSDはサイトに置かないでください。
 *
 *  場面ごとの表情。見つからないファイルは normal に、normal も無ければ仮のイラストになります。
 */
window.CHARACTER_IMAGES = {
  renko: {
    normal: 'img/renko/smile.png',        // 微笑
    think:  'img/renko/eyes_closed.png',  // 目閉じ（「明日の星空は……」と考えているとき）
    great:  'img/renko/laugh.png',        // 笑顔（満天の星）
    good:   'img/renko/smile.png',        // 微笑（よく見える）
    cloudy: 'img/renko/jitome.png',       // ジト目（曇り）
    rain:   'img/renko/cry.png',          // 泣き（雨）
    error:  'img/renko/panic.png',        // あたふた（データが取れないとき）
  },
  maribel: {
    normal:  'img/maribel/smile.png',       // 微笑
    happy:   'img/maribel/laugh.png',       // 笑顔（星の案内中）
    excited: 'img/maribel/surprise.png',    // 驚き（流星群の極大の夜）
    gentle:  'img/maribel/eyes_closed.png', // 目閉じ（曇りの夜のひとこと）
  },
};

/*
 * 立ち絵の切り抜き位置（画像は切り抜き済みなので、通常はこのままでOK）
 *  zoom: 拡大率（1 = 枠の幅にぴったり）
 *  y:    上端からの位置（0% = 頭のてっぺん）
 */
window.PORTRAIT_CROP = {
  renko:   { zoom: 1.0, y: '0%' },
  maribel: { zoom: 1.0, y: '0%' },
};

/*
 * 観察地（jma は気象庁の府県予報区コード）
 *  京都が初期値 — 秘封倶楽部の本拠地なので。
 */
window.LOCATIONS = [
  { id: 'sapporo',   name: '札幌',   lat: 43.0621, lon: 141.3544, jma: '016000' },
  { id: 'sendai',    name: '仙台',   lat: 38.2682, lon: 140.8694, jma: '040000' },
  { id: 'tokyo',     name: '東京',   lat: 35.6895, lon: 139.6917, jma: '130000' },
  { id: 'nagano',    name: '長野',   lat: 36.6513, lon: 138.1810, jma: '200000' },
  { id: 'nagoya',    name: '名古屋', lat: 35.1815, lon: 136.9066, jma: '230000' },
  { id: 'kyoto',     name: '京都',   lat: 35.0116, lon: 135.7681, jma: '260000' },
  { id: 'osaka',     name: '大阪',   lat: 34.6937, lon: 135.5023, jma: '270000' },
  { id: 'hiroshima', name: '広島',   lat: 34.3853, lon: 132.4553, jma: '340000' },
  { id: 'kochi',     name: '高知',   lat: 33.5597, lon: 133.5311, jma: '390000' },
  { id: 'fukuoka',   name: '福岡',   lat: 33.5902, lon: 130.4017, jma: '400000' },
  { id: 'kagoshima', name: '鹿児島', lat: 31.5966, lon: 130.5571, jma: '460100' },
  { id: 'naha',      name: '那覇',   lat: 26.2124, lon: 127.6809, jma: '471000' },
];
window.DEFAULT_LOCATION = 'kyoto';
