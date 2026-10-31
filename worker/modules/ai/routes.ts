/**
 * Optional AI Finance Copilot. Owner: Person 1.
 *
 * 1. Match the question to a supported intent (deterministic keyword rules).
 * 2. Fetch the figures with predefined, parameterised queries (no model-written SQL).
 * 3. If AI_PROVIDER/AI_API_KEY are set, ask the model to phrase a short answer from
 *    those figures only; otherwise return a template answer. Figures and links always
 *    come from the database, never from the model.
 */
import { Hono } from "hono";
import { z } from "zod";
import { addDays, todayISO } from "../../../shared/dates";
import { toMinor } from "../../../shared/money";
import type { AppEnv } from "../../env";
import { requirePermission } from "../../lib/auth";
import { money } from "../../lib/format";
import { rateLimit } from "../../lib/rate-limit";
import { all, first, MRR_EXPR } from "../../lib/sql";
import { validate } from "../../lib/validate";
import { computeHealth } from "../customers/health";

interface Answer {
  intent: string;
  title: string;
  figures: { label: string; value: string }[];
  rows: { label: string; detail: string; href: string }[];
  fallback: string;
}

const SUPPORTED = [
  "Which customers have overdue invoices above ₹10,000?",
  "How much revenue did we receive this month?",
  "Which subscriptions expire next week?",
  "Explain the revenue leakage alerts.",
  "Summarize the customers at risk.",
  "What is our MRR?",
];

async function answer(d1: D1Database, question: string): Promise<Answer | null> {
  const q = question.toLowerCase();
  const today = todayISO();

  if (/overdue|late|unpaid/.test(q)) {
    const threshold = q.match(/(?:above|over|more than|>)\s*₹?\s*([\d,]+)/)?.[1]?.replace(/,/g, "");
    const min = threshold ? toMinor(threshold) : 0;
    const rows = await all<{ id: string; name: string; balance: number; invoices: number; oldest: string }>(
      d1,
      `SELECT c.id, COALESCE(c.company_name, c.contact_name) AS name, SUM(i.total - i.amount_paid) AS balance, COUNT(*) AS invoices, MIN(i.due_date) AS oldest
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.status = 'confirmed' AND i.due_date < ?1 AND i.total > i.amount_paid
       GROUP BY c.id HAVING balance > ?2 ORDER BY balance DESC LIMIT 10`,
      today,
      min,
    );
    const total = rows.reduce((a, r) => a + r.balance, 0);
    return {
      intent: "overdue_customers",
      title: `Customers with overdue balances${min ? ` above ${money(min)}` : ""}`,
      figures: [
        { label: "Customers", value: String(rows.length) },
        { label: "Overdue amount", value: money(total) },
      ],
      rows: rows.map((r) => ({ label: r.name, detail: `${money(r.balance)} across ${r.invoices} invoice(s), oldest due ${r.oldest}`, href: `/customers/${r.id}` })),
      fallback: rows.length
        ? `${rows.length} customer(s) owe ${money(total)} in overdue invoices. The largest is ${rows[0]!.name} with ${money(rows[0]!.balance)}.`
        : "No customers have overdue invoices matching that amount.",
    };
  }

  if (/revenue|collected|received|income/.test(q)) {
    const from = `${today.slice(0, 8)}01`;
    const r = await first<{ amount: number; count: number; billed: number }>(
      d1,
      `SELECT (SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid_on BETWEEN ?1 AND ?2) AS amount,
              (SELECT COUNT(*) FROM payments WHERE paid_on BETWEEN ?1 AND ?2) AS count,
              (SELECT COALESCE(SUM(total),0) FROM invoices WHERE status != 'cancelled' AND issue_date BETWEEN ?1 AND ?2) AS billed`,
      from,
      today,
    );
    return {
      intent: "revenue_month",
      title: "Revenue this month",
      figures: [
        { label: "Collected", value: money(r?.amount ?? 0) },
        { label: "Payments", value: String(r?.count ?? 0) },
        { label: "Billed", value: money(r?.billed ?? 0) },
      ],
      rows: [{ label: "Open the revenue report", detail: `${from} to ${today}`, href: "/reports" }],
      fallback: `From ${from} to ${today} we collected ${money(r?.amount ?? 0)} from ${r?.count ?? 0} payments, against ${money(r?.billed ?? 0)} billed.`,
    };
  }

  if (/expir|renew/.test(q)) {
    const days = /month|30/.test(q) ? 30 : 7;
    const rows = await all<{ id: string; number: string; name: string; expiry_date: string; mrr: number }>(
      d1,
      `SELECT s.id, s.number, COALESCE(c.company_name, c.contact_name) AS name, s.expiry_date, ${MRR_EXPR} AS mrr
       FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN plans p ON p.id = s.plan_id
       WHERE s.status = 'active' AND s.expiry_date BETWEEN ?1 AND ?2 ORDER BY s.expiry_date LIMIT 20`,
      today,
      addDays(today, days),
    );
    return {
      intent: "expiring",
      title: `Subscriptions expiring in the next ${days} days`,
      figures: [
        { label: "Subscriptions", value: String(rows.length) },
        { label: "Monthly value", value: money(Math.round(rows.reduce((a, r) => a + r.mrr, 0))) },
      ],
      rows: rows.map((r) => ({ label: `${r.number} · ${r.name}`, detail: `Expires ${r.expiry_date}`, href: `/subscriptions/${r.id}` })),
      fallback: rows.length ? `${rows.length} subscription(s) expire in the next ${days} days. Prepare renewals from the Renewals page.` : `No subscriptions expire in the next ${days} days.`,
    };
  }

  if (/leak|anomal|finding|risk.*revenue|alert/.test(q)) {
    const rows = await all<{ rule: string; count: number; amount: number }>(
      d1,
      `SELECT rule, COUNT(*) AS count, SUM(amount_at_risk) AS amount FROM findings WHERE status != 'resolved' GROUP BY rule ORDER BY amount DESC`,
    );
    const total = rows.reduce((a, r) => a + r.amount, 0);
    return {
      intent: "leakage",
      title: "Open revenue leakage and anomaly findings",
      figures: [
        { label: "Open findings", value: String(rows.reduce((a, r) => a + r.count, 0)) },
        { label: "Potential revenue at risk", value: money(total) },
      ],
      rows: rows.map((r) => ({ label: r.rule.replace(/_/g, " "), detail: `${r.count} finding(s), ${money(r.amount)} at risk`, href: "/finance/leakage" })),
      fallback: rows.length
        ? `There are ${rows.reduce((a, r) => a + r.count, 0)} open findings with ${money(total)} of potential revenue at risk. The biggest category is "${rows[0]!.rule.replace(/_/g, " ")}".`
        : "There are no open leakage or anomaly findings.",
    };
  }

  if (/risk|health|churn/.test(q)) {
    const all = (await computeHealth(d1)).filter((h) => h.category !== "healthy").sort((a, b) => a.score - b.score);
    return {
      intent: "at_risk",
      title: "Customers at risk",
      figures: [
        { label: "At risk", value: String(all.filter((h) => h.category === "at_risk").length) },
        { label: "Needs attention", value: String(all.filter((h) => h.category === "needs_attention").length) },
      ],
      rows: all.slice(0, 10).map((h) => ({ label: `${h.customerName} · score ${h.score}`, detail: h.reasons.map((r) => r.signal).join("; "), href: `/customers/${h.customerId}` })),
      fallback: all.length ? `${all.length} customer(s) need attention. Lowest score: ${all[0]!.customerName} (${all[0]!.score}) — ${all[0]!.nextAction}` : "All customers are healthy.",
    };
  }

  if (/mrr|arr|recurring/.test(q)) {
    const r = await first<{ mrr: number; n: number }>(
      d1,
      `SELECT COALESCE(SUM(${MRR_EXPR}),0) AS mrr, COUNT(*) AS n FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'`,
    );
    const mrr = Math.round(r?.mrr ?? 0);
    return {
      intent: "mrr",
      title: "Monthly recurring revenue",
      figures: [
        { label: "MRR", value: money(mrr) },
        { label: "ARR", value: money(mrr * 12) },
        { label: "Active subscriptions", value: String(r?.n ?? 0) },
      ],
      rows: [{ label: "Open the MRR trend", detail: "Reports → MRR", href: "/reports" }],
      fallback: `MRR is ${money(mrr)} (ARR ${money(mrr * 12)}) from ${r?.n ?? 0} active subscriptions.`,
    };
  }
  return null;
}

const cache = new Map<string, { at: number; text: string }>();

async function phrase(env: Env, question: string, a: Answer): Promise<{ text: string; source: "ai" | "rules" }> {
  if (!env.AI_API_KEY || !env.AI_PROVIDER) return { text: a.fallback, source: "rules" };
  const context = JSON.stringify({ title: a.title, figures: a.figures, items: a.rows.slice(0, 8).map((r) => `${r.label}: ${r.detail}`) });
  const key = `${a.intent}:${context}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return { text: hit.text, source: "ai" };
  const system =
    "You are a finance assistant for a subscription business. Answer in at most 4 short sentences using ONLY the figures in the context. " +
    "Never invent numbers. Use ₹ amounts exactly as given. Suggest one concrete next step.";
  try {
    let text: string | undefined;
    if (env.AI_PROVIDER === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${env.AI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: env.AI_MODEL || "llama-3.3-70b-versatile",
          max_tokens: 220,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: `Question: ${question}\nContext: ${context}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = data.choices?.[0]?.message?.content;
    } else if (env.AI_PROVIDER === "gemini") {
      const model = env.AI_MODEL || "gemini-2.0-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": env.AI_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: `Question: ${question}\nContext: ${context}` }] }],
          generationConfig: { maxOutputTokens: 220, temperature: 0.2 },
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
    }
    if (!text) return { text: a.fallback, source: "rules" };
    cache.set(key, { at: Date.now(), text: text.trim() });
    return { text: text.trim(), source: "ai" };
  } catch (err) {
    // Quota or network errors: fall back without retrying.
    console.warn("AI copilot fallback", err);
    return { text: a.fallback, source: "rules" };
  }
}

export const aiRoutes = new Hono<AppEnv>()
  .get("/status", requirePermission("ai:use"), (c) =>
    c.json({ enabled: !!(c.env.AI_API_KEY && c.env.AI_PROVIDER), provider: c.env.AI_PROVIDER || null, suggestions: SUPPORTED }),
  )
  .post(
    "/ask",
    requirePermission("ai:use"),
    rateLimit({ name: "ai", limit: 30, windowSeconds: 3600 }),
    validate("json", z.object({ question: z.string().trim().min(3).max(300) })),
    async (c) => {
      const { question } = c.req.valid("json");
      const a = await answer(c.env.DB, question);
      if (!a) {
        return c.json({
          data: {
            supported: false,
            text: "I can answer questions about overdue invoices, revenue this month, expiring subscriptions, revenue leakage, customers at risk and MRR.",
            suggestions: SUPPORTED,
          },
        });
      }
      const { text, source } = await phrase(c.env, question, a);
      return c.json({ data: { supported: true, intent: a.intent, title: a.title, text, source, figures: a.figures, rows: a.rows } });
    },
  );

