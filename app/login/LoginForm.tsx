"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR } from "@/lib/i18n";
import { Field, Toast } from "@/components/ui";

export default function LoginForm() {
  const t = STR.he;
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "signup" ? "up" : "in");

  const [f, setF] = useState({ email: "", password: "", name: "", phone: "", slug: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  async function submit() {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = t.errEmail;
    if (f.password.length < 6) e.password = t.errPw;
    if (mode === "up") {
      if (!f.name.trim()) e.name = t.errTitle;
      if (!/^[\d\s+-]{7,}$/.test(f.phone.trim())) e.phone = t.errPhone;
      if (!/^[a-z0-9-]{2,32}$/.test(f.slug.trim())) e.slug = t.errSlug;
    }
    if (Object.keys(e).length) { setErr(e); return; }
    setErr({});
    setBusy(true);
    const supabase = supabaseBrowser();

    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({
        email: f.email.trim(), password: f.password,
      });
      setBusy(false);
      if (error) return say(error.message);
      router.push("/dashboard");
      return;
    }

    // the slug is checked before creating the account, so a taken address
    // doesn't leave a half-made user behind
    const { data: taken } = await supabase
      .from("public_sales").select("slug").eq("slug", f.slug.trim()).maybeSingle();
    if (taken) { setBusy(false); setErr({ slug: t.slugTaken }); return; }

    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.password,
    });
    if (error || !data.user) { setBusy(false); return say(error?.message ?? "signup failed"); }

    const { error: pErr } = await supabase.from("profiles").insert({
      id: data.user.id,
      display_name: f.name.trim(),
      phone: f.phone.replace(/\D/g, ""),
      slug: f.slug.trim(),
    });
    setBusy(false);

    if (pErr) return say(pErr.message);
    if (!data.session) return say(t.checkEmail);   // email confirmation is on
    router.push("/dashboard");
  }

  return (
    <main className="gs-auth">
      <img className="gs-logo" src="/logo.webp" alt="Garage Sale" />

      <div className="gs-tabs">
        <button className={"gs-btn " + (mode === "in" ? "gs-btn-orange" : "")} onClick={() => setMode("in")}>
          {t.signIn}
        </button>
        <button className={"gs-btn " + (mode === "up" ? "gs-btn-orange" : "")} onClick={() => setMode("up")}>
          {t.signUp}
        </button>
      </div>

      <Field label={t.email} value={f.email} onChange={(v) => set("email", v)} err={err.email} ltr type="email" />
      <Field label={t.password} value={f.password} onChange={(v) => set("password", v)} err={err.password} ltr type="password" />

      {mode === "up" && (
        <>
          <Field label={t.yourNameSeller} value={f.name} onChange={(v) => set("name", v)}
            err={err.name} placeholder={t.yourNamePh} />
          <Field label={t.phoneSeller} value={f.phone} onChange={(v) => set("phone", v)}
            err={err.phone} hint={t.phoneSellerHint} placeholder="972501234567" ltr />
          <Field label={t.address} value={f.slug}
            onChange={(v) => set("slug", v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            err={err.slug} hint={t.addressHint} placeholder="dana" ltr />
        </>
      )}

      <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={submit} disabled={busy}>
        {busy ? t.loading : mode === "in" ? t.signIn : t.signUp}
      </button>

      {toast && <Toast text={toast} />}
    </main>
  );
}
