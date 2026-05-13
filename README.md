# takos-excel

ブラウザベースのスプレッドシートエディタと MCP (Model Context Protocol)
サーバーです。 Takos ディストリビューションに同梱される 1st-party InstallableApp
として Takosumi 上で動作します。

`.takosumi/` パッケージングがブラウザ UI のデプロイと `/mcp`
エンドポイントの公開を行います。スタンドアロン / セルフホストでは
`deno task
mcp` でランタイムを単独起動できます。

## 技術スタック

- **Frontend**: Solid.js, Tailwind CSS, バーチャルスクロールグリッド
- **Backend**: Hono HTTP サーバー + MCP プロトコル (Streamable HTTP transport)
- **Formula Engine**: HyperFormula (GPLv3) — 400 以上の Excel 互換関数をサポート
- **State**: Solid signals (client) / `SpreadsheetStore` (server, Takos Storage
  API)
- **Runtime**: Deno

## Getting Started

```bash
deno install --allow-scripts=npm:canvas

# 開発サーバー (frontend, port 3003)
deno task dev

# MCP サーバー (backend)
deno task mcp

# production build
deno task build
```

スクリーンショット / エクスポート機能は `npm:canvas` を使います。OS によっては
ネイティブ canvas の前提パッケージが必要です。

`deno task build` は静的ブラウザバンドルと、Takos ディストリビューション
インストール用アーティファクト `dist/worker.js` を生成します。 ワーカーは SPA と
`/mcp` の両方を配信します。

`sheet_screenshot` はサーバー側 canvas レンダラがロード可能なランタイムでのみ
利用できます。

### 環境変数

| Variable                     | 説明                                               | デフォルト              |
| ---------------------------- | -------------------------------------------------- | ----------------------- |
| `TAKOS_STORAGE_API_URL`      | Takos Storage API URL                              | `http://localhost:8787` |
| `TAKOS_STORAGE_ACCESS_TOKEN` | Storage API のアクセストークン                     | (required)              |
| `TAKOS_SPACE_ID`             | デフォルト space。リクエスト `space_id` が優先     | (optional)              |
| `APP_AUTH_REQUIRED`          | `1` で app セッション認証を要求                    | `0`                     |
| `APP_SESSION_SECRET`         | app セッション cookie の secret                    | managed generated       |
| `OAUTH_CLIENT_ID`            | Takosumi Accounts OIDC client ID                   | managed injected        |
| `OAUTH_CLIENT_SECRET`        | Takosumi Accounts OIDC client secret               | managed injected        |
| `OAUTH_ISSUER_URL`           | Takosumi Accounts OIDC issuer URL                  | managed injected        |
| `OAUTH_TOKEN_URL`            | Takosumi Accounts OIDC token endpoint              | managed injected        |
| `OAUTH_USERINFO_URL`         | Takosumi Accounts OIDC userinfo endpoint           | managed injected        |
| `MCP_AUTH_TOKEN`             | `/mcp` を保護する bearer トークン                  | managed auto-secret     |
| `MCP_ALLOW_UNAUTHENTICATED`  | `1` で bearer 無しの `/mcp` を許可                 | `0`                     |
| `TAKOS_NATIVE_RENDERING`     | `1` でネイティブ canvas スクリーンショットを有効化 | runtime-dependent       |

managed Takos インストールでは、`.takosumi/app.yml` がインストールメタデータを
宣言し、`.takosumi/manifest.yml` が `/mcp` を公開します。ランタイムは
ストレージ認証情報と Takosumi Accounts OIDC client env を受け取り、
`APP_SESSION_SECRET` を生成します。

ファイルハンドラは `/files/:id` で開き、リクエストの `space_id` / `spaceId`
クエリパラメータがある場合はそれを使ってストレージを読み書きします。
新規作成スプレッドシートは `.takossheet` (`application/vnd.takos.excel+json`)
で保存されます。

## Takosumi Install

`.takosumi/` ディレクトリに以下が含まれます。

- `.takosumi/app.yml`: Git URL install 用のメタデータ
- `.takosumi/manifest.yml`: takosumi-git がコンパイルするマニフェスト
- `.takosumi/workflows/build.yml`: `dist/worker.js` をビルドし、
  `TAKOSUMI_ARTIFACT=<uri>` マーカーを出力

```bash
takosumi-git install preview --cwd . --json
```

## MCP ツール一覧

### Spreadsheet Management

- `sheet_list` — 全スプレッドシートを一覧
- `sheet_create` — 新規スプレッドシートを作成
- `sheet_get` — メタデータとシート名を取得
- `sheet_delete` — スプレッドシートを削除
- `sheet_set_title` — スプレッドシートを改名

### Sheet Tab Operations

- `sheet_add_tab` — 新規シートタブ追加
- `sheet_remove_tab` — シートタブ削除
- `sheet_rename_tab` — シートタブ改名

### Cell Operations

- `sheet_get_cell` — セルの値・計算結果・書式を取得
- `sheet_set_cell` — セルの値または数式を設定
- `sheet_get_range` — 範囲の値を 2 次元配列で取得
- `sheet_set_range` — 2 次元配列から範囲に値を設定
- `sheet_clear_range` — 範囲のセルをクリア
- `sheet_format_cell` — セルに書式を適用
- `sheet_format_range` — 範囲に書式を適用

### Formula & Computation

- `sheet_evaluate` — 数式を保存せずに評価
- `sheet_get_computed` — 範囲の計算済み値を取得

### Column / Row Operations

- `sheet_set_column_width` — 列幅を設定
- `sheet_set_row_height` — 行高を設定

### Import / Export

- `sheet_import_csv` — CSV をシートにインポート
- `sheet_export_csv` — シートを CSV でエクスポート
- `sheet_export_json` — スプレッドシートを JSON でエクスポート

### Conditional Formatting

- `sheet_add_conditional_rule` — 条件付き書式ルールを追加
- `sheet_remove_conditional_rule` — 条件付き書式ルールを削除
- `sheet_list_conditional_rules` — シートのルールを一覧

### Visualization

- `sheet_screenshot` — シートを PNG として描画

## アーキテクチャ概要

```
src/
  server.ts              # Hono HTTP エントリ + MCP transport
  mcp.ts                 # MCP ツール定義 (26 ツール)
  spreadsheet-store.ts   # サーバー側ストア (Takos Storage API)
  types/index.ts         # 共通型定義
  lib/
    cell-utils.ts        # セルアドレス (A1 表記) ユーティリティ
    formula.ts           # HyperFormula 統合
    csv-parser.ts        # RFC 準拠 CSV パーサー
    history.ts           # 汎用 undo/redo
    conditional-format.ts# 条件付き書式エバリュエータ
    grid-renderer.ts     # サーバー側 PNG レンダラ (canvas)
    storage.ts           # クライアント localStorage ラッパー
    takos-storage.ts     # Takos Storage API クライアント
  components/
    Grid.tsx             # バーチャルスクロールグリッド
    Toolbar.tsx          # 書式ツールバー (undo/redo, CSV インポート)
    FormulaBar.tsx       # 数式入力バー
    SheetTabs.tsx        # シートタブ切替
    CellEditor.tsx       # セル内エディタ
  pages/
    EditorPage.tsx       # スプレッドシートエディタページ
```

## 数式エンジン

[HyperFormula](https://hyperformula.handsontable.com/) を採用しており、
次をサポートします。

- 算術 / 文字列演算
- 400 以上の組み込み関数 (SUM, AVERAGE, VLOOKUP, IF, ...)
- セル参照 (例: `=A1+B2`)
- 範囲参照 (例: `=SUM(A1:A10)`)
- 依存関係の自動追跡と再計算

数式は先頭 `=` で入力します (例: `=SUM(A1:A10)`)。

## データモデル

- **Spreadsheet**: ID, タイトル, タイムスタンプ, 1
  つ以上のシートを持つ最上位コンテナ
- **Sheet**: 名前付きタブ。セルマップ, 列幅, 行高,
  任意の条件付き書式ルールを持つ
- **CellData**: 入力値, 計算値 (任意), 書式 (任意)
- **CellFormat**: bold, italic, underline, text/bg color, font size, alignment,
  number format
- **ConditionalRule**: 範囲スコープのルール (greaterThan, lessThan, equal,
  between, textContains, isEmpty 等) と適用書式

サーバー側データは Takos Storage API 上に `takos-excel/` フォルダで JSON
ファイルとして永続化されます。クライアントは `localStorage`
をフォールバックに使います。
