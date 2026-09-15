import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const money = (value: unknown, currency = "CAD") => new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency,
  minimumFractionDigits: 2,
}).format(Number(value ?? 0));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization = req.headers.get("Authorization") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const fromAddress = Deno.env.get("RESEND_FROM_EMAIL") || "Northborn <onboarding@resend.dev>";
    const appUrl = Deno.env.get("NORTHBORN_APP_URL") || "https://northborn.vercel.app";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return Response.json({ ok: false, error: "Sign in is required to send invoices." }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const organizationId = String(body.organizationId ?? "");
    const invoiceId = String(body.invoiceId ?? "");
    if (!organizationId || !invoiceId) {
      return Response.json({ ok: false, error: "Company and invoice are required." }, { status: 400, headers: corsHeaders });
    }

    const payloadResult = await userClient.rpc("get_invoice_delivery_payload", {
      _organization_id: organizationId,
      _invoice_id: invoiceId,
    });
    if (payloadResult.error) {
      return Response.json({ ok: false, error: payloadResult.error.message }, { status: 403, headers: corsHeaders });
    }

    const invoice = payloadResult.data?.invoice;
    const lines = payloadResult.data?.line_items ?? [];
    if (!invoice) return Response.json({ ok: false, error: "Invoice not found." }, { status: 404, headers: corsHeaders });
    if (!resendKey) {
      await userClient.rpc("record_invoice_delivery", { _organization_id: organizationId, _invoice_id: invoiceId, _error: "RESEND_API_KEY is not configured" });
      return Response.json({ ok: false, error: "Invoice email is not configured yet. Add the Resend API key to enable sending." }, { status: 503, headers: corsHeaders });
    }

    const lineRows = lines.map((line: any) => `<tr><td style="padding:8px;border-bottom:1px solid #e7e7e7">${esc(line.description)}</td><td style="padding:8px;border-bottom:1px solid #e7e7e7;text-align:right">${esc(line.quantity)} ${esc(line.unit)}</td><td style="padding:8px;border-bottom:1px solid #e7e7e7;text-align:right">${money(line.rate, invoice.currency_code)}</td><td style="padding:8px;border-bottom:1px solid #e7e7e7;text-align:right">${money(line.amount, invoice.currency_code)}</td></tr>`).join("");
    const portalLink = `${appUrl}/`;
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f6f8;margin:0;padding:24px;color:#17202b"><div style="max-width:720px;margin:auto;background:white;border-radius:14px;padding:26px;border:1px solid #e1e5e9"><div style="display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #17202b;padding-bottom:14px"><div><h1 style="margin:0;font-size:22px">${esc(invoice.seller_name || "Northborn")}</h1><div style="color:#667085;margin-top:6px">${esc(invoice.seller_email || "")}</div></div><div style="text-align:right"><div style="font-size:12px;color:#667085">INVOICE</div><strong style="font-size:22px">${esc(invoice.invoice_number)}</strong></div></div><p style="margin:22px 0 8px">Hello ${esc(invoice.billed_to_name || invoice.customer_name || "")},</p><p style="color:#475467;line-height:1.55">Your invoice is ready. You can review the billing details below or sign in to your Northborn client portal for the full invoice record.</p><table style="width:100%;border-collapse:collapse;margin-top:18px"><thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #17202b">Service</th><th style="text-align:right;padding:8px;border-bottom:2px solid #17202b">Qty</th><th style="text-align:right;padding:8px;border-bottom:2px solid #17202b">Rate</th><th style="text-align:right;padding:8px;border-bottom:2px solid #17202b">Amount</th></tr></thead><tbody>${lineRows}</tbody></table><div style="margin:20px 0 0 auto;max-width:300px"><div style="display:flex;justify-content:space-between;padding:6px 0"><span>Subtotal</span><b>${money(invoice.subtotal, invoice.currency_code)}</b></div><div style="display:flex;justify-content:space-between;padding:6px 0"><span>Tax</span><b>${money(invoice.tax_total, invoice.currency_code)}</b></div><div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #17202b;font-size:18px"><span>Total</span><b>${money(invoice.total, invoice.currency_code)}</b></div></div><div style="margin-top:24px"><a href="${portalLink}" style="display:inline-block;background:#d58a34;color:#17120b;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Open client portal</a></div><p style="margin-top:24px;color:#667085;font-size:12px">Invoice date: ${esc(invoice.invoice_date)}${invoice.due_date ? ` · Due: ${esc(invoice.due_date)}` : ""}</p></div></body></html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [invoice.billed_to_email],
        subject: `Invoice ${invoice.invoice_number} from ${invoice.seller_name || "Northborn"}`,
        html,
      }),
    });

    const delivery = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(delivery?.message || delivery?.error || `Email provider returned ${response.status}`);
      await userClient.rpc("record_invoice_delivery", { _organization_id: organizationId, _invoice_id: invoiceId, _error: message });
      return Response.json({ ok: false, error: message }, { status: 502, headers: corsHeaders });
    }

    await userClient.rpc("record_invoice_delivery", { _organization_id: organizationId, _invoice_id: invoiceId, _error: null });
    return Response.json({ ok: true, email: invoice.billed_to_email, id: delivery?.id ?? null }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unable to send invoice." }, { status: 500, headers: corsHeaders });
  }
});
