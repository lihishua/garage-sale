"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { STR } from "@/lib/i18n";
import { Field, PhoneField, Toast } from "@/components/ui";
import { DEFAULT_DIAL, fullPhone, validLocal } from "@/lib/countries";

export default function LoginForm() {
  const t = STR.he;
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">(params.get("mode") === "signup" ? "up" : "in");

  const [f, setF] = useState({ email: "", name: "", phone: "", slug: "" });
  // kept apart from `phone`, which now holds only the number as she says it
  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
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
      if (!validLocal(f.phone)) e.phone = t.errPhone;
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
          phone: fullPhone(dial, f.phone),
          slug: f.slug.trim(),
        },
      },
    });
    setBusy(false);
    if (error) return say(error.message);
    setSentTo(email);
  }

  /**
   * The code path. It exists because of the home-screen app: an emailed link
   * opens in Safari, and an installed web app has its own cookie jar, so a
   * session created by clicking never reaches the app that asked for it. A
   * code is typed where it was asked for, so the session lands in the right
   * container. The link still works for anyone who would rather tap it.
   */
  async function verify() {
    if (busy || !sentTo) return;
    // Supabase's email OTP length is a project setting, anywhere from 6 to 10
    // digits. Pinning this to 6 rejected a valid code before it was ever sent
    // for checking, so the length is the server's business, not this form's.
    const token = code.trim();
    if (token.length < 6) { setErr({ code: t.errCode }); return; }
    setErr({}); setBusy(true);

    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.verifyOtp({ email: sentTo, token, type: "email" });
    if (error || !data.user) { setBusy(false); setErr({ code: t.errCode }); return; }

    // The same row app/auth/confirm writes when she clicks the link instead —
    // whichever way she got here, one profile, created once. The details rode
    // in on the auth user's metadata, so they survive asking on a laptop and
    // finishing on a phone.
    const user = data.user;
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("id", user.id).maybeSingle();

    if (!profile) {
      const meta = user.user_metadata ?? {};
      if (!meta.display_name || !meta.phone || !meta.slug) {
        setBusy(false); say(t.profileFailed); return;
      }
      const { error: insErr } = await supabase.from("profiles").insert({
        id: user.id,
        display_name: String(meta.display_name),
        phone: String(meta.phone),
        slug: String(meta.slug),
      });
      // almost always a slug someone claimed between the form and the code
      if (insErr) { setBusy(false); say(t.profileFailed); return; }
    }

    // refresh so the server components see the cookie this just wrote
    router.push("/dashboard");
    router.refresh();
  }

  if (sentTo) {
    return (
      <main className="gs-auth">
        <img className="gs-logo" src="/logo.webp" alt="Garage Sale" />
        <h1 className="gs-sheet-title">{t.linkSentTitle}</h1>
        <p className="gs-lead">{t.linkSentBody(sentTo)}</p>
        <p className="gs-note">{t.linkSentSpam}</p>

        <Field label={t.codeLabel} value={code} err={err.code}
          onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 10))}
          placeholder="123456" ltr numeric />
        <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={verify}
          disabled={busy || code.length < 6}>
          {busy ? t.loading : t.enterCode}
        </button>

        <p className="gs-fine">{t.linkSentFine}</p>
        <button className="gs-btn gs-btn-wide" onClick={sendLink} disabled={busy}>
          {busy ? t.loading : t.resend}
        </button>
        <button className="gs-btn-ghost" onClick={() => { setSentTo(null); setCode(""); }}>{t.useAnotherMail}</button>
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
          <PhoneField label={t.phoneSeller} dial={dial} onDial={setDial}
            value={f.phone} onChange={(v) => set("phone", v)}
            err={err.phone} hint={t.phoneSellerHint} />
          <Field label={t.address} value={f.slug}
            onChange={(v) => set("slug", v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            err={err.slug} hint={t.addressHint} placeholder="dana" ltr />
        </>
      )}

      <button className="gs-btn gs-btn-orange gs-btn-wide" onClick={sendLink} disabled={busy}>
        {busy ? t.loading : mode === "up" ? t.openSale : t.sendLink}
      </button>

      {toast && <Toast text={toast} />}
    </main>
  );
}
