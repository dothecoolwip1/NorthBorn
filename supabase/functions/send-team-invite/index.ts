import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const productionUrl = "https://northborn.vercel.app";

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

    let deliveryError: string | null = null;
    const { error: authInviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteLink,
      data: metadata,
    });

    if (authInviteError) {
      const lowerMessage = authInviteError.message.toLowerCase();
      if (lowerMessage.includes("already") || lowerMessage.includes("registered") || lowerMessage.includes("exists")) {
        const { error: magicError } = await adminClient.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: inviteLink, data: metadata },
        });
        deliveryError = magicError?.message ?? null;
      } else {
        deliveryError = authInviteError.message;
      }
    }

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
