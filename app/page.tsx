"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, CopyButton, Field, SegmentedControl } from "@/components/ui";
import {
  buildMeetingPrompt,
  buildMinutesTemplate,
  buildPremiseExtractionPrompt,
  suggestMinutesFilename,
} from "@/lib/promptBuilder";
import {
  listActivePremisesForGeneration,
  listOutputTemplates,
  listProfiles,
  listSets,
  listThemes,
  storageMode,
} from "@/lib/store";
import {
  GenerationInput,
  INPUT_MODE_DESCRIPTIONS,
  InputMode,
  OutputTemplate,
  Premise,
  PREMISE_KIND_LABELS,
  PREMISE_KIND_ORDER,
  Profile,
  ProfileSet,
  Stance,
  Theme,
} from "@/lib/types";

const STANCE_OPTIONS: { value: Stance; label: string }[] = [
  { value: "chairman", label: "会長" },
  { value: "president", label: "社長" },
  { value: "customer", label: "顧客" },
  { value: "observer", label: "観察者" },
];

const STANCE_NOTE: Record<Stance, string> = {
  chairman: "議論に介入せず、途中で事実を小出しに開示し、最後に全体最適から判断する。",
  president: "最終決定権を持つ。各役が自分を説得する構図になる。",
  customer: "各役がユーザー（顧客）にヒアリングしながら議論を進める。",
  observer: "介入せず観察のみ。各役が自走して結論を出す。",
};

const MODE_OPTIONS: { value: InputMode; label: string }[] = [
  { value: "strict", label: "きっちり" },
  { value: "loose", label: "ざっくり" },
  { value: "auto", label: "お任せ" },
];

export default function GeneratePage() {
  const [sets, setSets] = useState<ProfileSet[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<OutputTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [setId, setSetId] = useState("");
  const [themes, setThemes] = useState<Theme[]>([]);
  const [themeId, setThemeId] = useState("");
  const [previewPremises, setPreviewPremises] = useState<Premise[]>([]);
  const [topic, setTopic] = useState("");
  const [stance, setStance] = useState<Stance>("chairman");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [includeDevil, setIncludeDevil] = useState(true);
  const [inputMode, setInputMode] = useState<InputMode>("strict");
  const [outputKey, setOutputKey] = useState("decision");

  const [prompt, setPrompt] = useState("");
  const [minutes, setMinutes] = useState("");
  const [filename, setFilename] = useState("");

  // 初期ロード
  useEffect(() => {
    (async () => {
      try {
        const [s, t] = await Promise.all([listSets(), listOutputTemplates()]);
        setSets(s);
        setTemplates(t);
        if (t.length > 0 && !t.some((x) => x.key === outputKey)) {
          setOutputKey(t[0].key);
        }
        if (s.length > 0) setSetId(s[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // セット切り替え時に役・テーマを読み込み、全役ONにする
  useEffect(() => {
    if (!setId) return;
    (async () => {
      try {
        const [p, t] = await Promise.all([listProfiles(setId), listThemes(setId)]);
        setProfiles(p);
        setSelectedRoleIds(p.map((x) => x.id));
        setThemes(t);
        setThemeId("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [setId]);

  // テーマ／セット変化時に差し込まれる前提をプレビュー用に読み込む
  useEffect(() => {
    if (!setId) {
      setPreviewPremises([]);
      return;
    }
    (async () => {
      try {
        const p = await listActivePremisesForGeneration(setId, themeId || undefined);
        setPreviewPremises(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [setId, themeId]);

  const currentSet = useMemo(
    () => sets.find((s) => s.id === setId),
    [sets, setId],
  );

  function toggleRole(id: string) {
    setSelectedRoleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function generate() {
    if (!currentSet) return;
    const selected = profiles
      .filter((p) => selectedRoleIds.includes(p.id))
      .sort((a, b) => a.sort_order - b.sort_order);
    const tpl =
      templates.find((t) => t.key === outputKey) ?? templates[0];
    if (!tpl) {
      setError("出力テンプレートがありません");
      return;
    }
    const input: GenerationInput = {
      topic,
      stance,
      setId,
      selectedRoleIds,
      includeDevil,
      inputMode,
      outputTemplateKey: outputKey,
      themeId: themeId || undefined,
    };
    const p = buildMeetingPrompt(input, currentSet, selected, tpl, previewPremises);
    const dateStr = new Date().toISOString().slice(0, 10);
    setPrompt(p);
    setMinutes(buildMinutesTemplate(input, p, dateStr));
    setFilename(suggestMinutesFilename(input, dateStr));
    // 出力までスクロール
    setTimeout(() => {
      document.getElementById("output")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  if (loading) {
    return <p style={{ color: "var(--muted)" }}>読み込み中…</p>;
  }

  return (
    <div>
      {storageMode === "local" && (
        <Banner tone="warn">
          ⚠️ ローカルモードで動作中（Supabase 未設定）。データはこの端末のブラウザに保存されます。
          Claude Code から MCP で読むには <code>.env.local</code> に Supabase を設定してください。
        </Banner>
      )}
      {error && <Banner tone="warn">エラー: {error}</Banner>}

      <Card style={{ marginBottom: 16 }}>
        <Field label="議題">
          <textarea
            rows={3}
            placeholder="例: レーザー加工機を新規導入すべきか"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </Field>

        <Field label="私の立場" hint={STANCE_NOTE[stance]}>
          <SegmentedControl
            options={STANCE_OPTIONS}
            value={stance}
            onChange={setStance}
          />
        </Field>

        <Field label="プロファイルセット">
          <select value={setId} onChange={(e) => setSetId(e.target.value)}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="テーマ" hint="選ぶと会社常設＋テーマ別の前提が会議プロンプトに差し込まれます。">
          <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            <option value="">テーマなし（会社常設のみ）</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <details>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 13 }}>
            差し込まれる前提（{previewPremises.length}件）
          </summary>
          <div style={{ marginTop: 8 }}>
            {previewPremises.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                差し込む前提はありません。「前提」画面で追加できます。
              </p>
            ) : (
              PREMISE_KIND_ORDER.map((kind) => {
                const items = previewPremises.filter((p) => p.kind === kind);
                if (items.length === 0) return null;
                return (
                  <div key={kind} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {PREMISE_KIND_LABELS[kind]}
                    </div>
                    <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13 }}>
                      {items.map((p) => (
                        <li key={p.id}>{p.body}</li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </details>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <label>招集メンバー（初期は全員ON）</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setSelectedRoleIds(profiles.map((p) => p.id))}
              style={miniBtn}
            >
              全選択
            </button>
            <button onClick={() => setSelectedRoleIds([])} style={miniBtn}>
              全解除
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {profiles.map((p) => {
            const on = selectedRoleIds.includes(p.id);
            return (
              <label
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: on ? "var(--panel-2)" : "transparent",
                  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  cursor: "pointer",
                  color: "var(--text)",
                  fontSize: 15,
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleRole(p.id)}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 20 }}>{p.icon}</span>
                <span>{p.role_name}</span>
              </label>
            );
          })}

          {/* 悪魔の代弁者（固定・常駐） */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: includeDevil ? "var(--panel-2)" : "transparent",
              border: `1px solid ${includeDevil ? "var(--accent)" : "var(--border)"}`,
              cursor: "pointer",
              color: "var(--text)",
              fontSize: 15,
            }}
          >
            <input
              type="checkbox"
              checked={includeDevil}
              onChange={() => setIncludeDevil((v) => !v)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: 20 }}>😈</span>
            <span>悪魔の代弁者（常駐推奨）</span>
          </label>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Field label="入力モード（条件の濃さ）" hint={INPUT_MODE_DESCRIPTIONS[inputMode]}>
          <SegmentedControl
            options={MODE_OPTIONS}
            value={inputMode}
            onChange={setInputMode}
          />
        </Field>

        <Field label="出力テンプレート（まとめ方）">
          <SegmentedControl
            options={templates.map((t) => ({ value: t.key, label: t.name }))}
            value={outputKey}
            onChange={setOutputKey}
          />
        </Field>
      </Card>

      <Button
        variant="primary"
        onClick={generate}
        disabled={!currentSet}
        style={{ width: "100%", padding: "14px", fontSize: 16 }}
      >
        🚀 プロンプトを生成
      </Button>

      {prompt && (
        <div id="output" style={{ marginTop: 24 }}>
          <OutputBlock
            title="会議プロンプト"
            subtitle="Claude / Claude Code に貼り付けて会議を回す"
            text={prompt}
          />
          <OutputBlock
            title="議事録テンプレート"
            subtitle={`保存先の目安: /meetings/${filename}`}
            text={minutes}
          />
          <OutputBlock
            title="前提追加プロンプト"
            subtitle="会議の最後に流し、出力を「前提」画面に貼り付けて蓄積する"
            text={buildPremiseExtractionPrompt()}
          />
        </div>
      )}
    </div>
  );
}

function OutputBlock({
  title,
  subtitle,
  text,
}: {
  title: string;
  subtitle: string;
  text: string;
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>{subtitle}</div>
        </div>
        <CopyButton text={text} />
      </div>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 12,
          fontSize: 12.5,
          lineHeight: 1.6,
          maxHeight: 360,
          overflow: "auto",
          margin: 0,
        }}
      >
        {text}
      </pre>
    </Card>
  );
}

const miniBtn: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--muted)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 12,
};
