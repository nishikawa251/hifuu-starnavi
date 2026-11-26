# 秘封倶楽部の星空ナビ

宇佐見蓮子とマエリベリー・ハーンが星空を案内する、東方Project二次創作のWebサイトです。

- **蓮子の星空予報**: 「明日の星空は……」— 雲量から星空指数（0〜100）を出して、時間別・1週間・全国で表示
- **メリーの星空案内**: 「蓮子、明日はこんな星が見れるはずよ！」— 月齢、惑星、見ごろの星座、流星群、時刻を動かせる星図

ビルド不要の静的サイト（HTML / CSS / JavaScript だけ）です。

| ページ | URL |
|---|---|
| 日本語版 | https://nishikawa251.github.io/hifuu-starnavi/ |
| 英語版（海外版） | https://nishikawa251.github.io/hifuu-starnavi/en/ |

## 動かし方

`index.html` をブラウザで開くだけで動きます。
位置情報（「現在地」ボタン）を使う場合は、ローカルサーバー経由で開いてください。

```powershell
cd hifuu-starnavi
python -m http.server 8000
```

→ http://localhost:8000 を開く

GitHub Pages で公開しています（main ブランチのルートをそのまま配信）。

## 立ち絵

4riON 様の「霊長新益京」立ち絵素材を使っています。

- 宇佐見蓮子: https://seiga.nicovideo.jp/seiga/im11866135 （tachie.net: https://tachie.net/w/rJSGcln5nN ）
- マエリベリー・ハーン: https://seiga.nicovideo.jp/seiga/im11881275 （tachie.net: https://tachie.net/w/PLQMMckVgd ）

素材に同梱の表情差分PNGを、胸から上（3:4）に切り抜いて 360×480px に縮小したものだけを `img/` に置いています。
利用規約で再配布が禁止されているので、元のPNGやPSDはこのフォルダ（公開するリポジトリ）に入れないでください。

| ファイル | 元の表情 | 使う場面 |
|---|---|---|
| `img/renko/eyes_closed.png` | 目閉じ | 「明日の星空は……」と考えているとき |
| `img/renko/laugh.png` | 笑顔 | 満天の星 |
| `img/renko/smile.png` | 微笑 | よく見える・半々 |
| `img/renko/jitome.png` | ジト目 | 曇り |
| `img/renko/cry.png` | 泣き | 雨 |
| `img/renko/panic.png` | あたふた | 天気データが取れないとき |
| `img/maribel/laugh.png` | 笑顔 | 星の案内 |
| `img/maribel/smile.png` | 微笑 | 通常 |
| `img/maribel/surprise.png` | 驚き | 流星群の極大の夜 |
| `img/maribel/eyes_closed.png` | 目閉じ | 曇りの夜のひとこと |

`img/face/` は「部室の雑談」（二人の掛け合い）で使う顔アイコンで、表情差分PNGの顔の部分を 160×160px に切り抜いたものです。

`img/splash/renko.png` と `img/splash/maribel.png` は、オープニング用に立ち絵（微笑）の形だけを一色で塗りつぶしたシルエットです。

表情の割り当ては `js/config.js` の `CHARACTER_IMAGES` で変えられます。
クレジットは `index.html` のフッター（`id="credit-art"`）にあり、作者の希望に合わせてニコニコ静画のページにリンクしています。

## データの出どころ

| 内容 | 取得元 | メモ |
|---|---|---|
| 1時間ごとの雲量・降水・湿度・気温 | [Open-Meteo](https://open-meteo.com/)（日本語版は気象庁の MSM / GSM モデル、英語版はその土地に合ったモデル） | APIキー不要・CORS対応。非商用は無料、CC BY 4.0。時刻は UTC で受け取って、観察地のタイムゾーンに直している |
| 天気予報の文章・降水確率（日本語版のみ） | 気象庁 `https://www.jma.go.jp/bosai/forecast/data/forecast/{府県コード}.json` | 気象庁サイトが内部で使っているJSON。公式APIではないので、予告なく変わる可能性あり。表示時は「出典：気象庁ホームページ」 |
| 月・惑星・恒星の位置、日の出入り | [Astronomy Engine](https://github.com/cosinekitty/astronomy)（ブラウザ内で計算） | 外部APIなし |
| 星座線・流星群 | `js/skydata.js` に収録 | 流星群の極大日は年によって1日ほど前後します |

日本気象協会（tenki.jp）の「星空指数」は独自コンテンツなので使っていません。このサイトの星空指数は独自計算です。

- 下層雲・中層雲・上層雲を重ね合わせた「実効雲量」から指数を出す（薄い上層雲は少し軽く数える）
- 降水があれば指数を大きく下げる。湿度97%以上（霧・もや）でも少し下げる
- 夜の指数は、薄明が終わってから始まるまでの時間の平均

## 台詞のバージョン（見比べ用）

| URL | 台詞 |
|---|---|
| `https://nishikawa251.github.io/hifuu-starnavi/` | 原作寄り（今の版）。「部室の雑談」あり |
| `https://nishikawa251.github.io/hifuu-starnavi/?tone=classic` | 旧版（原作寄りに書き直す前）。「部室の雑談」なし |

ページ上部の「台詞　原作寄り／旧版」ボタンでも切り替えられ、URL も切り替わります（日本語版のみ）。
旧版の台詞は `js/lang-ja.js` の `renkoScriptClassic` / `maryScriptClassic` にあります。書き直す前の状態は git タグ `tone-classic` でも残しています。

## 部室の雑談

`js/chats.js` に1話ずつ入っていて、1日に1話だけ表示されます（日本時間の朝6時に次の話へ）。
話を足すときは、`window.CLUB_CHATS` に `{ title, lines: [[話す人, 表情, 台詞], ...] }` を追加するだけです。
英語版は `js/chats-en.js`。同じ順番に並べておくと、同じ日に同じ話が出ます（話を足すときは両方に足してください）。

広い画面（幅681px以上）では、蓮子とメリーの立ち絵がスクロールについてきます。
蓮子はメリーのパネルの裏を通っておりていき、二人が「部室の雑談」の左右まで来たら雑談が始まります。雑談中は、台詞に合わせて二人の立ち絵の表情も変わります。
スマホでは立ち絵は各パネルの中にあり、雑談は画面に入ったら始まります。

## 英語版（/en/）

`en/index.html` が英語版のページです。CSS・画像・`js/app.js` は日本語版と共通で、ことばだけ別のファイルにしています。

| ファイル | 中身 |
|---|---|
| `js/lang-en.js` | 画面の文言と、蓮子・メリーの台詞（英語） |
| `js/chats-en.js` | 部室の雑談（英語） |
| `js/skydata-en.js` | 星・星座・流星群の英語名と、星座のひとこと |
| `js/config.js` の `WORLD_LOCATIONS` | 世界26都市（`tz` はタイムゾーン、`f: true` は気温を °F で言う都市） |

- 最初に開く都市は、見に来た人のブラウザのタイムゾーンに近い都市（同じタイムゾーンの都市があればそこ）
- 時刻はその都市の時刻（12時間制）。蓮子は「私の目で読むと日本標準時の○時」と言う（蓮子の目は日本標準時しか読めないので）
- 気象庁の予報文は出しません
- 南半球の都市のために、南十字星・ケンタウルス座・マゼラン雲を星図に入れています（日本語版でも沖縄の低い空などに出ます）

## イースターエッグ（ネタバレ）

<details>
<summary>開くとネタバレ</summary>

ページのいちばん下の地面（蓮台野）に墓石が3つあり、いちばん右の墓石はドラッグ（タップなら90度ずつ）で回せます。
一回転させると、丑三つ時（2:00〜2:30）なら冥界の入口が開いて、桜が舞い、二人が少し話します。
丑三つ時かどうかは「観察地の今の時刻」か「メリーの星図のスライダーの時刻」のどちらかで判定します。
丑三つ時以外に回すと、蓮子とメリーがヒントをくれます（3回目で「星図の時計を合わせてみたら？」）。
一度開くと、墓石の上に花びらが一枚残ります（ブラウザに記録）。

台詞は `js/lang-ja.js` / `js/lang-en.js` の `grave`、動きは `js/app.js` の「蓮台野の墓石」のところです。
</details>

## ファイル構成

```
index.html         日本語版のページ
en/index.html      英語版のページ
css/style.css      デザイン（日本語版・英語版で共通）
js/config.js       立ち絵のファイル名・観察地（ここを書き換えればカスタマイズできる）
js/skydata.js      恒星・星座線・流星群のデータ
js/skydata-en.js   その英語名
js/chats.js        部室の雑談（1日1話）
js/chats-en.js     その英語版
js/lang-ja.js      日本語版の文言と台詞（蓮子・メリーのセリフはここ）
js/lang-en.js      英語版の文言と台詞
js/app.js          データ取得、指数計算、天体計算、星図、演出（言語に関係ない部分）
img/               立ち絵を置く場所
```

## 注意

本サイトは東方Project（上海アリス幻樂団）の二次創作で、公式とは関係ありません。
[東方Projectの二次創作ガイドライン](https://touhou-project.news/guideline/) に沿って公開してください。
