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

test("渡された active 前提はそのまま描画する（フィルタは store 責務）", () => {
  const out = buildMeetingPrompt(baseInput, set, [], tpl, [premise({ body: "A" })]);
  expect(out).toContain("A");
});

test("抽出プロンプトは共通ヘッダと種類の凡例を含む", () => {
  const p = buildPremiseExtractionPrompt();
  expect(p).toContain("### 抽出した前提");
  expect(p).toContain("[fact]");
  expect(p).toContain("会議の結論");
});
