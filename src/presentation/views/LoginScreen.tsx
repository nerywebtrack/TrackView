"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogoIcon } from "@/presentation/components/ui/Icons";

export default function LoginScreen({ initialError = "" }: { initialError?: string }) {
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState<"google" | null>(null);

  async function loginWithGoogle() {
    setLoading("google");
    setError("");
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e6eafb] p-4">
      <section className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <LogoIcon width={40} height={40} />
          <div><h1 className="text-xl font-bold text-slate-900">TrackView</h1><p className="text-sm text-slate-500">Inicia sesión para sincronizar</p></div>
        </div>
        <button type="button" onClick={loginWithGoogle} disabled={loading !== null} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
          <GoogleIcon />
          {loading === "google" ? "Conectando con Google…" : "Continuar con Google"}
        </button>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">Solo se permite el acceso mediante una cuenta autorizada de Google.</p>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.6 4.6 0 0 1-2 3v2.8h3.5c2-1.9 3.2-4.6 3.2-7.9Z"/><path fill="#34A853" d="M12 22c2.9 0 5.3-1 7-2.6l-3.5-2.8c-1 .7-2.2 1-3.5 1a6.2 6.2 0 0 1-5.8-4.3H2.6v2.8A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.2 13.3a6 6 0 0 1 0-3.8V6.7H2.6a10 10 0 0 0 0 9.4l3.6-2.8Z"/><path fill="#EA4335" d="M12 5.1c1.6 0 3 .6 4.1 1.6l3-3A10 10 0 0 0 2.6 6.8l3.6 2.8A6.2 6.2 0 0 1 12 5.1Z"/></svg>;
}
