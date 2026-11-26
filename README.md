# 秘封倶楽部の星空ナビ

宇佐見蓮子とマエリベリー・ハーンが星空を案内する、東方Project二次創作のWebサイトです。

- **蓮子の星空予報**: 「明日の星空は……」— 雲量から星空指数（0〜100）を出して、時間別・1週間・全国で表示
- **メリーの星空案内**: 「蓮子、明日はこんな星が見れるはずよ！」— 月齢、惑星、見ごろの星座、流星群、時刻を動かせる星図

ビルド不要の静的サイト（HTML / CSS / JavaScript だけ）です。

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
| 1時間ごとの雲量・降水・湿度・気温 | [Open-Meteo](https://open-meteo.com/)（気象庁の MSM / GSM モデル） | APIキー不要・CORS対応。非商用は無料、CC BY 4.0 |
| 天気予報の文章・降水確率 | 気象庁 `https://www.jma.go.jp/bosai/forecast/data/forecast/{府県コード}.json` | 気象庁サイトが内部で使っているJSON。公式APIではないので、予告なく変わる可能性あり。表示時は「出典：気象庁ホームページ」 |
| 月・惑星・恒星の位置、日の出入り | [Astronomy Engine](https://github.com/cosinekitty/astronomy)（ブラウザ内で計算） | 外部APIなし |
| 星座線・流星群 | `js/skydata.js` に収録 | 流星群の極大日は年によって1日ほど前後します |

日本気象協会（tenki.jp）の「星空指数」は独自コンテンツなので使っていません。このサイトの星空指数は独自計算です。

- 下層雲・中層雲・上層雲を重ね合わせた「実効雲量」から指数を出す（薄い上層雲は少し軽く数える）
- 降水があれば指数を大きく下げる。湿度97%以上（霧・もや）でも少し下げる
- 夜の指数は、薄明が終わってから始まるまでの時間の平均

## ファイル構成

```
index.html       ページ本体
css/style.css    デザイン
js/config.js     立ち絵のファイル名・観察地（ここを書き換えればカスタマイズできる）
js/skydata.js    恒星・星座線・流星群のデータ
js/app.js        データ取得、指数計算、天体計算、星図、セリフ
img/             立ち絵を置く場所
```

## 注意

本サイトは東方Project（上海アリス幻樂団）の二次創作で、公式とは関係ありません。
[東方Projectの二次創作ガイドライン](https://touhou-project.news/guideline/) に沿って公開してください。
