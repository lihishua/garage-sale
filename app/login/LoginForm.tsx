"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR } from "@/lib/i18n";
import { Field, Toast } from "@/components/ui";

export default function LoginForm() {
  const t = STR.he;
  const params = useSearchParams();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "signup" ? "up" : "in");

  const [f, setF] = useState({ email: "", name: "", phone: "", slug: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 5000); };

  // the callback route sends failures back here rather than to a dead end
  useEffect(() => {
    const e = params.get("err");
    if (e === "expired") say(t.linkExpired);
    if (e === "profile") say(t.profileFailed);
  }, [params, t.linkExpired, t.profileFailed]);

  async function sendLink() {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = t.errEmail;
    if (mode === "up") {
      if (!f.name.trim()) e.name = t.errTitle;
      if (!/^[\d\s+-]{7,}$/.test(f.phone.trim())) e.phone = t.errPhone;
      if (!/^[a-z0-9-]{2,32}$/.test(f.slug.trim())) e.slug = t.errSlug;
    }
    if (Object.keys(e).length) { setErr(e); return; }
    setErr({});
    setBusy(true);

    const supabase = supabaseBrowser();
    const email = f.email.trim();
    const emailRedirectTo = `${window.location.origin}/auth/confirm`;

    if (mode === "in") {
      // shouldCreateUser stays off, so a typo'd address says "no such sale"
      // instead of quietly opening an empty account under the wrong email
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { shouldCreateUser: false, emailRedirectTo },
      });
      setBusy(false);
      if (error) return say(/not found|signups not allowed|invalid/i.test(error.message)
        ? t.noSuchAccount : error.message);
      setSentTo(email);
      return;
    }

    // checked before the mail goes out, so a taken address is caught while
    // she can still change it rather than after she clicks the link
    const { data: taken } = await supabase
      .from("public_sales").select("slug").eq("slug", f.slug.trim()).maybeSingle();
    if (taken) { setBusy(false); setErr({ slug: t.slugTaken }); return; }

    // these ride along on the auth user, and become the profile row in
    // app/auth/confirm once she clicks through
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        data: {
          display_name: f.name.trim(),
          phone: f.phone.replace(/\D/g, ""),
          slug: f.slug.trim(),
        },
      },
    });
    setBusy(false);
    if (error) return say(error.message);
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <main className="gs-auth">
        <img className="gs-logo" src="/logo.webp" alt="Garage Sale" />
        <h1 className="gs-sheet-title">{t.linkSentTitle}</h1>
        <p className="gs-lead">{t.linkSentBody(sentTo)}</p>
        <p className="gs-fine">{t.linkSentFine}</p>
        <button className="gs-btn gs-btn-wide" onClick={sendLink} disabled={busy}>
          {busy ? t.loading : t.resend}
        </button>
        <button className="gs-btn-ghost" onClick={() => setSentTo(null)}>{t.useAnotherMail}</button>
        {toast && <Toast text={toast} />}
      </main>
    );
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

      <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={sendLink} disabled={busy}>
        {busy ? t.loading : t.sendLink}
      </button>

      {toast && <Toast text={toast} />}
    </main>
  );
}
