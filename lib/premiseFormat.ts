import type { PremiseKind } from "./types";

// 前提の機械可読フォーマットの単一情報源。
// 抽出プロンプトの出力・取り込み欄のパーサ・テストがすべてここを参照する。

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
