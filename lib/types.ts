// 役員会議プロンプト生成アプリ 型定義

/** 保有条件フィールド1項目 */
export type ProfileField = {
  /** 表示ラベル（例: 制作時間（1個あたり）） */
  label: string;
  /** 値（数値 or 文字列）。空文字は未設定扱い */
  value: string | number;
  /** 単位（例: 分・個・円）。任意 */
  unit?: string;
  /** 外注倍率など補助値。任意 */
  multiplier?: number;
};

/** fields は「キー → フィールド」のマップ */
export type ProfileFields = Record<string, ProfileField>;

/** プロファイルセット（bm_profile_sets） */
export type ProfileSet = {
  id: string;
  name: string;
  /** 会社の定常的な説明（ブランドの性格・運営形態）。仕様の拡張カラム */
  company: string;
  created_at?: string;
};

/** 役プロファイル（bm_profiles） */
export type Profile = {
  id: string;
  set_id: string;
  role_key: string;
  role_name: string;
  icon: string;
  fields: ProfileFields;
  judgment_basis: string;
  interest: string;
  prohibitions: string;
  /** 行動原則（議題非依存の思考の癖） */
  action_principle: string;
  sort_order: number;
};

/** 出力テンプレート（bm_output_templates） */
export type OutputTemplate = {
  id: string;
  key: string;
  name: string;
  body: string;
};

/** 立場 */
export type Stance = "chairman" | "president" | "customer" | "observer";

/** 入力モード（条件の濃さ） */
export type InputMode = "strict" | "loose" | "auto";

/** 生成画面の入力 */
export type GenerationInput = {
  topic: string;
  stance: Stance;
  setId: string;
  /** 招集メンバー（profile id の配列）。デフォルトは全役 */
  selectedRoleIds: string[];
  /** 悪魔の代弁者を招集するか */
  includeDevil: boolean;
  inputMode: InputMode;
  /** 出力テンプレートの key */
  outputTemplateKey: string;
  /** 選択テーマ（未選択なら会社常設のみ差し込む） */
  themeId?: string;
};

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

/** 差し込み・表示時の見出し順（目標→制約→事実→仮説） */
export const PREMISE_KIND_ORDER: PremiseKind[] = [
  "goal",
  "constraint",
  "fact",
  "hypothesis",
];

export const STANCE_LABELS: Record<Stance, string> = {
  chairman: "会長",
  president: "社長",
  customer: "顧客",
  observer: "観察者",
};

export const INPUT_MODE_LABELS: Record<InputMode, string> = {
  strict: "きっちり",
  loose: "ざっくり",
  auto: "お任せ",
};

export const INPUT_MODE_DESCRIPTIONS: Record<InputMode, string> = {
  strict: "保存済みプロファイルの条件をフル投入（投資判断など重い議題）",
  loose: "一部だけ埋め、残りはAIが仮の前提を宣言してから議論（条件が一部不明な議題）",
  auto: "条件ほぼ空。役と議題だけ渡し、AIが前提ごと提案（アイデア出し・壁打ち）",
};
