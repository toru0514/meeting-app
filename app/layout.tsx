import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "役員会議プロンプト生成",
  description:
    "複数の役職が利害に基づいて議論し1つの結論を出す会議プロンプトを合成するコンパイラ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1115",
};

const navItems = [
  { href: "/", label: "生成", icon: "⚙️" },
  { href: "/profiles", label: "役の設定", icon: "👥" },
  { href: "/premises", label: "前提", icon: "🧾" },
  { href: "/templates", label: "出力形式", icon: "📄" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            paddingBottom: 88,
            minHeight: "100dvh",
          }}
        >
          <header
            style={{
              padding: "16px 16px 8px",
            }}
          >
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              🪵 役員会議プロンプト生成
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 0" }}>
              役の利害をぶつけて1つの結論を出すプロンプトを合成する
            </p>
          </header>
          <main style={{ padding: "8px 16px 24px" }}>{children}</main>
        </div>

        {/* 下部固定ナビ（スマホ最優先） */}
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--panel)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: "flex",
              width: "100%",
              maxWidth: 720,
            }}
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px 4px calc(12px + env(safe-area-inset-bottom))",
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                <div style={{ fontSize: 20 }}>{item.icon}</div>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </body>
    </html>
  );
}
