# 前提ストア（テーマ＋前提の蓄積）設計

- 日付: 2026-07-15
- 対象アプリ: 役員会議プロンプト生成アプリ（プロンプトコンパイラ）
- ステータス: 設計確定（実装計画はこの後 writing-plans で作成）

## 1. 背景と課題

現状のアプリは「役の条件・議題・立場・出力形式を合成して会議プロンプトを生成する」コンパイラである。会議自体は生成したプロンプトを Claude / ChatGPT 等に貼って回す。

課題は、**会議のたびに「このブランドはこういう前提です」という文脈を毎回書き直している**こと。会議が終わって別の会議を始めると、また同じ前提を最初から入力し直す必要がある。

本設計は、この「毎回書き直す」痛みを消すために、**オーナーが宣言するブランド前提を DB に蓄積し、会議プロンプト生成時に自動で差し込む**機能を追加する。

## 2. 採用した方向性と却下した方向性

検討時に2つの独立した論点が混在していた。

- 論点A: 前提の「蓄積・再利用」をどうするか
- 論点B: 会議を誰が実行するか（現状のコンパイラ維持 vs アプリが Gemini/Claude API を叩くチャット化）

**決定: 方向A（コンパイラ維持＋前提ストア）を採用。方向B（フルAPIチャット化）は却下（保留）。**

理由:
- 論点A（蓄積）は論点B（API化）をしなくても解決できる。テーマ単位の前提を DB に持ち、生成時に差し込むだけで「毎回書き直す」問題は消える。
- このアプリ最大の強みは**クライアント非依存**（生成プロンプトを ChatGPT でも Claude でも Gemini でもスマホの普通のチャットに貼れる）。API化・Claude Code 必須化は、この強みを狭める。ユーザーは実際にスマホ＋ChatGPT で運用しており、ローカル Claude Code 常駐は手間。
- API化は運用コスト（トークン課金）・SaaS化（認証/課金/マルチテナント）・前提の自動汚染リスクを伴う。普及フェーズで「Claude を持たない一般ユーザーに配る」と本気で決めたときに初めて再検討する。

## 3. 前提の定義（本設計の土台）

**前提 = オーナー（利用者本人）が宣言する、ブランド／事業の事実・性格・制約・目標。会議の「入力」側。**

- 例: 「レビューは星5のみ」「1人運営」「少数に深く刺す」「販売数を増やしたい」。
- **会議で決まったこと（結論・決定）は前提ではない。** それは会議の「出力」であり、前提に混ぜてはならない。
- 会議中に会長（オーナー）が「事実を小出しに開示」する発言は、オーナー由来なので前提になり得る。抽出対象は「オーナーが会話で開示・表明した前提」であり、「役員の議論や会議の結論」ではない。

### 非対応（YAGNI）

- **会議決定の前提への「昇格」機能は作らない。** 前提はオーナー由来のみに限定する。将来必要になれば追加する。
- 方向B（フルAPIチャット化、会話からの自動学習）は作らない。

## 4. データモデル

既存の `bm_` プレフィックス（共有 Supabase への間借り）を踏襲し、新テーブルを2つ追加する。localStorage フォールバックも同じ形状を持つ。

### 4.1 `bm_themes`（テーマ ＝ 会議の題目/プロジェクト）

| カラム | 型 | 説明 |
|--------|----|----|
| id | uuid PK | |
| set_id | uuid FK → bm_profile_sets(id) on delete cascade | 会社（プロファイルセット）に紐づく |
| name | text not null | 例: 「販売数を増やす」 |
| description | text not null default '' | 任意の補足 |
| sort_order | int not null default 0 | 並び順 |
| created_at | timestamptz not null default now() | |

### 4.2 `bm_premises`（前提 ＝ 1件 = 1行の事実/制約）

| カラム | 型 | 説明 |
|--------|----|----|
| id | uuid PK | |
| set_id | uuid FK → bm_profile_sets(id) on delete cascade | 会社に紐づく（差し込みの基本単位） |
| theme_id | uuid FK → bm_themes(id) on delete cascade, **null 許可** | **null → 会社常設前提（全会議に効く）／指定 → テーマ別前提** |
| body | text not null | 前提本文（1行の事実/制約/目標/仮説） |
| kind | text not null | `fact`(事実) / `constraint`(制約) / `goal`(目標) / `hypothesis`(仮説) |
| status | text not null default 'active' | `active` / `retired`（棄却。削除せず履歴を残す） |
| source | text not null default 'manual' | `manual`(手書き) / `chat`(会話からの抽出→承認) |
| sort_order | int not null default 0 | 種類内の並び順 |
| created_at | timestamptz not null default now() | |

- 2層の表現: `theme_id IS NULL` が会社常設、`theme_id` 指定がテーマ別。両者は同一テーブルで扱い、生成時に合流させる。
- RLS は既存テーブルと同様に anon の全許可ポリシー（個人利用前提、`bm_` テーブルのみ）。
- インデックス: `bm_themes(set_id)`, `bm_premises(set_id)`, `bm_premises(theme_id)`。

### 4.3 型定義（`lib/types.ts`）

```ts
export type PremiseKind = "fact" | "constraint" | "goal" | "hypothesis";
export type PremiseStatus = "active" | "retired";
export type PremiseSource = "manual" | "chat";

export type Theme = {
  id: string;
  set_id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at?: string;
};

export type Premise = {
  id: string;
  set_id: string;
  theme_id: string | null; // null = 会社常設
  body: string;
  kind: PremiseKind;
  status: PremiseStatus;
  source: PremiseSource;
  sort_order: number;
  created_at?: string;
};
```

- `GenerationInput` に `themeId?: string`（未選択可）を追加する。
- ラベル定数（`PREMISE_KIND_LABELS` 等）を `types.ts` に追加し、UI と promptBuilder で共有する。

## 5. プロンプトへの差し込み（`lib/promptBuilder.ts`）

生成時に選択されたテーマの `active` 前提と、その会社の**会社常設**（`theme_id IS NULL`）`active` 前提を合流し、新セクションとして挿入する。

- セクション見出し: **「# 既知の前提（確定事項）」**
- 中身は `kind` でグルーピングして見出し分け（目標 → 制約 → 事実 → 仮説 の順）。各前提は `- 本文` の箇条書き。
- 前提が0件のとき（会社常設もテーマ別も無い）は、このセクションを**出力しない**。
- 既存の共通規律②「確定していない事実を勝手に断定するな」と噛み合わせるため、セクション冒頭に一文を添える:
  > 以下はオーナーが確定済みと宣言した前提である。これらは断定して議論を進めてよい。ここに書かれていない事実は、従来どおり断定せず、必要なら会長に確認せよ。
- `PRE_TASK`（ざっくり/お任せモードで各役に仮定を宣言させるタスク）は、「**既知の前提に書かれていない点についてのみ**、現実的な仮定を宣言せよ」と調整する。前提が埋まっている論点で二重に仮定させないため。

挿入位置は「私の立場」ブロックの後、`COMMON_RULES` の前あたり（会議の土台情報として先に提示する）。

## 6. 画面（`app/`）

### 6.1 生成画面（`/`）

- テーマ選択の UI を追加（会社に紐づくテーマの一覧＋「テーマなし」）。
- 選択すると、差し込まれる前提のプレビューを折りたたみで表示（会社常設＋テーマ別、`active` のみ）。
- 未選択でも会社常設前提は差し込まれる。

### 6.2 前提管理

配置は `/profiles` 内のタブ、または新規ルート（`/premises`）。実装計画で確定する。機能:

- テーマの CRUD（追加・改名・description 編集・並び替え・削除）。
- 前提の CRUD（手動追加・編集・種類タグ変更・棄却/復帰・削除）。
- 会社常設／テーマ別の切替表示。
- 棄却（`status='retired'`）は削除と区別し、履歴として残す。差し込み対象からは外れる。

### 6.3 取り込み欄（コピペ橋の帰り側）

- 会議末に流した「前提追加プロンプト」の出力ブロックをペーストするテキストエリア。
- ペースト内容をアプリが解析して**前提候補のチェックリスト**を表示。
- チェックしたものだけを、選択中の会社／テーマに保存（`source='chat'`）。
- 承認ゲートがここにあることで、会議の結論など不要なものが前提に紛れ込むのを止める。

## 7. 貯蓄の2経路（承認ロジックは共通）

前提の保存ロジック（バリデーション・重複チェック・kind 付与・承認）は1箇所に集約し、以下2経路がそれを共有する。

### 7.1 コピペ橋（標準・全チャット対応）

1. 生成画面で会議プロンプトに加えて「**前提追加プロンプト**」も出力できるようにする（コピー用）。
2. ユーザーは会議の最後にそのプロンプトを同じチャットに流す。
3. AI は、**その会話でオーナー（会長）が開示・表明したブランド前提のみ**を、決まった機械可読フォーマットで出力する（役員の議論・会議の結論は除外）。
4. ユーザーは出力ブロックをコピーし、6.3 の取り込み欄にペースト → 承認 → 保存。

### 7.2 MCP 直書き（任意・Claude Code 利用者向け）

- `/meeting` スラッシュコマンド（`.claude/commands/meeting.md`）を拡張し、会議後に Claude Code が同じ意味論（オーナーが開示した前提のみ）で `bm_premises` に `source='chat'` として追記する。
- 承認は「後から管理画面で棄却できる」ことで担保する（事前承認は挟まない代わりに事後で外せる）。
- これは任意機能。標準動線はあくまで 7.1 のコピペ橋。

### 7.3 前提追加プロンプトの出力フォーマット

解析の確実性のため、機械可読な簡易フォーマットを1つ定義する。案（実装計画で最終確定）:

```
### 抽出した前提
- [fact] レビューは星5のみ
- [constraint] 1人運営で制作時間が律速
- [goal] 販売数を増やしたい
```

- 各行 `- [kind] 本文`。`kind` は `fact|constraint|goal|hypothesis`。
- 見出し行以降を対象にパースする。パース失敗行はスキップし、取り込み欄でユーザーが手直しできる。

## 8. データアクセス層（`lib/store.ts`）

既存パターン（Supabase 設定時は `bm_` テーブル、未設定時は localStorage）を踏襲し、以下を追加する。

- テーマ: `listThemes(setId)`, `createTheme`, `updateTheme`, `deleteTheme`, `reorderThemes`。
- 前提: `listPremises(setId)`（会社常設＋テーマ別を含む）, `listActivePremisesForGeneration(setId, themeId?)`（差し込み用、`active` のみ、会社常設＋指定テーマ）, `upsertPremise`, `deletePremise`, `setPremiseStatus`（棄却/復帰）。
- localStorage キー: `bm_themes`, `bm_premises` を追加。既存の seed 機構（`ensureSeeded`）と整合させる（初期は空でよい）。

## 9. マイグレーション（`supabase/migration.sql`）

- `bm_themes` / `bm_premises` の `create table if not exists` を追加。
- 対応する RLS 有効化と anon 全許可ポリシーを、既存の `do $$ ... $$` パターンで追加。
- インデックス追加。
- 既存の初期データ（会社/役/テンプレ）は変更しない。前提・テーマの初期投入は行わない（空スタート）。

## 10. スコープ外（YAGNI 再掲）

- 会議決定の前提への昇格機能。
- 方向B（アプリが LLM API を叩くチャット化、会話からの自動学習）。
- 前提のバージョン管理・差分履歴（棄却フラグ以上の履歴管理）。
- 複数ユーザー/認証/課金（個人利用前提を維持）。

## 11. 受け入れ条件

- テーマと前提を管理画面で手動 CRUD でき、棄却/復帰できる。
- 生成画面でテーマを選ぶと、会社常設＋テーマ別の `active` 前提が「# 既知の前提（確定事項）」として会議プロンプトに差し込まれる。0件なら出ない。
- 前提が0件でも従来どおりプロンプト生成が動く（後方互換）。
- 「前提追加プロンプト」を生成でき、その出力を取り込み欄にペースト→承認→保存できる。
- Supabase モードと localStorage モードの両方で動作する。
- `/meeting` コマンドから MCP 経由で前提を追記できる（任意経路）。

## 12. テスト観点

- promptBuilder: 前提0件で該当セクションが出ないこと／会社常設のみ／テーマ別との合流／kind グルーピング順。
- パーサ: 正常フォーマット・崩れた行・空入力の扱い。
- store: Supabase/localStorage 両モードの CRUD と `listActivePremisesForGeneration` の絞り込み（active のみ・会社常設＋指定テーマ）。
- 後方互換: テーマ未選択・前提未登録での生成。
