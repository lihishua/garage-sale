"use client";
import React from "react";

export function Heart({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M12 20.5S3.5 14.8 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.6-8.5 11.3-8.5 11.3z"
        fill={on ? "#E0336B" : "#FFFFFF"} stroke="#1B1815" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={"gs-chip" + (on ? " on" : "")} onClick={onClick} aria-pressed={!!on}>
      {children}
    </button>
  );
}

export function StatChip({ n, label, color = "#FFFFFF", on, onClick }:
  { n: React.ReactNode; label: string; color?: string; on?: boolean; onClick?: () => void }) {
  const face = <span className="gs-stat-face" style={{ background: color }}><b>{n}</b><span>{label}</span></span>;
  if (!onClick) return <div className="gs-stat gs-stat-flat">{face}</div>;
  return (
    <button type="button" className={"gs-stat" + (on ? " on" : "")} onClick={onClick} aria-pressed={!!on}>
      {face}
    </button>
  );
}

export function Sheet({ title, onClose, children }:
  { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="gs-scrim" onClick={onClose}>
      <div className="gs-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="gs-sheet-head">
          <h2 className="gs-sheet-title">{title}</h2>
          <button className="gs-x" onClick={onClose} aria-label="×">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, placeholder, err, hint, type = "text", ltr, area }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; err?: string; hint?: string; type?: string; ltr?: boolean; area?: boolean;
}) {
  return (
    <label className="gs-field">
      <span className="gs-label">{label}</span>
      {area ? (
        <textarea className={"gs-input" + (err ? " bad" : "")} rows={3} value={value}
          placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={"gs-input" + (err ? " bad" : "")} value={value} type={type}
          dir={ltr ? "ltr" : undefined} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && !err && <span className="gs-hint">{hint}</span>}
      {err && <span className="gs-err">{err}</span>}
    </label>
  );
}

export function Toast({ text }: { text: string }) {
  return <div className="gs-toast">{text}</div>;
}
