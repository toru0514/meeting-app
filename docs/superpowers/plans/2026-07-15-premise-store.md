# 前提ストア Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** オーナーが宣言するブランド前提を「会社常設＋テーマ別」で DB に蓄積し、会議プロンプト生成時に自動差し込みするコンパイラ機能を追加する。

**Architecture:** 既存の Supabase-or-localStorage フォールバック構成を踏襲。新テーブル `bm_themes` / `bm_premises` を追加。前提のフォーマット（`- [kind] 本文`）を単一情報源として `lib/premiseFormat.ts` に集約し、生成プロンプト・パーサ・テストが共有。差し込みは `promptBuilder.ts` の新セクション。管理と取り込みは新ルート `/premises`。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Supabase JS / Tailwind v4 / vitest（純ロジックの単体テスト用に新規導入）

**Spec:** `docs/superpowers/specs/2026-07-15-premise-store-design.md`

---

## File Structure

- Create: `lib/premiseFormat.ts` — 前提の機械可読フォーマットの単一情報源。`parsePremiseText()`（テキスト→候補）と `serializePremises()`、フォーマット定数。純関数。
- Create: `lib/__tests__/premiseFormat.test.ts` — パーサ／シリアライザのテスト。
- Create: `lib/__tests__/promptBuilder.test.ts` — 前提セクション差し込みのテスト。
- Modify: `lib/types.ts` — `Theme` / `Premise` 型・enum・ラベル・`GenerationInput.themeId` 追加。
- Modify: `lib/promptBuilder.ts` — 前提セクション描画・差し込み、`buildPremiseExtractionPrompt()`、`PRE_TASK` 調整。
- Modify: `lib/store.ts` — テーマ／前提の CRUD と差し込み用取得。localStorage キー追加。
- Modify: `lib/seed.ts` — 空の themes/premises シード（localStorage 初期化用）。
- Modify: `supabase/migration.sql` — 新テーブル・RLS・インデックス。
- Create: `app/premises/page.tsx` — 前提管理＋取り込み UI。
- Modify: `app/page.tsx` — テーマ選択・前提プレビュー・前提追加プロンプト出力。
- Modify: `app/layout.tsx` — ナビに「前提」を追加。
- Modify: `.claude/commands/meeting.md` — MCP 直書き手順を追記。
- Modify: `package.json` — vitest 導入と `test` スクリプト。

---

## Task 1: テスト基盤（vitest）導入

**Files:**
- Modify: `package.json`

- [ ] **Step 1: vitest を devDependency に追加しスクリプト定義**

`package.json` の `scripts` に `"test": "vitest run"`, `"test:watch": "vitest"` を追加。`devDependencies` に `"vitest": "^3.0.0"` を追加。

- [ ] **Step 2: インストール**

Run: `npm install`
Expected: 成功。`node_modules/.bin/vitest` が存在。

- [ ] **Step 3: スモークテストで疎通確認**

`lib/__tests__/smoke.test.ts` を一時作成:
```ts
import { expect, test } from "vitest";
test("smoke", () => { expect(1 + 1).toBe(2); });
```
Run: `npm test`
Expected: PASS。確認後このファイルは削除し、次タスクへ。

- [ ] **Step 4: コミット**

```bash
git add package.json package-lock.json
git commit -m "test: vitest を導入"
```

---

## Task 2: 型定義の追加（`lib/types.ts`）

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: 型・enum・ラベルを追加**

`types.ts` 末尾に追記:
```ts
/** 前提の種類 */
export type PremiseKind = "fact" | "constraint" | "goal" | "hypothesis";
/** 前提の状態 */
export type PremiseStatus = "active" | "retired";
/** 前提の由来 */
export type PremiseSource = "manual" | "chat";

/** テーマ（会議の題目/プロジェクト、bm_themes） */
export type Theme = {
  id: string;
  set_id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at?: string;
};

/** 前提（bm_premises）。theme_id が null なら会社常設 */
export type Premise = {
  id: string;
  set_id: string;
  theme_id: string | null;
  body: string;
  kind: PremiseKind;
  status: PremiseStatus;
  source: PremiseSource;
  sort_order: number;
  created_at?: string;
};

export const PREMISE_KIND_LABELS: Record<PremiseKind, string> = {
  goal: "目標",
  constraint: "制約",
  fact: "事実",
  hypothesis: "仮説",
};

/** 差し込み時の見出し順（目標→制約→事実→仮説） */
export const PREMISE_KIND_ORDER: PremiseKind[] = [
  "goal",
  "constraint",
  "fact",
  "hypothesis",
];
```

- [ ] **Step 2: `GenerationInput` に `themeId` を追加**

`GenerationInput` 型に `/** 選択テーマ（未選択なら会社常設のみ差し込む） */ themeId?: string;` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし（`themeId` は optional なので既存呼び出しは壊れない）。

- [ ] **Step 4: コミット**

```bash
git add lib/types.ts
git commit -m "feat: 前提・テーマの型定義を追加"
```

---

## Task 3: 前提フォーマット（単一情報源）+ パーサ（TDD）

**Files:**
- Create: `lib/premiseFormat.ts`
- Test: `lib/__tests__/premiseFormat.test.ts`

パースする前提候補は保存前の値なので `id/set_id/theme_id...` を持たない。`PremiseDraft = { body: string; kind: PremiseKind }` を返す。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { expect, test } from "vitest";
import { parsePremiseText, PREMISE_EXTRACTION_HEADER } from "../premiseFormat";

test("見出し以降の各行を種類付きで抽出する", () => {
  const input = `前置き（無視される）
${PREMISE_EXTRACTION_HEADER}
- [fact] レビューは星5のみ
- [goal] 販売数を増やしたい`;
  expect(parsePremiseText(input)).toEqual([
    { kind: "fact", body: "レビューは星5のみ" },
    { kind: "goal", body: "販売数を増やしたい" },
  ]);
});

test("見出しが無くても [kind] 行は拾う", () => {
  expect(parsePremiseText("- [constraint] 1人運営")).toEqual([
    { kind: "constraint", body: "1人運営" },
  ]);
});

test("未知の種類・空本文・非該当行はスキップする", () => {
  const input = `- [unknown] x
- [fact]
- ただの箇条書き
- [hypothesis]   認知不足がボトルネック  `;
  expect(parsePremiseText(input)).toEqual([
    { kind: "hypothesis", body: "認知不足がボトルネック" },
  ]);
});

test("空入力は空配列", () => {
  expect(parsePremiseText("")).toEqual([]);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm test -- premiseFormat`
Expected: FAIL（モジュール未実装）。

- [ ] **Step 3: 実装**

```ts
import type { PremiseKind } from "./types";

/** 抽出プロンプト出力の見出し（生成・パース共通の単一情報源） */
export const PREMISE_EXTRACTION_HEADER = "### 抽出した前提";

/** 保存前の前提候補 */
export type PremiseDraft = { body: string; kind: PremiseKind };

const VALID_KINDS: PremiseKind[] = ["fact", "constraint", "goal", "hypothesis"];

const LINE_RE = /^\s*-\s*\[([a-z]+)\]\s*(.*)$/;

/** `- [kind] 本文` 形式のテキストから前提候補を抽出する。崩れた行はスキップ。 */
export function parsePremiseText(text: string): PremiseDraft[] {
  const drafts: PremiseDraft[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const kind = m[1] as PremiseKind;
    const body = m[2].trim();
    if (!VALID_KINDS.includes(kind) || !body) continue;
    drafts.push({ kind, body });
  }
  return drafts;
}

/** 前提候補を `- [kind] 本文` 形式へ整形する（抽出プロンプトの例示などに使用）。 */
export function serializePremises(drafts: PremiseDraft[]): string {
  return drafts.map((d) => `- [${d.kind}] ${d.body}`).join("\n");
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- premiseFormat`
Expected: PASS（4件）。

- [ ] **Step 5: コミット**

```bash
git add lib/premiseFormat.ts lib/__tests__/premiseFormat.test.ts
git commit -m "feat: 前提フォーマットのパーサ／シリアライザを追加"
```

---

## Task 4: プロンプト差し込みと抽出プロンプト（TDD）

**Files:**
- Modify: `lib/promptBuilder.ts`
- Test: `lib/__tests__/promptBuilder.test.ts`

`buildMeetingPrompt` に第5引数 `premises: Premise[] = []`（active 前提の合流済みリスト、会社常設＋テーマ別）を追加する。既存呼び出しは省略時 `[]` で後方互換。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { expect, test } from "vitest";
import { buildMeetingPrompt, buildPremiseExtractionPrompt } from "../promptBuilder";
import type { GenerationInput, OutputTemplate, Premise, ProfileSet } from "../types";

const set: ProfileSet = { id: "s1", name: "t", company: "会社説明" };
const tpl: OutputTemplate = { id: "t1", key: "decision", name: "意思決定型", body: "結論を出せ" };
const baseInput: GenerationInput = {
  topic: "議題X", stance: "chairman", setId: "s1",
  selectedRoleIds: [], includeDevil: false, inputMode: "strict",
  outputTemplateKey: "decision",
};
const premise = (over: Partial<Premise>): Premise => ({
  id: "p", set_id: "s1", theme_id: null, body: "本文",
  kind: "fact", status: "active", source: "manual", sort_order: 0, ...over,
});

test("前提0件なら既知の前提セクションを出さない", () => {
  const out = buildMeetingPrompt(baseInput, set, [], tpl, []);
  expect(out).not.toContain("# 既知の前提");
});

test("前提ありなら種類順（目標→制約→事実→仮説）で見出し分けして差し込む", () => {
  const out = buildMeetingPrompt(baseInput, set, [], tpl, [
    premise({ kind: "fact", body: "星5のみ" }),
    premise({ kind: "goal", body: "販売増" }),
    premise({ kind: "constraint", body: "1人運営" }),
  ]);
  expect(out).toContain("# 既知の前提（確定事項）");
  expect(out).toContain("星5のみ");
  expect(out.indexOf("販売増")).toBeLessThan(out.indexOf("1人運営"));
  expect(out.indexOf("1人運営")).toBeLessThan(out.indexOf("星5のみ"));
});

test("retired の前提は呼び出し側で除外される前提だが、混入しても描画する（フィルタは store 責務）", () => {
  // buildMeetingPrompt は渡された active 前提をそのまま描画する契約であることを明示
  const out = buildMeetingPrompt(baseInput, set, [], tpl, [premise({ body: "A" })]);
  expect(out).toContain("A");
});

test("抽出プロンプトは共通ヘッダと種類の凡例を含む", () => {
  const p = buildPremiseExtractionPrompt();
  expect(p).toContain("### 抽出した前提");
  expect(p).toContain("[fact]");
  expect(p).toContain("会議の結論");
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npm test -- promptBuilder`
Expected: FAIL。

- [ ] **Step 3: 実装**

`promptBuilder.ts` に追加・修正:
- import に `Premise`, `PREMISE_KIND_LABELS`, `PREMISE_KIND_ORDER` を追加。`premiseFormat` から `PREMISE_EXTRACTION_HEADER` を import。
- 前提セクション描画関数:
```ts
function renderPremisesSection(premises: Premise[]): string | null {
  const active = premises.filter((p) => p.status === "active");
  if (active.length === 0) return null;
  const parts: string[] = [
    "# 既知の前提（確定事項）",
    "以下はオーナーが確定済みと宣言した前提である。これらは断定して議論を進めてよい。ここに書かれていない事実は、従来どおり断定せず、必要なら会長に確認せよ。",
  ];
  for (const kind of PREMISE_KIND_ORDER) {
    const items = active.filter((p) => p.kind === kind);
    if (items.length === 0) continue;
    parts.push(
      `## ${PREMISE_KIND_LABELS[kind]}\n` +
        items.map((p) => `- ${p.body}`).join("\n"),
    );
  }
  return parts.join("\n\n");
}
```
- `buildMeetingPrompt(input, set, profiles, outputTemplate, premises: Premise[] = [])` にし、`# 私の立場` ブロックを push した直後に:
```ts
const premisesSection = renderPremisesSection(premises);
if (premisesSection) parts.push(premisesSection);
```
- `PRE_TASK` の文言に「ただし『# 既知の前提』に記載済みの点は再宣言せず、書かれていない点についてのみ仮定を宣言せよ。」を追記。
- 抽出プロンプト:
```ts
export function buildPremiseExtractionPrompt(): string {
  return `直前までの会話をもとに、私（オーナー/会長）がこの会話で開示・表明した「ブランドや事業の前提」だけを抽出してください。

# 重要な区別
- 対象は「私がこういう事業/ブランドだと述べた事実・制約・目標・仮説」だけ。
- 会議の結論・各役員の主張・提案・意思決定は前提ではないので含めない。
- 新情報が無ければ「（追加なし）」とだけ返す。

# 出力フォーマット（厳守）
${PREMISE_EXTRACTION_HEADER}
- [fact] 事実の前提
- [constraint] 制約の前提
- [goal] 目標の前提
- [hypothesis] 仮説の前提

kind は fact / constraint / goal / hypothesis のいずれか。1行1前提。簡潔に。`;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（全テスト）。

- [ ] **Step 5: 既存呼び出しの後方互換を型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし（`app/page.tsx` は premises 未指定でも動く）。

- [ ] **Step 6: コミット**

```bash
git add lib/promptBuilder.ts lib/__tests__/promptBuilder.test.ts
git commit -m "feat: 会議プロンプトへの前提差し込みと抽出プロンプトを追加"
```

---

## Task 5: マイグレーションと localStorage シード

**Files:**
- Modify: `supabase/migration.sql`
- Modify: `lib/seed.ts`

- [ ] **Step 1: `bm_themes` / `bm_premises` の DDL を追加**

`migration.sql` のスキーマ節（`bm_output_templates` の後）に追加:
```sql
create table if not exists bm_themes (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references bm_profile_sets(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bm_themes_set_id_idx on bm_themes(set_id);

create table if not exists bm_premises (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references bm_profile_sets(id) on delete cascade,
  theme_id uuid references bm_themes(id) on delete cascade,
  body text not null,
  kind text not null default 'fact',
  status text not null default 'active',
  source text not null default 'manual',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bm_premises_set_id_idx on bm_premises(set_id);
create index if not exists bm_premises_theme_id_idx on bm_premises(theme_id);
```

- [ ] **Step 2: RLS を追加**

`alter table ... enable row level security;` に2テーブルを追加し、`do $$ ... $$` ブロックに既存パターンで `bm_themes_all` / `bm_premises_all`（`for all using (true) with check (true)`）ポリシーを追加。

- [ ] **Step 3: localStorage シードキーを追加**

`lib/store.ts` の `LS_KEYS` に `themes: "bm_themes"`, `premises: "bm_premises"` を追加（Task 6 と重複するので Task 6 で実施でも可。ここでは seed 側のみ）。`lib/seed.ts` に `export const SEED_THEMES: Theme[] = [];` と `export const SEED_PREMISES: Premise[] = [];`（初期は空）を追加し、型を import。

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 5: コミット**

```bash
git add supabase/migration.sql lib/seed.ts
git commit -m "feat: 前提ストアのマイグレーションと空シードを追加"
```

---

## Task 6: データアクセス層（`lib/store.ts`）

**Files:**
- Modify: `lib/store.ts`

Supabase / localStorage 両対応。既存関数と同じパターンで実装する。

- [ ] **Step 1: LS_KEYS と import を追加**

`LS_KEYS` に `themes`, `premises` を追加。`ensureSeeded` に `lsWrite(LS_KEYS.themes, SEED_THEMES)` と `lsWrite(LS_KEYS.premises, SEED_PREMISES)` を追加。import に `Theme`, `Premise`, `SEED_THEMES`, `SEED_PREMISES` を追加。

- [ ] **Step 2: テーマ CRUD を実装**

`listThemes(setId)`, `createTheme(setId, name, description)`, `updateTheme(theme)`, `deleteTheme(id)`, `reorderThemes(themes)` を、既存 `listProfiles`/`upsertProfile`/`reorderProfiles` と同じ Supabase-or-LS パターンで実装。Supabase 側は `bm_themes` を `set_id` で絞り `sort_order` 昇順。

- [ ] **Step 3: 前提 CRUD を実装**

- `listPremises(setId)`: 会社の全前提（会社常設＋テーマ別、全 status）を返す。管理画面用。
- `listActivePremisesForGeneration(setId, themeId?)`: `status='active'` かつ（`theme_id IS NULL` または `theme_id = themeId`）を返す。差し込み用。Supabase 側は `.eq("set_id", setId).eq("status","active")` 後、JS 側で `theme_id === null || theme_id === themeId` を filter（`themeId` 未指定なら会社常設のみ）。
- `upsertPremise(premise)`: 保存前に重複チェック — 同一 `set_id` かつ同一 `theme_id`（null 同士も一致）で `body`（trim 済み）完全一致が既存にあれば保存せず既存を返す。新規 id 採番は既存 upsert 同様。
- `deletePremise(id)`, `setPremiseStatus(id, status)`（`bm_premises` の `status` のみ update / LS も同様）。

- [ ] **Step 4: 型チェックとテスト**

Run: `npx tsc --noEmit && npm test`
Expected: 型エラーなし・既存テスト PASS。

- [ ] **Step 5: コミット**

```bash
git add lib/store.ts
git commit -m "feat: テーマ・前提のデータアクセス層を追加"
```

---

## Task 7: 前提管理・取り込み画面（`app/premises/page.tsx`）

**Files:**
- Create: `app/premises/page.tsx`
- Modify: `app/layout.tsx`

`app/profiles/page.tsx` の実装パターン（"use client"、`Card`/`Field`/`Button`、set 選択、CRUD の楽観更新）を踏襲する。

- [ ] **Step 1: ナビに「前提」を追加**

`layout.tsx` の `navItems` に `{ href: "/premises", label: "前提", icon: "🧾" }` を「出力形式」の前に追加。

- [ ] **Step 2: 画面を実装**

`app/premises/page.tsx` を作成。構成:
- 会社（set）選択セレクト。
- テーマ管理: テーマ一覧（追加・改名・description 編集・削除）。「会社常設（テーマなし）」を常に選べる仮想項目として先頭に置く。
- 選択中スコープ（会社常設 or 選択テーマ）の前提一覧: 種類バッジ・本文・棄却/復帰トグル・削除。手動追加フォーム（本文＋種類セレクト）。`upsertPremise` で保存（`theme_id` は選択スコープ、`source='manual'`）。
- 取り込みカード: `textarea` にペースト → 「解析」ボタンで `parsePremiseText()` → 候補をチェックリスト表示（既存重複は「既存」ラベルで無効化）→ 「選択した前提を保存」で `upsertPremise`（`source='chat'`、`theme_id` は選択スコープ）。
- storageMode が local のときは既存同様バナー表示（任意）。

- [ ] **Step 3: ビルドで検証**

Run: `npm run build`
Expected: 型・ビルド成功。`/premises` がルートとして出力される。

- [ ] **Step 4: コミット**

```bash
git add app/premises/page.tsx app/layout.tsx
git commit -m "feat: 前提管理・取り込み画面を追加"
```

---

## Task 8: 生成画面にテーマ選択・前提プレビュー・抽出プロンプト（`app/page.tsx`）

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: テーマ状態と読み込みを追加**

`themes`/`themeId`/`previewPremises` の state を追加。set 切替の useEffect で `listThemes(setId)` を読み、`themeId` を空（会社常設のみ）に初期化。`themeId` か `setId` 変化時に `listActivePremisesForGeneration(setId, themeId||undefined)` を読み `previewPremises` に格納。

- [ ] **Step 2: テーマ選択 UI と前提プレビューを追加**

「プロファイルセット」`Field` の下にテーマ選択 `select`（先頭に「テーマなし（会社常設のみ）」）。その下に折りたたみ（`<details>`）で `previewPremises` を種類別に一覧表示（0件なら「差し込む前提はありません」）。

- [ ] **Step 3: 生成に premises を渡す**

`generate()` 内の `buildMeetingPrompt(input, currentSet, selected, tpl)` を `buildMeetingPrompt(input, currentSet, selected, tpl, previewPremises)` に変更。`input` に `themeId: themeId || undefined` を追加。

- [ ] **Step 4: 前提追加プロンプトの出力ブロックを追加**

出力エリア（`prompt &&` ブロック内）に3つ目の `OutputBlock` を追加。`title="前提追加プロンプト"`, `subtitle="会議の最後に流し、出力を『前提』画面に貼り付ける"`, `text={buildPremiseExtractionPrompt()}`。import に `buildPremiseExtractionPrompt` を追加。

- [ ] **Step 5: ビルドで検証**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 6: 手動スモーク（任意・可能なら）**

Run: `npm run dev` → `/` でテーマ選択・生成、`/premises` で前提追加→生成プロンプトに反映されるか確認。

- [ ] **Step 7: コミット**

```bash
git add app/page.tsx
git commit -m "feat: 生成画面にテーマ選択・前提プレビュー・抽出プロンプトを追加"
```

---

## Task 9: `/meeting` コマンドの MCP 直書き手順（任意経路）

**Files:**
- Modify: `.claude/commands/meeting.md`

- [ ] **Step 1: 手順5として前提追記を追加**

`## 手順` に「5. 前提を追記する（任意）」を追加:
- 会議中に会長（オーナー）が開示・表明したブランド前提のみを対象とし、会議の結論・役員の主張は含めない。
- 対象セットの `bm_premises` に `set_id`（＋テーマ指定があれば `theme_id`）、`body`、`kind`（fact/constraint/goal/hypothesis）、`status='active'`、`source='chat'` で insert（Supabase MCP）。
- 既存本文と重複する前提は追記しない。
- 誤りは後からアプリの「前提」画面で棄却できる旨を明記。

- [ ] **Step 2: コミット**

```bash
git add .claude/commands/meeting.md
git commit -m "feat: /meeting に前提の MCP 直書き手順を追加"
```

---

## Task 10: 仕上げ（全体検証と README）

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 全テスト＆ビルド**

Run: `npm test && npm run build`
Expected: すべて PASS／成功。

- [ ] **Step 2: README に前提ストアの説明を追記**

「画面」節に「前提（`/premises`）」を追加し、2層（会社常設／テーマ別）と取り込み動線を1〜2文で説明。

- [ ] **Step 3: コミット**

```bash
git add README.md
git commit -m "docs: 前提ストアの説明を README に追記"
```
