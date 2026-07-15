"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, Field } from "@/components/ui";
import { parsePremiseText, type PremiseDraft } from "@/lib/premiseFormat";
import {
  createTheme,
  deletePremise,
  deleteTheme,
  listPremises,
  listSets,
  listThemes,
  setPremiseStatus,
  storageMode,
  updateTheme,
  upsertPremise,
} from "@/lib/store";
import {
  Premise,
  PremiseKind,
  PREMISE_KIND_LABELS,
  PREMISE_KIND_ORDER,
  ProfileSet,
  Theme,
} from "@/lib/types";

const KIND_OPTIONS: { value: PremiseKind; label: string }[] = PREMISE_KIND_ORDER.map(
  (k) => ({ value: k, label: PREMISE_KIND_LABELS[k] }),
);

// 会社常設スコープを表す theme_id の代替値
const COMPANY_SCOPE = "__company__";

export default function PremisesPage() {
  const [sets, setSets] = useState<ProfileSet[]>([]);
  const [setId, setSetId] = useState("");
  const [themes, setThemes] = useState<Theme[]>([]);
  const [premises, setPremises] = useState<Premise[]>([]);
  const [scope, setScope] = useState<string>(COMPANY_SCOPE); // COMPANY_SCOPE or theme.id
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 手動追加フォーム
  const [newBody, setNewBody] = useState("");
  const [newKind, setNewKind] = useState<PremiseKind>("fact");

  // テーマ追加
  const [newThemeName, setNewThemeName] = useState("");

  // 取り込み
  const [pasteText, setPasteText] = useState("");
  const [drafts, setDrafts] = useState<PremiseDraft[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);

  const currentThemeId = scope === COMPANY_SCOPE ? null : scope;

  async function reloadPremises(id: string) {
    const p = await listPremises(id);
    setPremises(p);
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await listSets();
        setSets(s);
        if (s.length > 0) setSetId(s[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!setId) return;
    (async () => {
      try {
        const [t] = await Promise.all([listThemes(setId), reloadPremises(setId)]);
        setThemes(t);
        setScope(COMPANY_SCOPE);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [setId]);

  const scopedPremises = useMemo(
    () => premises.filter((p) => (p.theme_id ?? null) === currentThemeId),
    [premises, currentThemeId],
  );

  async function addPremise() {
    const body = newBody.trim();
    if (!body || !setId) return;
    try {
      await upsertPremise({
        id: "",
        set_id: setId,
        theme_id: currentThemeId,
        body,
        kind: newKind,
        status: "active",
        source: "manual",
        sort_order: scopedPremises.length + 1,
      });
      setNewBody("");
      await reloadPremises(setId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleStatus(p: Premise) {
    await setPremiseStatus(p.id, p.status === "active" ? "retired" : "active");
    await reloadPremises(setId);
  }

  async function removePremise(id: string) {
    if (!confirm("この前提を削除しますか？")) return;
    await deletePremise(id);
    await reloadPremises(setId);
  }

  async function addTheme() {
    const name = newThemeName.trim();
    if (!name || !setId) return;
    const t = await createTheme(setId, name);
    setNewThemeName("");
    setThemes(await listThemes(setId));
    setScope(t.id);
  }

  async function renameTheme(t: Theme) {
    const name = prompt("テーマ名", t.name);
    if (name == null) return;
    await updateTheme({ ...t, name: name.trim() || t.name });
    setThemes(await listThemes(setId));
  }

  async function removeTheme(t: Theme) {
    if (!confirm(`テーマ「${t.name}」と配下の前提を削除しますか？`)) return;
    await deleteTheme(t.id);
    setThemes(await listThemes(setId));
    setScope(COMPANY_SCOPE);
    await reloadPremises(setId);
  }

  function analyze() {
    const d = parsePremiseText(pasteText);
    setDrafts(d);
    setChecked(d.map(() => true));
  }

  function isDuplicate(d: PremiseDraft): boolean {
    return premises.some(
      (p) => (p.theme_id ?? null) === currentThemeId && p.body.trim() === d.body.trim(),
    );
  }

  async function saveDrafts() {
    if (!setId) return;
    let order = scopedPremises.length;
    for (let i = 0; i < drafts.length; i++) {
      if (!checked[i]) continue;
      if (isDuplicate(drafts[i])) continue;
      order += 1;
      await upsertPremise({
        id: "",
        set_id: setId,
        theme_id: currentThemeId,
        body: drafts[i].body,
        kind: drafts[i].kind,
        status: "active",
        source: "chat",
        sort_order: order,
      });
    }
    setPasteText("");
    setDrafts([]);
    setChecked([]);
    await reloadPremises(setId);
  }

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;
  }

  const scopeLabel =
    scope === COMPANY_SCOPE
      ? "会社常設（全会議に効く）"
      : themes.find((t) => t.id === scope)?.name ?? "";

  return (
    <div>
      {storageMode === "local" && (
        <Banner tone="warn">
          ⚠️ ローカルモードで動作中（Supabase 未設定）。データはこの端末に保存されます。
        </Banner>
      )}
      {error && <Banner tone="warn">エラー: {error}</Banner>}

      <Card style={{ marginBottom: 16 }}>
        <Field label="会社（プロファイルセット）">
          <select value={setId} onChange={(e) => setSetId(e.target.value)}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="スコープ" hint="会社常設は全会議に、テーマ別はそのテーマの会議にだけ差し込まれます。">
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value={COMPANY_SCOPE}>会社常設（全会議に効く）</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                テーマ: {t.name}
              </option>
            ))}
          </select>
        </Field>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="新しいテーマ名（例: 販売数を増やす）"
            value={newThemeName}
            onChange={(e) => setNewThemeName(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button onClick={addTheme}>＋テーマ追加</Button>
        </div>
        {scope !== COMPANY_SCOPE && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button
              onClick={() => renameTheme(themes.find((t) => t.id === scope)!)}
            >
              改名
            </Button>
            <Button
              variant="danger"
              onClick={() => removeTheme(themes.find((t) => t.id === scope)!)}
            >
              テーマ削除
            </Button>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          前提一覧 — {scopeLabel}
        </div>
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 12px" }}>
          あなた（オーナー）が宣言するブランド／事業の事実・制約・目標・仮説。会議の結論は前提ではありません。
        </p>

        {scopedPremises.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>まだ前提がありません。</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PREMISE_KIND_ORDER.flatMap((kind) => {
            const items = scopedPremises.filter((p) => p.kind === kind);
            return items.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: p.status === "active" ? "var(--panel-2)" : "transparent",
                  opacity: p.status === "active" ? 1 : 0.5,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 6,
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {PREMISE_KIND_LABELS[p.kind]}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    textDecoration: p.status === "retired" ? "line-through" : "none",
                  }}
                >
                  {p.body}
                </span>
                <button onClick={() => toggleStatus(p)} style={miniBtn}>
                  {p.status === "active" ? "棄却" : "復帰"}
                </button>
                <button onClick={() => removePremise(p.id)} style={miniBtnDanger}>
                  削除
                </button>
              </div>
            ));
          })}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as PremiseKind)}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            placeholder="前提を1行で（例: レビューは星5のみ）"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPremise()}
            style={{ flex: 1 }}
          />
          <Button variant="primary" onClick={addPremise}>
            追加
          </Button>
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>会議結果から取り込む</div>
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 10px" }}>
          会議の最後に「前提追加プロンプト」を流し、その出力をここに貼り付けて解析します。取り込み先は上で選んだスコープ「{scopeLabel}」です。
        </p>
        <textarea
          rows={5}
          placeholder={"### 抽出した前提\n- [fact] ...\n- [goal] ..."}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          style={{ width: "100%" }}
        />
        <div style={{ marginTop: 8 }}>
          <Button onClick={analyze}>解析する</Button>
        </div>

        {drafts.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {drafts.map((d, i) => {
              const dup = isDuplicate(d);
              return (
                <label
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    opacity: dup ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!dup && checked[i]}
                    disabled={dup}
                    onChange={() =>
                      setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)))
                    }
                  />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {PREMISE_KIND_LABELS[d.kind]}
                  </span>
                  <span style={{ flex: 1, fontSize: 14 }}>{d.body}</span>
                  {dup && <span style={{ fontSize: 11, color: "var(--muted)" }}>既存</span>}
                </label>
              );
            })}
            <div>
              <Button variant="primary" onClick={saveDrafts}>
                選択した前提を保存
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--muted)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const miniBtnDanger: React.CSSProperties = {
  ...miniBtn,
  color: "var(--danger)",
  borderColor: "var(--danger)",
};
