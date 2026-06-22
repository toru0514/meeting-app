// データアクセス層。
// Supabase が設定されていれば bm_ テーブルを読み書きし、
// 未設定なら localStorage にフォールバックする（プロンプト生成は即使える）。

import {
  SEED_OUTPUT_TEMPLATES,
  SEED_PROFILES,
  SEED_SET,
} from "./seed";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { OutputTemplate, Profile, ProfileSet } from "./types";

export const storageMode: "supabase" | "local" = isSupabaseConfigured
  ? "supabase"
  : "local";

const LS_KEYS = {
  sets: "bm_profile_sets",
  profiles: "bm_profiles",
  templates: "bm_output_templates",
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
