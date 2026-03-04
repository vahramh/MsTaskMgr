import React from "react";

type Props = {
  title: string;
  message?: string;
  actions?: React.ReactNode;
  tone?: "error" | "info";
};

export default function InlineAlert({ title, message, actions, tone = "info" }: Props) {
  const style: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid " + (tone === "error" ? "#fecaca" : "#bfdbfe"),
    background: tone === "error" ? "#fef2f2" : "#eff6ff",
    padding: 12,
  };

  return (
    <div style={style}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {message ? <div style={{ marginTop: 4, color: "#374151" }}>{message}</div> : null}
      {actions ? <div style={{ marginTop: 10 }}>{actions}</div> : null}
    </div>
  );
}
