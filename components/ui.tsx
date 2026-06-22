"use client";

import { CSSProperties, ReactNode, useState } from "react";

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", marginBottom: 6 }}>{label}</label>
      {children}
      {hint && (
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "6px 0 0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  style,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: "var(--accent-strong)",
      color: "#fff",
      border: "1px solid var(--accent-strong)",
    },
    ghost: {
      background: "var(--panel-2)",
      color: "var(--text)",
      border: "1px solid var(--border)",
    },
    danger: {
      background: "transparent",
      color: "var(--danger)",
      border: "1px solid var(--danger)",
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        fontWeight: 600,
        opacity: disabled ? 0.5 : 1,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function CopyButton({
  text,
  label = "コピー",
  style,
}: {
  text: string;
  label?: string;
  style?: CSSProperties;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // フォールバック
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      variant={copied ? "primary" : "primary"}
      onClick={copy}
      style={{
        background: copied ? "var(--ok)" : "var(--accent-strong)",
        border: "none",
        color: copied ? "#06251a" : "#fff",
        ...style,
      }}
    >
      {copied ? "✓ コピーしました" : `📋 ${label}`}
    </Button>
  );
}

export function Banner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <div
      style={{
        background: tone === "warn" ? "#3a2a16" : "var(--panel-2)",
        border: `1px solid ${tone === "warn" ? "#7a5a25" : "var(--border)"}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 12,
        color: "var(--muted)",
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: "1 1 auto",
              minWidth: 72,
              padding: "9px 10px",
              borderRadius: 10,
              fontWeight: 600,
              background: active ? "var(--accent-strong)" : "var(--panel-2)",
              color: active ? "#fff" : "var(--text)",
              border: `1px solid ${active ? "var(--accent-strong)" : "var(--border)"}`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
