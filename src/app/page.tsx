import BoardScreen from "@/presentation/views/BoardScreen";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/login");
  const { createClient } = await import("@/lib/supabase/server");
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return <BoardScreen projectId="marketing-campaign" />;
}
