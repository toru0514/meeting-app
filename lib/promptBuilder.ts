import { PREMISE_EXTRACTION_HEADER } from "./premiseFormat";
import { DEVIL } from "./seed";
import {
  GenerationInput,
  OutputTemplate,
  Premise,
  PREMISE_KIND_LABELS,
  PREMISE_KIND_ORDER,
  Profile,
  ProfileField,
  ProfileSet,
  STANCE_LABELS,
} from "./types";

/** 立場に応じた進め方の指示 */
function stanceInstruction(stance: GenerationInput["stance"]): string {
  switch (stance) {
    case "chairman":
      return `各役の議論には介入しないが、議論の途中で**事実や前提を小出しに開示すること**がある（例：既存の保有機材、在庫の消化状況、本当のボトルネックの所在、予算の制約など）。その開示があった瞬間、各役は**直ちに自分の立場を再評価**し、必要なら堂々と前言を撤回・転向せよ。転向は敗北ではなく、事実に誠実であることの証である。最終的な判断は私が下す。`;
    case "president":
      return `私は最終決定権を持つ。各役の議論を踏まえ、最後に私が1つに決める。各役は私を説得するつもりで、忖度なく本音で意見をぶつけよ。`;
    case "customer":
      return `私は一人の顧客として参加する。各役は、私（顧客）に直接ヒアリングしながら議論を進めよ。専門用語を避け、私の感情・購買意欲・価格の納得感を引き出してから結論に向かえ。`;
    case "observer":
      return `私は議論を観察するだけで介入しない。各役は私がいない前提で自由に議論し、結論まで自走せよ。`;
  }
}

/** 1フィールドを「ラベル: 値 単位（補助）」に整形。値が空なら null */
function formatField(field: ProfileField): string | null {
  const value = typeof field.value === "number" ? String(field.value) : field.value.trim();
  if (!value) return null;
  let line = `${field.label}: ${value}`;
  if (field.unit) line += field.unit;
  if (field.multiplier != null) line += `（単価倍率 ${field.multiplier}）`;
  return line;
}

/** 役の保有条件を整形 */
function formatFields(profile: Profile): string {
  const lines = Object.values(profile.fields)
    .map(formatField)
    .filter((l): l is string => l !== null);
  if (lines.length === 0) return "（保有条件は未設定）";
  return lines.join(" / ");
}

/** 1役分の定義ブロック */
function renderProfile(profile: Profile): string {
  return `### ${profile.icon} ${profile.role_name}
- 保有条件: ${formatFields(profile)}
- 判断基準: ${profile.judgment_basis}
- 利害: ${profile.interest}
- 禁止: ${profile.prohibitions}
- 行動原則: ${profile.action_principle}`;
}

const COMMON_RULES = `# 全役員への共通規律
1. **「○○である必然性」から逃げるな。** 特定の案・金額・選択肢を推すなら、「なぜそれなのか」「なぜ安価・小規模な代替ではダメなのか」を最初に説明せよ。必然性を説明できないまま賛成するのは禁止。
2. **確定していない事実を勝手に断定するな。** ボトルネックがどこか、在庫が捌けているか等を決めつけて議論を進めるな。決定変数が会長の手元にあるなら、それを特定して残論点に上げよ。
3. **「安さ」は「今やる理由」ではない。** セール・値引き・期間限定は「いつやるか」を変えるが「そもそも必要か」を変えない。混同するな。
4. **ボトルネック（律速）を取り違えるな。** 課題が「作れない」のか「売れない」のか「開発が遅い」のか「時間がない」のか。投資・施策はその時点の真のボトルネックにのみ効く。所在を明示してから案を語れ。
5. **既出意見の繰り返しは禁止。** 新しい論点か、名指しの具体的反論のみ。
6. **反対根拠が事実で消えたら、潔く撤回せよ。** それも誠実さである。`;

const PRE_TASK = `# 事前タスク（議論の前に）
各役は、自分の判断に必要な条件（予算の細部、現在の制作・運用状況、保有機材・リソースなど）が不明な場合、「小規模な1人運営の木工ブランドならこうだろう」という現実的な前提を自分で1〜2行で宣言してから議論を始めよ。前提は明示し、不明な点は断定せず「もし〇〇なら」と条件化して会長に事実確認を促せ。ただし「# 既知の前提」に記載済みの点は再宣言せず、書かれていない点についてのみ仮定を宣言せよ。`;

/** 会社常設＋テーマ別の active 前提を「# 既知の前提」セクションに整形する。0件なら null */
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
      `## ${PREMISE_KIND_LABELS[kind]}\n` + items.map((p) => `- ${p.body}`).join("\n"),
    );
  }
  return parts.join("\n\n");
}

/** 会議末に流す「前提追加プロンプト」。会話からオーナー由来の前提のみを抽出させる。 */
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

const FLOW = `# 進め方
1. 各役が議題に意見を述べる（最低1回ずつ）。立場は自然と分かれるはず。
2. 対立したら、相手の発言に名指しで反論し、噛み合わせる。既出意見の繰り返しは禁止。
3. 悪魔の代弁者が穴を突く。
4. 会長が途中で新たな事実・前提を開示したら、各役は直ちに再評価し、必要なら転向せよ。ボトルネックの所在が移動したら、推奨案も移動してよい（むしろそれが正しい）。
5. 2〜3往復したら（または会長の判断材料が出揃ったら）、以下の形式で結論をまとめる。
6. 結論は1つに絞る。ただし決定変数が会長の手元の事実に依存する場合は、「もしXならA、もしYならB」という条件分岐で一意に定まる形にし、その決定変数を残論点の筆頭に置け。`;

/**
 * 会議プロンプトを合成する。
 * @param input 生成画面の入力
 * @param set 選択中のプロファイルセット
 * @param profiles 招集された役（sort_order 順を想定）
 * @param outputTemplate 選択された出力テンプレート
 */
export function buildMeetingPrompt(
  input: GenerationInput,
  set: ProfileSet,
  profiles: Profile[],
  outputTemplate: OutputTemplate,
  premises: Premise[] = [],
): string {
  const stanceLabel = STANCE_LABELS[input.stance];
  const memberCount = profiles.length + (input.includeDevil ? 1 : 0);

  const parts: string[] = [];

  parts.push(
    `あなたは1人で、以下の役員会議をファシリテートし、${memberCount}人の役員を演じ分け、最終的に1つの結論を出してください。役同士は利害が対立します。馴れ合いや玉虫色の結論は禁止します。`,
  );

  parts.push(`# 会社\n${set.company}`);

  parts.push(`# 議題\n${input.topic.trim() || "（議題未入力）"}`);

  parts.push(
    `# 私の立場\n私は「${stanceLabel}」として参加する。\n${stanceInstruction(input.stance)}`,
  );

  // 既知の前提（会社常設＋テーマ別）。会議の土台情報として立場の直後に置く。
  const premisesSection = renderPremisesSection(premises);
  if (premisesSection) parts.push(premisesSection);

  // 社長役と立場の重複に対する注記
  if (input.stance === "president" && profiles.some((p) => p.role_key === "president")) {
    parts.push(
      `> 注: 社長は私自身が務めるため、AIは社長役を演じる必要はない。社長の発言は私の意見として扱い、他の役員が私を説得する構図にせよ。`,
    );
  }

  // 事前タスクは「ざっくり」「お任せ」モードのみ
  if (input.inputMode !== "strict") {
    parts.push(PRE_TASK);
  }

  parts.push(COMMON_RULES);

  // 参加する役員
  const roleBlocks = profiles.map(renderProfile).join("\n\n");
  let membersSection = `# 参加する役員（${memberCount}名）\nそれぞれの判断基準・利害・禁止事項・行動原則を厳守し、立場を一貫させること。\n（行動原則は議題を問わず働く思考の癖。特定の結論を先取りするものではない。）\n\n${roleBlocks}`;

  if (input.includeDevil) {
    membersSection += `\n\n### ${DEVIL.icon} ${DEVIL.role_name}（常駐）\n${DEVIL.body}`;
  }
  parts.push(membersSection);

  parts.push(FLOW);

  parts.push(`# 最終アウトプット（この形式を必ず守る）\n${outputTemplate.body}`);

  return parts.join("\n\n");
}

/** 議事録 Markdown テンプレートを生成する */
export function buildMinutesTemplate(
  input: GenerationInput,
  prompt: string,
  dateStr: string,
): string {
  const stanceLabel = STANCE_LABELS[input.stance];
  const topic = input.topic.trim() || "（議題）";
  return `# 議題: ${topic}
日付: ${dateStr} / 私の立場: ${stanceLabel}

## 投げたプロンプト
${prompt}

## AIの結論
（Claudeの応答をここに貼る）

## 最終決定（私の判断）
（自分の決定を1〜2行で記録）`;
}

/** 議事録ファイル名の提案（/meetings/YYYY-MM-DD_議題.md） */
export function suggestMinutesFilename(input: GenerationInput, dateStr: string): string {
  const topic = (input.topic.trim() || "議題")
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .slice(0, 40);
  return `${dateStr}_${topic}.md`;
}
