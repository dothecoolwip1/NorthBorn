import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const productionUrl = "https://northborn.vercel.app";
const EMAIL_TIMEOUT_MS = 12000;

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Email provider timed out after ${Math.round(milliseconds / 1000)} seconds.`)), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return Response.json({ ok: false, error: "Sign in is required to send invitations." }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const organizationId = String(body.organizationId ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const roleKey = String(body.roleKey ?? "operator");
    const organizationName = String(body.organizationName ?? "Northborn company").slice(0, 120);
    const roleName = String(body.roleName ?? roleKey).slice(0, 80);

    if (!organizationId || !email) {
      return Response.json({ ok: false, error: "Company and email are required." }, { status: 400, headers: corsHeaders });
    }

    const { data: inviteRows, error: inviteError } = await userClient.rpc("create_organization_invite", {
      _organization_id: organizationId,
      _email: email,
      _role_key: roleKey,
    });
    if (inviteError) {
      return Response.json({ ok: false, error: inviteError.message }, { status: 403, headers: corsHeaders });
    }

    const invite = inviteRows?.[0];
    if (!invite?.invite_token) {
      return Response.json({ ok: false, error: "Invitation was created but no invite token was returned." }, { status: 500, headers: corsHeaders });
    }

    const inviteLink = `${productionUrl}/join?invite=${invite.invite_token}`;
    const metadata = {
      northborn_invite_token: invite.invite_token,
      organization_name: organizationName,
      role_name: roleName,
    };

    await adminClient
      .from("organization_invites")
      .update({
        delivery_status: "sending",
        delivery_error: null,
        delivery_attempted_at: new Date().toISOString(),
      })
      .eq("id", invite.invite_id);

    let deliveryError: string | null = null;

    try {
      const { error: authInviteError } = await withTimeout(
        adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: inviteLink,
          data: metadata,
        }),
        EMAIL_TIMEOUT_MS,
      );

      if (authInviteError) {
        const lowerMessage = authInviteError.message.toLowerCase();
        if (lowerMessage.includes("already") || lowerMessage.includes("registered") || lowerMessage.includes("exists")) {
          const { error: magicError } = await withTimeout(
            adminClient.auth.signInWithOtp({
              email,
              options: { shouldCreateUser: false, emailRedirectTo: inviteLink, data: metadata },
            }),
            EMAIL_TIMEOUT_MS,
          );
          deliveryError = magicError?.message ?? null;
        } else {
          deliveryError = authInviteError.message;
        }
      }
    } catch (error) {
      deliveryError = error instanceof Error ? error.message : "The email provider did not respond.";
    }

    await adminClient
      .from("organization_invites")
      .update({
        delivery_status: deliveryError ? "failed" : "sent",
        delivery_error: deliveryError,
        delivery_attempted_at: new Date().toISOString(),
      })
      .eq("id", invite.invite_id);

    return Response.json({
      ok: true,
      emailSent: !deliveryError,
      email,
      inviteLink,
      inviteId: invite.invite_id,
      expiresAt: invite.invite_expires_at,
      deliveryError,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unable to send invitation." }, { status: 500, headers: corsHeaders });
  }
});
