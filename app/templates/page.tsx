"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, CopyButton, Field } from "@/components/ui";
import {
  deleteOutputTemplate,
  listOutputTemplates,
  storageMode,
  upsertOutputTemplate,
} from "@/lib/store";
import { OutputTemplate } from "@/lib/types";

function emptyTemplate(): OutputTemplate {
  return { id: "", key: "", name: "", body: "" };
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<OutputTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OutputTemplate | null>(null);

  async function reload() {
    setTemplates(await listOutputTemplates());
  }

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(t: OutputTemplate) {
    if (!t.name.trim() || !t.key.trim()) {
      window.alert("名前と識別子を入力してください");
      return;
    }
    try {
      await upsertOutputTemplate(t);
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    if (!window.confirm("このテンプレートを削除しますか?")) return;
    await deleteOutputTemplate(id);
    await reload();
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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontSize: 15, margin: 0 }}>出力テンプレート</h2>
        <Button variant="primary" onClick={() => setEditing(emptyTemplate())}>
          ＋ 追加
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {templates.map((t) => (
          <Card key={t.id || t.key}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <div>
                <span style={{ fontWeight: 700 }}>{t.name}</span>{" "}
                <span style={{ color: "var(--muted)", fontSize: 12 }}>({t.key})</span>
              </div>
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 10,
                fontSize: 12,
                lineHeight: 1.55,
                maxHeight: 180,
                overflow: "auto",
                margin: "0 0 10px",
              }}
            >
              {t.body}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => setEditing(t)}>編集</Button>
              <CopyButton text={t.body} label="本文コピー" />
              <Button variant="danger" onClick={() => remove(t.id)}>
                削除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <TemplateEditor
          template={editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onCancel,
  onSave,
}: {
  template: OutputTemplate;
  onCancel: () => void;
  onSave: (t: OutputTemplate) => void;
}) {
  const [draft, setDraft] = useState<OutputTemplate>(template);

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>
          {template.id ? "テンプレートを編集" : "テンプレートを追加"}
        </h3>
        <Field label="表示名">
          <input
            type="text"
            placeholder="意思決定型 など"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="識別子（key・英数字）">
          <input
            type="text"
            placeholder="decision など"
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          />
        </Field>
        <Field label="本文（プロンプト断片）" hint="「# 最終アウトプット」に展開されます">
          <textarea
            rows={12}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </Field>
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

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
