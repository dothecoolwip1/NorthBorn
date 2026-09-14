import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const productionUrl = "https://northborn.vercel.app";
const TIMEOUT = 12000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Email provider timed out after ${Math.round(ms / 1000)} seconds.`)), ms); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return Response.json({ ok: false, error: "Sign in is required to send client portal invitations." }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const organizationId = String(body.organizationId ?? "");
    const customerId = String(body.customerId ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const customerName = String(body.customerName ?? "Client").slice(0, 120);
    const organizationName = String(body.organizationName ?? "Northborn company").slice(0, 120);
    const portalRole = String(body.portalRole ?? "admin").trim().toLowerCase();
    const asClientAdmin = Boolean(body.asClientAdmin);
    if (!customerId || !email) return Response.json({ ok: false, error: "Client and email are required." }, { status: 400, headers: corsHeaders });
    if (!["admin","operations","billing","viewer"].includes(portalRole)) return Response.json({ ok: false, error: "Invalid client portal role." }, { status: 400, headers: corsHeaders });

    let inviteRows: any[] | null = null;
    let inviteError: any = null;
    if (asClientAdmin) {
      const result = await userClient.rpc("create_my_customer_portal_invite", { _customer_id: customerId, _email: email, _portal_role: portalRole });
      inviteRows = result.data;
      inviteError = result.error;
    } else {
      if (!organizationId) return Response.json({ ok: false, error: "Northborn company is required." }, { status: 400, headers: corsHeaders });
      const result = await userClient.rpc("create_customer_portal_invite", { _organization_id: organizationId, _customer_id: customerId, _email: email, _portal_role: portalRole });
      inviteRows = result.data;
      inviteError = result.error;
    }
    if (inviteError) return Response.json({ ok: false, error: inviteError.message }, { status: 403, headers: corsHeaders });
    const invite = inviteRows?.[0];
    if (!invite?.invite_code) return Response.json({ ok: false, error: "Client invitation was created but no access code was returned." }, { status: 500, headers: corsHeaders });

    const inviteLink = `${productionUrl}/client-join?code=${encodeURIComponent(invite.invite_code)}`;
    const metadata = {
      northborn_client_invite_token: invite.invite_token,
      northborn_client_access_code: invite.invite_code,
      northborn_client_role: invite.portal_role,
      customer_name: customerName,
      organization_name: organizationName,
    };
    await admin.from("customer_portal_invites").update({ delivery_status: "sending", delivery_error: null, delivery_attempted_at: new Date().toISOString() }).eq("id", invite.invite_id);
    let deliveryError: string | null = null;
    try {
      const { error } = await withTimeout(admin.auth.admin.inviteUserByEmail(email, { redirectTo: inviteLink, data: metadata }), TIMEOUT);
      if (error) {
        const lower = error.message.toLowerCase();
        if (lower.includes("already") || lower.includes("registered") || lower.includes("exists")) {
          const { error: magicError } = await withTimeout(admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: inviteLink, data: metadata } }), TIMEOUT);
          deliveryError = magicError?.message ?? null;
        } else deliveryError = error.message;
      }
    } catch (error) { deliveryError = error instanceof Error ? error.message : "The email provider did not respond."; }
    await admin.from("customer_portal_invites").update({ delivery_status: deliveryError ? "failed" : "sent", delivery_error: deliveryError, delivery_attempted_at: new Date().toISOString() }).eq("id", invite.invite_id);
    return Response.json({
      ok: true,
      emailSent: !deliveryError,
      email,
      inviteLink,
      inviteCode: invite.invite_code,
      portalRole: invite.portal_role,
      inviteId: invite.invite_id,
      expiresAt: invite.invite_expires_at,
      deliveryError,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unable to send client invitation." }, { status: 500, headers: corsHeaders });
  }
});
