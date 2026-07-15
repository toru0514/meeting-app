// データアクセス層。
// Supabase が設定されていれば bm_ テーブルを読み書きし、
// 未設定なら localStorage にフォールバックする（プロンプト生成は即使える）。

import {
  SEED_OUTPUT_TEMPLATES,
  SEED_PREMISES,
  SEED_PROFILES,
  SEED_SET,
  SEED_THEMES,
} from "./seed";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  OutputTemplate,
  Premise,
  PremiseStatus,
  Profile,
  ProfileSet,
  Theme,
} from "./types";

export const storageMode: "supabase" | "local" = isSupabaseConfigured
  ? "supabase"
  : "local";

const LS_KEYS = {
  sets: "bm_profile_sets",
  profiles: "bm_profiles",
  templates: "bm_output_templates",
  themes: "bm_themes",
  premises: "bm_premises",
  seeded: "bm_seeded_v1",
};

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // フォールバック（ほぼ使われない）
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- localStorage helpers ----------

function lsRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeeded(): void {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(LS_KEYS.seeded)) return;
  lsWrite(LS_KEYS.sets, [SEED_SET]);
  lsWrite(LS_KEYS.profiles, SEED_PROFILES);
  lsWrite(LS_KEYS.templates, SEED_OUTPUT_TEMPLATES);
  lsWrite(LS_KEYS.themes, SEED_THEMES);
  lsWrite(LS_KEYS.premises, SEED_PREMISES);
  window.localStorage.setItem(LS_KEYS.seeded, "1");
}

// ---------- Profile Sets ----------

export async function listSets(): Promise<ProfileSet[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("bm_profile_sets")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProfileSet[];
  }
  ensureSeeded();
  return lsRead<ProfileSet[]>(LS_KEYS.sets, []);
}

export async function createSet(name: string, company: string): Promise<ProfileSet> {
  const sb = getSupabase();
  const row: ProfileSet = { id: uuid(), name, company };
  if (sb) {
    const { data, error } = await sb
      .from("bm_profile_sets")
      .insert({ name, company })
      .select()
      .single();
    if (error) throw error;
    return data as ProfileSet;
  }
  const sets = lsRead<ProfileSet[]>(LS_KEYS.sets, []);
  sets.push(row);
  lsWrite(LS_KEYS.sets, sets);
  return row;
}

export async function updateSet(set: ProfileSet): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from("bm_profile_sets")
      .update({ name: set.name, company: set.company })
      .eq("id", set.id);
    if (error) throw error;
    return;
  }
  const sets = lsRead<ProfileSet[]>(LS_KEYS.sets, []);
  const idx = sets.findIndex((s) => s.id === set.id);
  if (idx >= 0) sets[idx] = set;
  lsWrite(LS_KEYS.sets, sets);
}

export async function deleteSet(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("bm_profile_sets").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  lsWrite(
    LS_KEYS.sets,
    lsRead<ProfileSet[]>(LS_KEYS.sets, []).filter((s) => s.id !== id),
  );
  lsWrite(
    LS_KEYS.profiles,
    lsRead<Profile[]>(LS_KEYS.profiles, []).filter((p) => p.set_id !== id),
  );
}

// ---------- Profiles ----------

export async function listProfiles(setId: string): Promise<Profile[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("bm_profiles")
      .select("*")
      .eq("set_id", setId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Profile[];
  }
  ensureSeeded();
  return lsRead<Profile[]>(LS_KEYS.profiles, [])
    .filter((p) => p.set_id === setId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function upsertProfile(profile: Profile): Promise<Profile> {
  const sb = getSupabase();
  const row: Profile = { ...profile, id: profile.id || uuid() };
  if (sb) {
    const { data, error } = await sb
      .from("bm_profiles")
      .upsert({
        id: row.id,
        set_id: row.set_id,
        role_key: row.role_key,
        role_name: row.role_name,
        icon: row.icon,
        fields: row.fields,
        judgment_basis: row.judgment_basis,
        interest: row.interest,
        prohibitions: row.prohibitions,
        action_principle: row.action_principle,
        sort_order: row.sort_order,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Profile;
  }
  const profiles = lsRead<Profile[]>(LS_KEYS.profiles, []);
  const idx = profiles.findIndex((p) => p.id === row.id);
  if (idx >= 0) profiles[idx] = row;
  else profiles.push(row);
  lsWrite(LS_KEYS.profiles, profiles);
  return row;
}

export async function deleteProfile(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("bm_profiles").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  lsWrite(
    LS_KEYS.profiles,
    lsRead<Profile[]>(LS_KEYS.profiles, []).filter((p) => p.id !== id),
  );
}

/** 並び替え結果を一括保存 */
export async function reorderProfiles(profiles: Profile[]): Promise<void> {
  const sb = getSupabase();
  const updated = profiles.map((p, i) => ({ ...p, sort_order: i + 1 }));
  if (sb) {
    for (const p of updated) {
      const { error } = await sb
        .from("bm_profiles")
        .update({ sort_order: p.sort_order })
        .eq("id", p.id);
      if (error) throw error;
    }
    return;
  }
  const all = lsRead<Profile[]>(LS_KEYS.profiles, []);
  for (const p of updated) {
    const idx = all.findIndex((x) => x.id === p.id);
    if (idx >= 0) all[idx] = p;
  }
  lsWrite(LS_KEYS.profiles, all);
}

// ---------- Output Templates ----------

export async function listOutputTemplates(): Promise<OutputTemplate[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("bm_output_templates").select("*");
    if (error) throw error;
    const rows = (data ?? []) as OutputTemplate[];
    return rows.length > 0 ? rows : SEED_OUTPUT_TEMPLATES;
  }
  ensureSeeded();
  return lsRead<OutputTemplate[]>(LS_KEYS.templates, SEED_OUTPUT_TEMPLATES);
}

export async function upsertOutputTemplate(
  tpl: OutputTemplate,
): Promise<OutputTemplate> {
  const sb = getSupabase();
  const row: OutputTemplate = { ...tpl, id: tpl.id || uuid() };
  if (sb) {
    const { data, error } = await sb
      .from("bm_output_templates")
      .upsert(row)
      .select()
      .single();
    if (error) throw error;
    return data as OutputTemplate;
  }
  const tpls = lsRead<OutputTemplate[]>(LS_KEYS.templates, SEED_OUTPUT_TEMPLATES);
  const idx = tpls.findIndex((t) => t.id === row.id);
  if (idx >= 0) tpls[idx] = row;
  else tpls.push(row);
  lsWrite(LS_KEYS.templates, tpls);
  return row;
}

export async function deleteOutputTemplate(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("bm_output_templates").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  lsWrite(
    LS_KEYS.templates,
    lsRead<OutputTemplate[]>(LS_KEYS.templates, SEED_OUTPUT_TEMPLATES).filter(
      (t) => t.id !== id,
    ),
  );
}

// ---------- Themes ----------

export async function listThemes(setId: string): Promise<Theme[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("bm_themes")
      .select("*")
      .eq("set_id", setId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Theme[];
  }
  ensureSeeded();
  return lsRead<Theme[]>(LS_KEYS.themes, [])
    .filter((t) => t.set_id === setId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function createTheme(
  setId: string,
  name: string,
  description = "",
): Promise<Theme> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("bm_themes")
      .insert({ set_id: setId, name, description })
      .select()
      .single();
    if (error) throw error;
    return data as Theme;
  }
  const themes = lsRead<Theme[]>(LS_KEYS.themes, []);
  const sort_order =
    themes.filter((t) => t.set_id === setId).length + 1;
  const row: Theme = { id: uuid(), set_id: setId, name, description, sort_order };
  themes.push(row);
  lsWrite(LS_KEYS.themes, themes);
  return row;
}

export async function updateTheme(theme: Theme): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from("bm_themes")
      .update({
        name: theme.name,
        description: theme.description,
        sort_order: theme.sort_order,
      })
      .eq("id", theme.id);
    if (error) throw error;
    return;
  }
  const themes = lsRead<Theme[]>(LS_KEYS.themes, []);
  const idx = themes.findIndex((t) => t.id === theme.id);
  if (idx >= 0) themes[idx] = theme;
  lsWrite(LS_KEYS.themes, themes);
}

export async function deleteTheme(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("bm_themes").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  lsWrite(
    LS_KEYS.themes,
    lsRead<Theme[]>(LS_KEYS.themes, []).filter((t) => t.id !== id),
  );
  // テーマ配下の前提も削除（DB は on delete cascade で消える）
  lsWrite(
    LS_KEYS.premises,
    lsRead<Premise[]>(LS_KEYS.premises, []).filter((p) => p.theme_id !== id),
  );
}

// ---------- Premises ----------

/** 会社の全前提（会社常設＋テーマ別、全 status）。管理画面用。 */
export async function listPremises(setId: string): Promise<Premise[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("bm_premises")
      .select("*")
      .eq("set_id", setId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Premise[];
  }
  ensureSeeded();
  return lsRead<Premise[]>(LS_KEYS.premises, [])
    .filter((p) => p.set_id === setId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** 差し込み用。active かつ（会社常設 または 指定テーマ）の前提を返す。 */
export async function listActivePremisesForGeneration(
  setId: string,
  themeId?: string,
): Promise<Premise[]> {
  const all = await listPremises(setId);
  return all.filter(
    (p) =>
      p.status === "active" &&
      (p.theme_id === null || (themeId != null && p.theme_id === themeId)),
  );
}

/** 保存。同一 set_id かつ同一 theme_id（null 同士も一致）で body 完全一致の重複はスキップ。 */
export async function upsertPremise(premise: Premise): Promise<Premise> {
  const row: Premise = { ...premise, id: premise.id || uuid() };
  const body = row.body.trim();
  row.body = body;

  // 新規追加時のみ重複チェック
  if (!premise.id) {
    const existing = await listPremises(row.set_id);
    const dup = existing.find(
      (p) =>
        p.theme_id === row.theme_id && p.body.trim() === body,
    );
    if (dup) return dup;
  }

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("bm_premises")
      .upsert({
        id: row.id,
        set_id: row.set_id,
        theme_id: row.theme_id,
        body: row.body,
        kind: row.kind,
        status: row.status,
        source: row.source,
        sort_order: row.sort_order,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Premise;
  }
  const premises = lsRead<Premise[]>(LS_KEYS.premises, []);
  const idx = premises.findIndex((p) => p.id === row.id);
  if (idx >= 0) premises[idx] = row;
  else premises.push(row);
  lsWrite(LS_KEYS.premises, premises);
  return row;
}

export async function deletePremise(id: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from("bm_premises").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  lsWrite(
    LS_KEYS.premises,
    lsRead<Premise[]>(LS_KEYS.premises, []).filter((p) => p.id !== id),
  );
}

export async function setPremiseStatus(
  id: string,
  status: PremiseStatus,
): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from("bm_premises")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const premises = lsRead<Premise[]>(LS_KEYS.premises, []);
  const idx = premises.findIndex((p) => p.id === id);
  if (idx >= 0) premises[idx] = { ...premises[idx], status };
  lsWrite(LS_KEYS.premises, premises);
}
