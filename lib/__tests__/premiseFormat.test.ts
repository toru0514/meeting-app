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
