# AGENTS.md

## このリポジトリ固有のルール
- 変更は最小差分で行う（構成変更や大規模整形は避ける）。
- インストールや実行系の作業は、基本的に Docker コンテナ内で行う。
  - 例: `docker compose run --rm web <command>` または `docker compose exec web <command>`
- 破壊的操作や本番反映は事前に明示して許可を取る。
