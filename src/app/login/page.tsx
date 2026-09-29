import { redirect } from "next/navigation";
import LoginScreen from "@/presentation/views/LoginScreen";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (!isSupabaseConfigured()) {
    return <LoginScreen initialError="Supabase todavía no está configurado en este entorno." />;
  }
  const { createClient } = await import("@/lib/supabase/server");
  const { data } = await (await createClient()).auth.getClaims();
  if (data?.claims?.sub) redirect("/");
  return <LoginScreen initialError={params.error} />;
}
