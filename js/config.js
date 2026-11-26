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

/*
 * 英語版（/en/）の観察地（tz はタイムゾーン、f: true は気温を °F で言う都市）
 *  英語版は、見に来た人のタイムゾーンにいちばん近い都市を最初に開きます。
 */
window.WORLD_LOCATIONS = [
  { id: 'kyoto',      name: 'Kyoto',       lat: 35.0116,  lon: 135.7681,  tz: 'Asia/Tokyo' },
  { id: 'tokyo',      name: 'Tokyo',       lat: 35.6895,  lon: 139.6917,  tz: 'Asia/Tokyo' },
  { id: 'seoul',      name: 'Seoul',       lat: 37.5665,  lon: 126.9780,  tz: 'Asia/Seoul' },
  { id: 'shanghai',   name: 'Shanghai',    lat: 31.2304,  lon: 121.4737,  tz: 'Asia/Shanghai' },
  { id: 'taipei',     name: 'Taipei',      lat: 25.0330,  lon: 121.5654,  tz: 'Asia/Taipei' },
  { id: 'hongkong',   name: 'Hong Kong',   lat: 22.3193,  lon: 114.1694,  tz: 'Asia/Hong_Kong' },
  { id: 'manila',     name: 'Manila',      lat: 14.5995,  lon: 120.9842,  tz: 'Asia/Manila' },
  { id: 'singapore',  name: 'Singapore',   lat: 1.3521,   lon: 103.8198,  tz: 'Asia/Singapore' },
  { id: 'bangkok',    name: 'Bangkok',     lat: 13.7563,  lon: 100.5018,  tz: 'Asia/Bangkok' },
  { id: 'sydney',     name: 'Sydney',      lat: -33.8688, lon: 151.2093,  tz: 'Australia/Sydney' },
  { id: 'auckland',   name: 'Auckland',    lat: -36.8485, lon: 174.7633,  tz: 'Pacific/Auckland' },
  { id: 'delhi',      name: 'New Delhi',   lat: 28.6139,  lon: 77.2090,   tz: 'Asia/Kolkata' },
  { id: 'dubai',      name: 'Dubai',       lat: 25.2048,  lon: 55.2708,   tz: 'Asia/Dubai' },
  { id: 'moscow',     name: 'Moscow',      lat: 55.7558,  lon: 37.6173,   tz: 'Europe/Moscow' },
  { id: 'berlin',     name: 'Berlin',      lat: 52.5200,  lon: 13.4050,   tz: 'Europe/Berlin' },
  { id: 'paris',      name: 'Paris',       lat: 48.8566,  lon: 2.3522,    tz: 'Europe/Paris' },
  { id: 'london',     name: 'London',      lat: 51.5074,  lon: -0.1278,   tz: 'Europe/London' },
  { id: 'newyork',    name: 'New York',    lat: 40.7128,  lon: -74.0060,  tz: 'America/New_York', f: true },
  { id: 'toronto',    name: 'Toronto',     lat: 43.6532,  lon: -79.3832,  tz: 'America/Toronto' },
  { id: 'chicago',    name: 'Chicago',     lat: 41.8781,  lon: -87.6298,  tz: 'America/Chicago', f: true },
  { id: 'denver',     name: 'Denver',      lat: 39.7392,  lon: -104.9903, tz: 'America/Denver', f: true },
  { id: 'losangeles', name: 'Los Angeles', lat: 34.0522,  lon: -118.2437, tz: 'America/Los_Angeles', f: true },
  { id: 'vancouver',  name: 'Vancouver',   lat: 49.2827,  lon: -123.1207, tz: 'America/Vancouver' },
  { id: 'mexicocity', name: 'Mexico City', lat: 19.4326,  lon: -99.1332,  tz: 'America/Mexico_City' },
  { id: 'saopaulo',   name: 'São Paulo',   lat: -23.5505, lon: -46.6333,  tz: 'America/Sao_Paulo' },
  { id: 'honolulu',   name: 'Honolulu',    lat: 21.3069,  lon: -157.8583, tz: 'Pacific/Honolulu', f: true },
];
