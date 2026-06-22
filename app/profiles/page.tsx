"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, Field } from "@/components/ui";
import {
  createSet,
  deleteProfile,
  deleteSet,
  listProfiles,
  listSets,
  reorderProfiles,
  storageMode,
  updateSet,
  upsertProfile,
} from "@/lib/store";
import { Profile, ProfileField, ProfileFields, ProfileSet } from "@/lib/types";

function emptyProfile(setId: string, sortOrder: number): Profile {
  return {
    id: "",
    set_id: setId,
    role_key: "",
    role_name: "",
    icon: "🙂",
    fields: {},
    judgment_basis: "",
    interest: "",
    prohibitions: "",
    action_principle: "",
    sort_order: sortOrder,
  };
}

export default function ProfilesPage() {
  const [sets, setSets] = useState<ProfileSet[]>([]);
  const [setId, setSetId] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);

  const currentSet = useMemo(() => sets.find((s) => s.id === setId), [sets, setId]);

  async function reloadSets() {
    const s = await listSets();
    setSets(s);
    if (s.length > 0 && !s.some((x) => x.id === setId)) setSetId(s[0].id);
  }

  async function reloadProfiles(id: string) {
    setProfiles(await listProfiles(id));
  }

  useEffect(() => {
    (async () => {
      try {
        await reloadSets();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!setId) return;
    reloadProfiles(setId).catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [setId]);

  async function handleNewSet() {
    const name = window.prompt("新しいセット名", "新規セット");
    if (!name) return;
    const s = await createSet(name, currentSet?.company ?? "");
    await reloadSets();
    setSetId(s.id);
  }

  async function handleSaveSetMeta(name: string, company: string) {
    if (!currentSet) return;
    await updateSet({ ...currentSet, name, company });
    await reloadSets();
  }

  async function handleDeleteSet() {
    if (!currentSet) return;
    if (sets.length <= 1) {
      window.alert("最後のセットは削除できません");
      return;
    }
    if (!window.confirm(`セット「${currentSet.name}」と所属する役を削除しますか?`))
      return;
    await deleteSet(currentSet.id);
    await reloadSets();
  }

  async function handleSaveProfile(p: Profile) {
    try {
      await upsertProfile(p);
      setEditing(null);
      await reloadProfiles(setId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteProfile(id: string) {
    if (!window.confirm("この役を削除しますか?")) return;
    await deleteProfile(id);
    await reloadProfiles(setId);
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...profiles];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setProfiles(next);
    await reorderProfiles(next);
    await reloadProfiles(setId);
  }

  if (loading) return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;

  return (
    <div>
      {storageMode === "local" && (
        <Banner tone="warn">
          ⚠️ ローカルモード（Supabase 未設定）。変更はこの端末のブラウザに保存されます。
        </Banner>
      )}
      {error && <Banner tone="warn">エラー: {error}</Banner>}

      <SetEditor
        sets={sets}
        setId={setId}
        onSelect={setSetId}
        currentSet={currentSet}
        onSaveMeta={handleSaveSetMeta}
        onNew={handleNewSet}
        onDelete={handleDeleteSet}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "20px 0 10px",
        }}
      >
        <h2 style={{ fontSize: 15, margin: 0 }}>役の一覧（{profiles.length}）</h2>
        <Button
          variant="primary"
          onClick={() =>
            setEditing(emptyProfile(setId, profiles.length + 1))
          }
        >
          ＋ 役を追加
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {profiles.map((p, i) => (
          <Card key={p.id}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 26 }}>{p.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.role_name || "（無名）"}</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {p.role_key}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={iconBtn} onClick={() => move(i, -1)} aria-label="上へ">
                  ↑
                </button>
                <button style={iconBtn} onClick={() => move(i, 1)} aria-label="下へ">
                  ↓
                </button>
              </div>
            </div>

            <FieldSummary fields={p.fields} />

            <p style={metaLine}>
              <strong>判断基準:</strong> {p.judgment_basis || "—"}
            </p>
            <p style={metaLine}>
              <strong>利害:</strong> {p.interest || "—"}
            </p>
            <p style={metaLine}>
              <strong>禁止:</strong> {p.prohibitions || "—"}
            </p>
            <p style={metaLine}>
              <strong>行動原則:</strong> {p.action_principle || "—"}
            </p>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button onClick={() => setEditing(p)}>編集</Button>
              <Button variant="danger" onClick={() => handleDeleteProfile(p.id)}>
                削除
              </Button>
            </div>
          </Card>
        ))}
        {profiles.length === 0 && (
          <Card>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              役がありません。「＋ 役を追加」から作成してください。
            </p>
          </Card>
        )}
      </div>

      {editing && (
        <ProfileEditorModal
          profile={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSaveProfile}
        />
      )}
    </div>
  );
}

function SetEditor({
  sets,
  setId,
  onSelect,
  currentSet,
  onSaveMeta,
  onNew,
  onDelete,
}: {
  sets: ProfileSet[];
  setId: string;
  onSelect: (id: string) => void;
  currentSet?: ProfileSet;
  onSaveMeta: (name: string, company: string) => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(currentSet?.name ?? "");
  const [company, setCompany] = useState(currentSet?.company ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setName(currentSet?.name ?? "");
    setCompany(currentSet?.company ?? "");
    setDirty(false);
  }, [currentSet?.id, currentSet?.name, currentSet?.company]);

  return (
    <Card>
      <Field label="プロファイルセット">
        <div style={{ display: "flex", gap: 8 }}>
          <select value={setId} onChange={(e) => onSelect(e.target.value)}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button onClick={onNew} style={{ whiteSpace: "nowrap" }}>
            ＋新規
          </Button>
        </div>
      </Field>

      <Field label="セット名">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
      </Field>

      <Field
        label="会社の説明（ブランドの性格・運営形態）"
        hint="プロンプト冒頭の「# 会社」に展開されます"
      >
        <textarea
          rows={3}
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setDirty(true);
          }}
        />
      </Field>

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant="primary"
          disabled={!dirty}
          onClick={() => {
            onSaveMeta(name, company);
            setDirty(false);
          }}
        >
          セットを保存
        </Button>
        <Button variant="danger" onClick={onDelete}>
          セット削除
        </Button>
      </div>
    </Card>
  );
}

function FieldSummary({ fields }: { fields: ProfileFields }) {
  const entries = Object.values(fields);
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      {entries.map((f, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "3px 8px",
            margin: "0 6px 6px 0",
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          {f.label}
          {f.value !== "" ? `: ${f.value}${f.unit ?? ""}` : "（未設定）"}
        </span>
      ))}
    </div>
  );
}

// ---------- 役の編集モーダル ----------

type FieldRow = {
  key: string;
  label: string;
  value: string;
  unit: string;
  multiplier: string;
};

function fieldsToRows(fields: ProfileFields): FieldRow[] {
  return Object.entries(fields).map(([key, f]) => ({
    key,
    label: f.label,
    value: f.value === "" ? "" : String(f.value),
    unit: f.unit ?? "",
    multiplier: f.multiplier != null ? String(f.multiplier) : "",
  }));
}

function rowsToFields(rows: FieldRow[]): ProfileFields {
  const out: ProfileFields = {};
  rows.forEach((r, i) => {
    const key = r.key.trim() || `field_${i + 1}`;
    const field: ProfileField = { label: r.label.trim(), value: r.value.trim() };
    if (r.unit.trim()) field.unit = r.unit.trim();
    if (r.multiplier.trim() && !Number.isNaN(Number(r.multiplier)))
      field.multiplier = Number(r.multiplier);
    out[key] = field;
  });
  return out;
}

function ProfileEditorModal({
  profile,
  onCancel,
  onSave,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (p: Profile) => void;
}) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [rows, setRows] = useState<FieldRow[]>(fieldsToRows(profile.fields));

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function save() {
    if (!draft.role_name.trim()) {
      window.alert("表示名を入力してください");
      return;
    }
    const roleKey =
      draft.role_key.trim() ||
      draft.role_name.trim().toLowerCase().replace(/\s+/g, "_");
    onSave({ ...draft, role_key: roleKey, fields: rowsToFields(rows) });
  }

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>
          {profile.id ? "役を編集" : "役を追加"}
        </h3>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 88 }}>
            <Field label="アイコン">
              <input
                type="text"
                value={draft.icon}
                onChange={(e) => set("icon", e.target.value)}
                style={{ textAlign: "center", fontSize: 22 }}
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="表示名">
              <input
                type="text"
                placeholder="製造部長 など"
                value={draft.role_name}
                onChange={(e) => set("role_name", e.target.value)}
              />
            </Field>
          </div>
        </div>

        <Field label="役の識別子（role_key・英数字）" hint="空なら表示名から自動生成">
          <input
            type="text"
            placeholder="manufacturing など"
            value={draft.role_key}
            onChange={(e) => set("role_key", e.target.value)}
          />
        </Field>

        <div style={{ margin: "10px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <label>保有条件（フィールド）</label>
            <button
              style={iconBtn}
              onClick={() =>
                setRows((r) => [
                  ...r,
                  { key: "", label: "", value: "", unit: "", multiplier: "" },
                ])
              }
            >
              ＋追加
            </button>
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
              }}
            >
              <input
                type="text"
                placeholder="ラベル（例: 制作時間）"
                value={row.label}
                onChange={(e) =>
                  setRows((r) =>
                    r.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  )
                }
                style={{ marginBottom: 6 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  placeholder="値"
                  value={row.value}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x, j) =>
                        j === i ? { ...x, value: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  type="text"
                  placeholder="単位"
                  value={row.unit}
                  onChange={(e) =>
                    setRows((r) =>
                      r.map((x, j) =>
                        j === i ? { ...x, unit: e.target.value } : x,
                      ),
                    )
                  }
                  style={{ maxWidth: 90 }}
                />
                <button
                  style={{ ...iconBtn, color: "var(--danger)" }}
                  onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <Field label="判断基準">
          <textarea
            rows={2}
            value={draft.judgment_basis}
            onChange={(e) => set("judgment_basis", e.target.value)}
          />
        </Field>
        <Field label="利害（議論をどちらに倒すか）">
          <textarea
            rows={2}
            value={draft.interest}
            onChange={(e) => set("interest", e.target.value)}
          />
        </Field>
        <Field label="禁止事項">
          <textarea
            rows={2}
            value={draft.prohibitions}
            onChange={(e) => set("prohibitions", e.target.value)}
          />
        </Field>
        <Field label="行動原則（議題非依存の思考の癖）">
          <textarea
            rows={3}
            value={draft.action_principle}
            onChange={(e) => set("action_principle", e.target.value)}
          />
        </Field>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" onClick={save}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
};

const metaLine: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text)",
  margin: "4px 0",
  lineHeight: 1.5,
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: 12,
  overflowY: "auto",
  zIndex: 100,
};

const modal: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
  width: "100%",
  maxWidth: 560,
  margin: "16px 0 80px",
};
