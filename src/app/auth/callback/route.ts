import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatSupabaseError, syncAuthenticatedProfile } from "@/lib/supabase/profile";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const flowId = requestUrl.searchParams.get("sb_flow_id");
  const requestedNext = requestUrl.searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (!code) return redirectToLogin(requestUrl, "Google no devolvió un código de autorización");

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  if (exchangeError) return redirectToLogin(requestUrl, exchangeError.message);

  try {
    await syncAuthenticatedProfile(supabase);
  } catch (error) {
    await supabase.auth.signOut();
    return redirectToLogin(requestUrl, `No se pudo guardar el perfil de Google: ${formatSupabaseError(error)}`);
  }
  const { error: claimError } = await supabase.rpc("claim_workspace", { target_workspace_id: "ws-google" });
  if (claimError) {
    await supabase.auth.signOut();
    return redirectToLogin(requestUrl, `No se pudo asociar el workspace: ${claimError.message}`);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return NextResponse.redirect(`${forwardedProto}://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(`${requestUrl.origin}${next}`);
}

function redirectToLogin(requestUrl: URL, message: string) {
  const destination = new URL("/login", requestUrl.origin);
  destination.searchParams.set("error", message);
  return NextResponse.redirect(destination);
}
