# おえかき · Kids Paint

3歳ごろの子どもが、タブレットで自由に描いて遊ぶお絵描きアプリです。React・TypeScript・Canvas 2Dで動き、作品はブラウザ内のIndexedDBに保存します。アカウントやクラウド送信はありません。

## 使い方

- 上のクレヨンから9色または「にじ」を選び、紙に指で描きます。
- 紙は画面全体に広がります。右上の「どうぐ」で画材をたたむと、画材ボタン以外へ描けます。回転して増えた余白の絵も保存されます。
- 下の道具でクレヨン・スタンプ・消しゴムを切り替えます。丸の大きさで太さを3段階から選べます。
- 「もどす」で、この紙を開いてからの操作を最大20回取り消せます。
- 「あたらしい かみ」は、今の絵を保存してから新しい紙を出します。「さくひん」から続きを描けます。
- 「かみのいろ」で8種類の背景を選べます。画面を回しても絵の形は変わりません。
- 「おうちの方へ」で効果音・音量（0〜200%、初期120%）、背景つきPNG保存、取り消せる全消去を使えます。作品帳からも個別にPNG保存できます。

各ストロークの終了時に保存します。保存状態は「おうちの方へ」で確認できます。保存に失敗した場合は絵を残して警告を表示します。別の画面で同じ作品が更新された場合は上書きを防ぎ、手元の絵を画像で保存するよう案内します。

右側の全画面ボタンは対応するブラウザでアドレスバーを隠します。iPadのSafariでは、共有メニューから「ホーム画面に追加」して起動する方法も使えます。実機iPadでの全画面・タッチ・ホーム画面起動は未検証です。

作品は**同じブラウザ・同じ端末・同じURLのオリジン**に保存されます。ブラウザデータの消去、端末の空き容量不足などに備え、大切な絵はPNGでも保存してください。読み込みが失敗した場合は、元データを変更せず再試行を案内します。

## 開発と検証（Docker）

```sh
docker compose up --build -d
```

[ローカル画面](http://localhost:5173/kidsPaint/) を開きます。依存追加や各種コマンドはコンテナ内で実行してください。

```sh
docker compose exec -T web npm test
docker compose exec -T web npm run lint
docker compose exec -T web npm run build
```

タブレットのブラウザ回帰（Chromium / WebKit、縦横・保存・PNG・複数指・保存失敗・複数タブ）：

```sh
docker compose -f docker-compose.yml -f docker-compose.e2e.yml build e2e
docker compose -f docker-compose.yml -f docker-compose.e2e.yml run --rm e2e
```

本番成果物のオフライン検証（専用サーバを起動後、実際に停止。共有開発サーバには影響しません）：

```sh
docker compose exec -T web npm run build
docker compose -f docker-compose.yml -f docker-compose.e2e.yml run --rm -v "$PWD/dist:/app/dist:ro" e2e node scripts/verify-offline.cjs
```

全画面の入力可能面積・四隅・回転後の余白・PNGの確認：

```sh
docker compose -f docker-compose.yml -f docker-compose.e2e.yml run --rm e2e node scripts/verify-full-canvas.cjs
docker compose -f docker-compose.yml -f docker-compose.e2e.yml run --rm e2e node scripts/verify-stamps.cjs
docker compose -f docker-compose.yml -f docker-compose.e2e.yml run --rm e2e node scripts/verify-legacy.cjs
```

この検査の証跡は `output/full-canvas/` に出力します。新規スタンプは全7種類を描き直し、既存作品の旧スタンプは元の見た目を維持します。

合成負荷の計測（実機iPadの性能証明ではありません）：

```sh
docker compose -f docker-compose.yml -f docker-compose.e2e.yml run --rm e2e node scripts/measure-drawing.cjs
```

結果とスクリーンショットは `output/tablet-refresh/` に出力します。効果音の再生成は `docker compose run --rm web npm run generate:sounds` で行えます。

## PWA・公開先

公開先は [GitHub Pages](https://santa928.github.io/kidsPaint/) です。`main` へのpushで既存のGitHub Actionsがビルド・公開を行います。ローカルでの編集だけでは公開内容は更新されません。

本番ビルドはHTML・JS・CSS・アイコン・効果音を同じバージョンとしてキャッシュし、初回読み込み後のオフライン起動に対応します。開いている描画中の画面を強制的に更新せず、アプリのタブを閉じた後に更新を適用します。PWAにはHTTPSまたはlocalhostが必要です。

仕様は [docs/requirements.md](docs/requirements.md)、最新の確認結果と実機で残る項目は [全画面・スタンプ検証](docs/verification/2026-09-12-full-canvas.md) を参照してください。前段の記録は [初回改修](docs/verification/2026-09-12.md) に残しています。
