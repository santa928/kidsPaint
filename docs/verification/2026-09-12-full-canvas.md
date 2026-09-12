# 全画面描画とスタンプ刷新の検証

2026-09-12。ユーザーから「UI変更で描ける範囲が狭くなった」「タブレット全画面で描けるか」「スタンプを全て描き直して」と指示を受け、同じ `codex/tablet-paint-refresh` のローカル変更として修正した。前段の検証は [初回改修](2026-09-12.md)、最終仕様と変更台帳は [requirements.md](../requirements.md)。本番公開・コミットはしていない。

## 面積と配置

前回のUIでは固定比率の紙をヘッダーとトレイの残り領域に収めていた。今回は紙をviewport全面にし、画材を上に重ねる。「どうぐ」で画材を全てたたみ、56pxのボタン1個だけ残す。実入力可能面積は画面を4px間隔で `elementFromPoint` し、Canvasに到達する割合を測った。

| viewport | 修正前の紙面積 | 修正後の紙面積 | 道具表示中の入力可能面積 | 収納時の入力可能面積 |
|---|---:|---:|---:|---:|
| 1024×768 | 33.12%（約589×442） | 100% | 83.47〜83.48% | 99.60% |
| 768×1024 | 47.00%（約527×702） | 100% | 84.41%前後 | 99.60% |

ChromiumとWebKitで同じ結果。タブレット主要ボタンは56px以上、左右・下端を数値確認。390×844では道具を折り返し、横はみ出しなし。WebKitの390px表示はheightの小数pixel丸めにより紙面積99.998%、高さの差は0.016px未満。画像は両エンジンの縦横、収納時、スタンプ選択、スマートフォン、オフラインを実視認した。

## 描画・保存の確認

- Chromium / WebKitのネイティブpointerで四隅に描き、4操作が保存される。
- 縦横変更時に比率を保つ均等cameraを使う。紙外へ移った余白にも描ける。描いた点を移動・正規化して保存し直さない。
- 回転後の基準紙外へ描いた点が、実IndexedDB再読込で一致。ダウンロードしたPNGの上部にその色画素が残る。確認したPNGは1081×998、長辺・総画素の上限内。
- 通常Undoは残る絵を動かさず全bitmapを再描画し、紙外の残像を消す。全消去ではcameraを基準紙へ戻し、全消去のUndoでは旧cameraと絵のpixelを復元する。
- 基準紙外の点を太い消しゴムで完全に消し、再読込後の中心の絵がpixel一致、cameraが基準紙の縮尺へ戻ることと、ダウンロードPNGが1200×900に戻ることを両エンジンで確認。erase時のみ上限付き透明bitmapで余白を測定・cacheし、描画中の各frameには追加処理を入れない。極小の印を低解像度で見落とす場合は保守的に余白を残す。
- 既存の描画、虹色、消しゴム、3サイズ、7スタンプ、8背景、作品帳、個別PNG、再読込、dialog focus、音設定保存を両エンジンで回帰確認。
- Chromiumの実touchイベントで第二指無視・cancel・指を保持した回転・ブラウザ表示領域の高さ変化を確認。保存の障害、初期読込復旧、2画面の上書き競合も既存回帰で確認。
- ブラウザ全画面は両エンジンでボタンから入る・戻る操作を確認。物理iPadのOS UIやSafariのバーの実挙動は未確認。

## スタンプ

全7種を新しいCanvasベクターへ描き直した。丸い輪郭、塗りの本体、大きな顔やパーツを共通にし、選択色と虹色を維持する。新しいスタンプは `designVersion: 2` を保存し、旧スタンプは旧レンダラーで描く。選択見本は実際と同じ関数を使う。

`scripts/verify-stamps.cjs` で各エンジン210件（7種×10配色×80/112/156px）を実Canvas描画し、サイズ範囲、選択色の面積、同じ条件でのpixel一致、呼出し元Canvasの状態復元を確認した。全色一覧と新旧比較画像を実視認した。実児の判別性や好みを検証したものではない。

独立担当が `scripts/verify-legacy.cjs` で旧形式の7スタンプを実IndexedDBにseedし、UIから新スタンプを追加、保存・再読込を確認した。旧7領域と上下左右の切り取り境界のSHA-256が各engine内で一致。新スタンプ範囲外のpixel差分は0、旧操作列は完全一致し、新操作のみdesignVersion 2。6枚の画像を担当が目視し、親も代表画像を確認した。

## 最終チェック

| 検査 | 結果 |
|---|---|
| Docker unit | 38/38 PASS（描画26、viewport5、保存6、SW1） |
| Docker lint / build | PASS（51 modules、最終JS `index-DmsgTaPq.js`） |
| 既存ブラウザ回帰 | Chromium / WebKit PASS |
| 全画面・余白・PNG・clear復帰 | Chromium / WebKit PASS |
| 新スタンプ描画 | 各エンジン210件 PASS |
| 旧作品互換 | 旧7stamp・四辺cropのhash一致、範囲外pixel差分0、両エンジンPASS |
| 独立コードレビュー | clear後camera・消しゴム後余白の指摘を修正、最終の重要指摘なし |
| 標準ゲームクライアント | 2回、2操作保存、画像/JSONを実視認、エラー出力なし |
| 最新本番ビルドのオフライン | 44資産cache、HTTP no-storeの専用サーバ実停止後に再起動・描画・保存復元・音源取得、両エンジンPASS |

描画bitmapが広がる変更なので、500ストローク・60,000点・虹色20%の合成負荷を再計測した。復元430ms、追加ストローク保存75ms、frame p95約16.7ms、最大33.4ms、52msのlong taskが1回。40タップ後の保存待ち167ms、保存後と再読込後はともに541操作。Linux Dockerの補助証拠であり、実機iPadの性能達成は未確認。

## 残る確認と再現

実機iPadのタッチ、手のひら、Apple Pencil、音、ホーム画面起動、OSの端ジェスチャー、長時間利用、3歳児の理解・好みは未確認。本番URL smokeは未公開のため実施せず、Lighthouseや全端末matrixは今回の変更の受け入れに必要な証拠ではないため省略した。公開前には代表iPadで操作・保存・ホーム画面起動を確認する。

Fullscreen APIは明示操作とブラウザ対応が必要（[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)）。manifestの `display: standalone` を維持し、iPad Safariのホーム画面追加によるアプリ表示を案内する（[WebKit仕様](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)）。普通のSafariタブを開くだけでOSやブラウザのUIが必ず消える、とは扱わない。

手順は [README](../../README.md)。集約した数値は [検証JSON](2026-09-12-full-canvas-results.json)、詳細JSONと画像はローカル `output/full-canvas/`、再現可能なブラウザscriptは `scripts/verify-full-canvas.cjs` / `scripts/verify-stamps.cjs` / `scripts/verify-tablet.cjs` にある。保存データの大規模上限・全端末・実児テストを実施したという主張はしない。
