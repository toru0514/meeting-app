# 役員会議プロンプト生成アプリ

複数の役職（社長・経理・製造・企画…）がそれぞれの利害に基づいて議論し、1つの最適な結論を出す「役員会議」を、Claude / Claude Code 上で実現するための **プロンプトコンパイラ**。

会議自体はマルチエージェントで実装しない。賢いモデルは1応答で各役を演じ分け、議論し、結論まで出せる。本アプリの責務は「役の条件・議題・立場・出力形式を合成して質の高いプロンプトを生成する」ことに徹する。

詳細仕様: [`board-meeting-prompt-generator-spec-v2.md`](./board-meeting-prompt-generator-spec-v2.md)

## 構成

- **フロント**: Next.js (App Router) + React 19 + Tailwind v4。スマホ最優先のレスポンシブ。
- **DB**: Supabase（既存プロジェクトに `bm_` プレフィックスで間借り）。設定の正本はDB。
- **フォールバック**: Supabase 未設定なら自動で localStorage モード（すぐ試せる）。
- **Claude Code 連携**: `/meeting` スラッシュコマンド + Supabase MCP で役を読み、議論し、`/meetings/*.md` に議事録を保存。

## 画面

1. **生成** (`/`): 議題・立場・セット・招集メンバー・入力モード・出力テンプレを選び、会議プロンプト＋議事録テンプレを生成（コピー）。招集メンバーは初期全員ON。
2. **役の設定** (`/profiles`): 役の追加・編集・並び替え・削除。保有条件（フィールド）・判断基準・利害・禁止・行動原則を編集。セットの切替/新規/会社説明も。
3. **出力形式** (`/templates`): 出力テンプレートの閲覧・編集・追加・削除。

## セットアップ

```bash
npm install
npm run dev      # http://localhost:3000
```

### Supabase を使う場合（推奨：Claude Code が MCP で読めるようになる）

1. 既存 Supabase プロジェクトの SQL Editor で [`supabase/migration.sql`](./supabase/migration.sql) を実行（`bm_` テーブル作成＋初期データ投入）。
2. `.env.local` を作成:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

3. `npm run dev` で起動。バナーが消えれば Supabase モード。

設定しない場合はローカルモードで動作し、データはブラウザの localStorage に保存される（初期データ投入済み）。

## デプロイ（Vercel）

```bash
vercel        # プレビュー
vercel --prod # 本番
```

環境変数 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Vercel に設定する。

## 設計判断

- DBはSupabase一本。設定の正本はDB。ファイル同期は持たない（二重管理を避ける）。
- 既存プロジェクトに間借り（無料枠の2プロジェクト制限を消費しない）。テーブルは `bm_` で分離。
- 議事録だけはファイル（Markdown）。Claude Code が会議結果として `/meetings/` に書き出す。

## 入力モード × 出力テンプレ

- **入力モード**（条件の濃さ）: きっちり / ざっくり / お任せ。「ざっくり・お任せ」では各役がAIに前提を宣言させる事前タスクを挿入。
- **出力テンプレ**（まとめ方）: 意思決定型 / 発散型 / シミュレーション型 / 壁打ち型 / お任せ。

例: 「お任せ条件 × 発散型」でアイデア出し、「きっちり条件 × 意思決定型」で投資判断。
