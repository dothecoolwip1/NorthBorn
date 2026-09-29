import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_ROLE_KEYS = new Set([
  "owner",
  "admin",
  "supervisor",
  "dispatcher",
  "safety",
  "mechanic",
  "accounting",
  "operator",
]);

type JsonRecord = Record<string, unknown>;

function reply(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function safeMetadata(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as JsonRecord;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey =
    Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return reply(500, { error: "Northborn admin service is not configured." });
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return reply(401, { error: "Sign in required." });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authResult = await userClient.auth.getUser();
  const caller = authResult.data.user;
  if (authResult.error || !caller) {
    return reply(401, { error: "Your Northborn session is not valid." });
  }

  const linked = await userClient.rpc("link_platform_admin_identity");
  if (linked.error || linked.data !== true) {
    return reply(403, { error: "Super admin access required." });
  }

  let body: JsonRecord;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Invalid JSON request." });
  }

  const action = String(body.action || "").trim();
  const payload = safeMetadata(body.payload);

  const audit = async (
    auditAction: string,
    entityType: string,
    entityId?: string | null,
    organizationId?: string | null,
    metadata: JsonRecord = {},
  ) => {
    const { error } = await service.from("audit_logs").insert({
      organization_id: organizationId || null,
      actor_user_id: caller.id,
      entity_type: entityType,
      entity_id: entityId || null,
      action: auditAction,
      metadata,
    });
    if (error) console.error("super-admin audit log failed", error);
  };

  const listAllUsers = async () => {
    const users: unknown[] = [];
    const perPage = 200;
    for (let page = 1; page <= 10; page += 1) {
      const result = await service.auth.admin.listUsers({ page, perPage });
      if (result.error) throw result.error;
      users.push(...result.data.users);
      if (result.data.users.length < perPage) break;
    }
    return users as Array<Record<string, unknown>>;
  };

  const setMembership = async (
    userId: string,
    organizationId: string,
    roleKeys: string[],
  ) => {
    const normalizedRoles = Array.from(
      new Set(roleKeys.map((value) => String(value).trim()).filter((value) => SYSTEM_ROLE_KEYS.has(value))),
    );
    if (!normalizedRoles.length) throw new Error("Choose at least one valid role.");

    const membership = await service
      .from("organization_members")
      .upsert(
        {
          organization_id: organizationId,
          user_id: userId,
          status: "active",
          created_by: caller.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,user_id" },
      )
      .select("id")
      .single();
    if (membership.error) throw membership.error;

    const roles = await service
      .from("roles")
      .select("id,key")
      .is("organization_id", null)
      .in("key", normalizedRoles);
    if (roles.error) throw roles.error;
    if ((roles.data || []).length !== normalizedRoles.length) {
      throw new Error("One or more requested Northborn roles are unavailable.");
    }

    const remove = await service
      .from("membership_roles")
      .delete()
      .eq("membership_id", membership.data.id);
    if (remove.error) throw remove.error;

    const rows = (roles.data || []).map((role) => ({
      membership_id: membership.data.id,
      role_id: role.id,
    }));
    const insert = await service.from("membership_roles").insert(rows);
    if (insert.error) throw insert.error;

    return membership.data.id as string;
  };

  const exactCount = async (table: string, filter?: (query: any) => any) => {
    let query: any = service.from(table).select("*", { count: "exact", head: true });
    if (filter) query = filter(query);
    const result = await query;
    if (result.error) throw result.error;
    return result.count || 0;
  };

  try {
    if (action === "dashboard") {
      const [users, organizations, activeOrganizations, members, customers, jobs, vehicles, employees] =
        await Promise.all([
          listAllUsers(),
          exactCount("organizations"),
          exactCount("organizations", (query) => query.eq("status", "active")),
          exactCount("organization_members", (query) => query.eq("status", "active")),
          exactCount("customers", (query) => query.eq("status", "active")),
          exactCount("jobs"),
          exactCount("fleet_vehicles"),
          exactCount("employees", (query) => query.eq("status", "active")),
        ]);

      const recent = await service
        .from("audit_logs")
        .select("id,organization_id,actor_user_id,entity_type,entity_id,action,metadata,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(12);
      if (recent.error) throw recent.error;

      return reply(200, {
        data: {
          organizations,
          activeOrganizations,
          authUsers: users.length,
          activeMembers: members,
          customers,
          jobs,
          vehicles,
          employees,
          recentAudit: recent.data || [],
        },
      });
    }

    if (action === "list_organizations") {
      const organizations = await service
        .from("organizations")
        .select("id,name,legal_name,slug,status,timezone,country_code,settings,created_at,updated_at")
        .order("name");
      if (organizations.error) throw organizations.error;

      const [members, subscriptions] = await Promise.all([
        service
          .from("organization_members")
          .select("organization_id,user_id,status"),
        service
          .from("organization_subscriptions")
          .select("organization_id,status,billing_interval,seats,trial_ends_at,current_period_ends_at,notes,plan:platform_plans(id,code,name,monthly_price_cents,annual_price_cents,currency,active)"),
      ]);
      if (members.error) throw members.error;
      if (subscriptions.error) throw subscriptions.error;

      const memberCounts = new Map<string, number>();
      for (const member of members.data || []) {
        if (member.status !== "active") continue;
        memberCounts.set(
          member.organization_id,
          (memberCounts.get(member.organization_id) || 0) + 1,
        );
      }

      const subscriptionMap = new Map(
        (subscriptions.data || []).map((row) => [row.organization_id, row]),
      );

      const data = await Promise.all(
        (organizations.data || []).map(async (organization) => {
          const jobs = await exactCount(
            "jobs",
            (query) => query.eq("organization_id", organization.id),
          );
          return {
            ...organization,
            member_count: memberCounts.get(organization.id) || 0,
            job_count: jobs,
            subscription: subscriptionMap.get(organization.id) || null,
          };
        }),
      );

      return reply(200, { data });
    }

    if (action === "get_organization") {
      const organizationId = String(payload.organizationId || "");
      const [organization, subscription, modules] = await Promise.all([
        service
          .from("organizations")
          .select("id,name,legal_name,slug,status,timezone,country_code,settings,created_at,updated_at")
          .eq("id", organizationId)
          .single(),
        service
          .from("organization_subscriptions")
          .select("organization_id,status,billing_interval,seats,trial_ends_at,current_period_ends_at,notes,plan:platform_plans(id,code,name)")
          .eq("organization_id", organizationId)
          .maybeSingle(),
        service
          .from("organization_modules")
          .select("id,module_key,enabled,settings")
          .eq("organization_id", organizationId)
          .order("module_key"),
      ]);
      if (organization.error) throw organization.error;
      if (subscription.error) throw subscription.error;
      if (modules.error) throw modules.error;
      return reply(200, {
        data: {
          organization: organization.data,
          subscription: subscription.data || null,
          modules: modules.data || [],
        },
      });
    }

    if (action === "create_organization") {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("Organization name is required.");

      const inserted = await service
        .from("organizations")
        .insert({
          name,
          legal_name: cleanText(payload.legalName),
          slug: cleanText(payload.slug),
          status: String(payload.status || "active"),
          timezone: String(payload.timezone || "America/Edmonton"),
          country_code: String(payload.countryCode || "CA").toUpperCase(),
          settings: safeMetadata(payload.settings),
          created_by: caller.id,
        })
        .select("id,name")
        .single();
      if (inserted.error) throw inserted.error;

      const freePlan = await service
        .from("platform_plans")
        .select("id")
        .eq("code", "free")
        .maybeSingle();
      if (!freePlan.error && freePlan.data?.id) {
        await service.from("organization_subscriptions").upsert({
          organization_id: inserted.data.id,
          plan_id: freePlan.data.id,
          status: "active",
          billing_interval: "monthly",
          updated_by: caller.id,
          updated_at: new Date().toISOString(),
        });
      }

      if (payload.ownerUserId) {
        await setMembership(String(payload.ownerUserId), inserted.data.id, ["owner"]);
      }

      await audit("create", "platform_organization", inserted.data.id, inserted.data.id, {
        name,
      });
      return reply(200, { data: inserted.data });
    }

    if (action === "update_organization") {
      const organizationId = String(payload.organizationId || "");
      if (!organizationId) throw new Error("Organization is required.");

      const patch: JsonRecord = { updated_at: new Date().toISOString() };
      if ("name" in payload) patch.name = String(payload.name || "").trim();
      if ("legalName" in payload) patch.legal_name = cleanText(payload.legalName);
      if ("slug" in payload) patch.slug = cleanText(payload.slug);
      if ("status" in payload) patch.status = String(payload.status || "active");
      if ("timezone" in payload) patch.timezone = String(payload.timezone || "America/Edmonton");
      if ("countryCode" in payload) patch.country_code = String(payload.countryCode || "CA").toUpperCase();
      if ("settings" in payload) patch.settings = safeMetadata(payload.settings);

      const updated = await service
        .from("organizations")
        .update(patch)
        .eq("id", organizationId)
        .select("id,name,status")
        .single();
      if (updated.error) throw updated.error;

      await audit("update", "platform_organization", organizationId, organizationId, {
        fields: Object.keys(patch).filter((key) => key !== "updated_at"),
      });
      return reply(200, { data: updated.data });
    }

    if (action === "set_module") {
      const organizationId = String(payload.organizationId || "");
      const moduleKey = String(payload.moduleKey || "").trim();
      if (!organizationId || !moduleKey) throw new Error("Organization and module are required.");

      const result = await service.from("organization_modules").upsert(
        {
          organization_id: organizationId,
          module_key: moduleKey,
          enabled: payload.enabled !== false,
          settings: safeMetadata(payload.settings),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,module_key" },
      );
      if (result.error) throw result.error;
      await audit("set_module", "organization_module", moduleKey, organizationId, {
        enabled: payload.enabled !== false,
      });
      return reply(200, { data: { ok: true } });
    }

    if (action === "list_users") {
      const [users, profiles, memberships, membershipRoles, roles, organizations, platformAdmins] =
        await Promise.all([
          listAllUsers(),
          service.from("profiles").select("user_id,display_name,first_name,last_name,phone"),
          service.from("organization_members").select("id,user_id,organization_id,status,joined_at"),
          service.from("membership_roles").select("membership_id,role_id"),
          service.from("roles").select("id,key,name"),
          service.from("organizations").select("id,name,status"),
          service.from("platform_admins").select("user_id,email,status"),
        ]);

      for (const result of [profiles, memberships, membershipRoles, roles, organizations, platformAdmins]) {
        if (result.error) throw result.error;
      }

      const profileMap = new Map((profiles.data || []).map((row) => [row.user_id, row]));
      const orgMap = new Map((organizations.data || []).map((row) => [row.id, row]));
      const roleMap = new Map((roles.data || []).map((row) => [row.id, row]));
      const membershipRoleMap = new Map<string, Array<Record<string, unknown>>>();
      for (const row of membershipRoles.data || []) {
        const role = roleMap.get(row.role_id);
        if (!role) continue;
        const current = membershipRoleMap.get(row.membership_id) || [];
        current.push(role);
        membershipRoleMap.set(row.membership_id, current);
      }

      const membershipsByUser = new Map<string, Array<Record<string, unknown>>>();
      for (const membership of memberships.data || []) {
        const current = membershipsByUser.get(membership.user_id) || [];
        current.push({
          ...membership,
          organization: orgMap.get(membership.organization_id) || null,
          roles: membershipRoleMap.get(membership.id) || [],
        });
        membershipsByUser.set(membership.user_id, current);
      }

      const adminEmails = new Set(
        (platformAdmins.data || [])
          .filter((row) => row.status === "active")
          .map((row) => cleanEmail(row.email)),
      );
      const adminUserIds = new Set(
        (platformAdmins.data || [])
          .filter((row) => row.status === "active" && row.user_id)
          .map((row) => row.user_id),
      );

      const data = users.map((user) => {
        const email = cleanEmail(user.email);
        return {
          id: user.id,
          email,
          phone: user.phone || null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at || null,
          email_confirmed_at: user.email_confirmed_at || null,
          banned_until: user.banned_until || null,
          profile: profileMap.get(String(user.id)) || null,
          memberships: membershipsByUser.get(String(user.id)) || [],
          is_platform_admin: adminUserIds.has(user.id) || adminEmails.has(email),
        };
      });

      return reply(200, { data });
    }

    if (action === "create_user") {
      const email = cleanEmail(payload.email);
      const password = String(payload.password || "");
      if (!email || !email.includes("@")) throw new Error("A valid email is required.");
      if (password && password.length < 8) throw new Error("Temporary password must be at least 8 characters.");

      let createdUser: any;
      if (password) {
        const created = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: payload.displayName ? { display_name: String(payload.displayName) } : undefined,
        });
        if (created.error) throw created.error;
        createdUser = created.data.user;
      } else {
        const appUrl = Deno.env.get("NORTHBORN_APP_URL") || "https://dothecoolwip1.github.io/NorthBorn/";
        const invited = await service.auth.admin.inviteUserByEmail(email, {
          redirectTo: appUrl,
          data: payload.displayName ? { display_name: String(payload.displayName) } : undefined,
        });
        if (invited.error) throw invited.error;
        createdUser = invited.data.user;
      }

      if (!createdUser?.id) throw new Error("Supabase did not return the new user.");

      if (payload.displayName) {
        await service.from("profiles").upsert({
          user_id: createdUser.id,
          display_name: String(payload.displayName).trim(),
          updated_at: new Date().toISOString(),
        });
      }

      if (payload.organizationId) {
        await setMembership(
          createdUser.id,
          String(payload.organizationId),
          Array.isArray(payload.roleKeys) ? payload.roleKeys.map(String) : ["operator"],
        );
      }

      await audit("create", "auth_user", createdUser.id, payload.organizationId ? String(payload.organizationId) : null, {
        email,
        invited: !password,
      });
      return reply(200, { data: { id: createdUser.id, email } });
    }

    if (action === "update_user") {
      const userId = String(payload.userId || "");
      if (!userId) throw new Error("User is required.");

      const attributes: Record<string, unknown> = {};
      if (payload.email) attributes.email = cleanEmail(payload.email);
      if (payload.password) {
        const password = String(payload.password);
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        attributes.password = password;
      }

      if (Object.keys(attributes).length) {
        const updated = await service.auth.admin.updateUserById(userId, attributes as any);
        if (updated.error) throw updated.error;
      }

      if ("displayName" in payload) {
        const displayName = cleanText(payload.displayName);
        const profile = await service.from("profiles").upsert({
          user_id: userId,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        });
        if (profile.error) throw profile.error;
      }

      if (payload.organizationId) {
        await setMembership(
          userId,
          String(payload.organizationId),
          Array.isArray(payload.roleKeys) ? payload.roleKeys.map(String) : ["operator"],
        );
      }

      await audit("update", "auth_user", userId, payload.organizationId ? String(payload.organizationId) : null, {
        email_changed: Boolean(payload.email),
        password_changed: Boolean(payload.password),
        membership_changed: Boolean(payload.organizationId),
      });
      return reply(200, { data: { ok: true } });
    }

    if (action === "set_user_enabled") {
      const userId = String(payload.userId || "");
      const enabled = payload.enabled !== false;
      if (!userId) throw new Error("User is required.");
      if (userId === caller.id && !enabled) throw new Error("You cannot disable your own super admin account.");

      const updateResult = await (service.auth.admin as any).updateUserById(userId, {
        ban_duration: enabled ? "none" : "876600h",
      });
      if (updateResult.error) throw updateResult.error;
      await audit(enabled ? "enable" : "disable", "auth_user", userId, null, {});
      return reply(200, { data: { ok: true } });
    }

    if (action === "delete_user") {
      const userId = String(payload.userId || "");
      if (!userId) throw new Error("User is required.");
      if (userId === caller.id) throw new Error("You cannot delete your own super admin account.");

      const target = await service.auth.admin.getUserById(userId);
      if (target.error) throw target.error;
      const targetEmail = cleanEmail(target.data.user?.email);
      const protectedAdmin = await service
        .from("platform_admins")
        .select("id")
        .eq("status", "active")
        .or(`user_id.eq.${userId},email.ilike.${targetEmail.replace(/[%_,]/g, "")}`)
        .limit(1);
      if (protectedAdmin.error) throw protectedAdmin.error;
      if (protectedAdmin.data?.length) throw new Error("Disable platform admin access before deleting this account.");

      const deleted = await service.auth.admin.deleteUser(userId);
      if (deleted.error) throw deleted.error;
      await audit("delete", "auth_user", userId, null, { email: targetEmail });
      return reply(200, { data: { ok: true } });
    }

    if (action === "set_membership") {
      const userId = String(payload.userId || "");
      const organizationId = String(payload.organizationId || "");
      const roleKeys = Array.isArray(payload.roleKeys) ? payload.roleKeys.map(String) : [];
      const membershipId = await setMembership(userId, organizationId, roleKeys);
      await audit("set_membership", "organization_member", membershipId, organizationId, {
        user_id: userId,
        role_keys: roleKeys,
      });
      return reply(200, { data: { membershipId } });
    }

    if (action === "remove_membership") {
      const membershipId = String(payload.membershipId || "");
      if (!membershipId) throw new Error("Membership is required.");
      const membership = await service
        .from("organization_members")
        .select("id,organization_id,user_id")
        .eq("id", membershipId)
        .single();
      if (membership.error) throw membership.error;
      const updated = await service
        .from("organization_members")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("id", membershipId);
      if (updated.error) throw updated.error;
      await audit("remove_membership", "organization_member", membershipId, membership.data.organization_id, {
        user_id: membership.data.user_id,
      });
      return reply(200, { data: { ok: true } });
    }

    if (action === "set_platform_admin") {
      const userId = String(payload.userId || "");
      const email = cleanEmail(payload.email);
      const enabled = payload.enabled !== false;
      if (!email) throw new Error("User email is required.");
      if (userId === caller.id && !enabled) throw new Error("You cannot remove your own super admin access.");

      const existing = await service
        .from("platform_admins")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (existing.error) throw existing.error;

      if (existing.data?.id) {
        const result = await service
          .from("platform_admins")
          .update({
            user_id: userId || null,
            status: enabled ? "active" : "disabled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.data.id);
        if (result.error) throw result.error;
      } else {
        const result = await service.from("platform_admins").insert({
          user_id: userId || null,
          email,
          status: enabled ? "active" : "disabled",
          display_name: cleanText(payload.displayName),
        });
        if (result.error) throw result.error;
      }

      await audit(enabled ? "grant_super_admin" : "revoke_super_admin", "platform_admin", userId || email, null, {
        email,
      });
      return reply(200, { data: { ok: true } });
    }

    if (action === "list_plans") {
      const plans = await service
        .from("platform_plans")
        .select("*")
        .order("sort_order")
        .order("name");
      if (plans.error) throw plans.error;
      return reply(200, { data: plans.data || [] });
    }

    if (action === "upsert_plan") {
      const id = cleanText(payload.id);
      const code = String(payload.code || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
      const name = String(payload.name || "").trim();
      if (!code || !name) throw new Error("Plan code and name are required.");

      const row = {
        code,
        name,
        description: cleanText(payload.description),
        monthly_price_cents: Math.max(0, Number(payload.monthlyPriceCents || 0)),
        annual_price_cents: Math.max(0, Number(payload.annualPriceCents || 0)),
        currency: String(payload.currency || "CAD").toUpperCase(),
        active: payload.active !== false,
        sort_order: Number(payload.sortOrder || 100),
        features: Array.isArray(payload.features) ? payload.features : [],
        limits: safeMetadata(payload.limits),
        provider_monthly_price_id: cleanText(payload.providerMonthlyPriceId),
        provider_annual_price_id: cleanText(payload.providerAnnualPriceId),
        updated_at: new Date().toISOString(),
      };

      const result = id
        ? await service.from("platform_plans").update(row).eq("id", id).select("*").single()
        : await service.from("platform_plans").insert(row).select("*").single();
      if (result.error) throw result.error;

      await audit(id ? "update" : "create", "platform_plan", result.data.id, null, {
        code,
        name,
      });
      return reply(200, { data: result.data });
    }

    if (action === "assign_plan") {
      const organizationId = String(payload.organizationId || "");
      const planCode = String(payload.planCode || "").trim();
      if (!organizationId || !planCode) throw new Error("Organization and plan are required.");

      const plan = await service
        .from("platform_plans")
        .select("id,code,name")
        .eq("code", planCode)
        .single();
      if (plan.error) throw plan.error;

      const result = await service.from("organization_subscriptions").upsert(
        {
          organization_id: organizationId,
          plan_id: plan.data.id,
          status: String(payload.status || "active"),
          billing_interval: String(payload.billingInterval || "monthly"),
          seats: Math.max(1, Number(payload.seats || 1)),
          trial_ends_at: payload.trialEndsAt || null,
          current_period_ends_at: payload.currentPeriodEndsAt || null,
          notes: cleanText(payload.notes),
          updated_by: caller.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
      if (result.error) throw result.error;

      await audit("assign_plan", "organization_subscription", organizationId, organizationId, {
        plan_code: plan.data.code,
        status: payload.status || "active",
      });
      return reply(200, { data: { ok: true } });
    }

    if (action === "list_settings") {
      const settings = await service
        .from("platform_settings")
        .select("*")
        .order("category")
        .order("key");
      if (settings.error) throw settings.error;
      return reply(200, { data: settings.data || [] });
    }

    if (action === "set_setting") {
      const key = String(payload.key || "").trim();
      if (!key) throw new Error("Setting key is required.");
      const result = await service
        .from("platform_settings")
        .upsert({
          key,
          label: String(payload.label || key),
          description: cleanText(payload.description),
          category: String(payload.category || "general"),
          value: payload.value ?? null,
          updated_by: caller.id,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (result.error) throw result.error;
      await audit("set_setting", "platform_setting", key, null, {});
      return reply(200, { data: result.data });
    }

    if (action === "list_audit") {
      const limit = Math.max(25, Math.min(500, Number(payload.limit || 200)));
      const logs = await service
        .from("audit_logs")
        .select("id,organization_id,actor_user_id,entity_type,entity_id,action,metadata,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (logs.error) throw logs.error;

      const orgs = await service.from("organizations").select("id,name");
      if (orgs.error) throw orgs.error;
      const orgMap = new Map((orgs.data || []).map((row) => [row.id, row.name]));

      return reply(200, {
        data: (logs.data || []).map((row) => ({
          ...row,
          organization_name: row.organization_id ? orgMap.get(row.organization_id) || null : null,
        })),
      });
    }

    return reply(400, { error: `Unknown super admin action: ${action || "(empty)"}` });
  } catch (error) {
    console.error("Northborn super admin error", action, error);
    const message = error instanceof Error ? error.message : String(error);
    return reply(400, { error: message || "Super admin action failed." });
  }
});
