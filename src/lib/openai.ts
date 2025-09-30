// server/ai/createCFOCompletion.ts
// Server-only. Do NOT import into "use client" files.

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { availableFunctions } from "../server/functions";

/* ------------------------------ OpenAI setup ------------------------------ */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL_PLANNER = "gpt-4o";      // swap to 'gpt-4o-mini' if you want to save $
const MODEL_COMPOSER = "gpt-4o";

function assertApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
}

function redactForLog(s: string, max = 800) {
  if (!s) return s;
  try {
    const trimmed = s.length > max ? s.slice(0, max) + "…" : s;
    return trimmed.replace(/"api_key"\s*:\s*".*?"/gi, '"api_key":"***"');
  } catch {
    return s.slice(0, max);
  }
}

async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  tries = 3,
  timeoutMs = 25_000
): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      // Retry on rate limits and transient server errors
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const delay = 400 * Math.pow(2, i) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const delay = 400 * Math.pow(2, i) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr || new Error("Network error");
}

async function createChatCompletion(body: Record<string, unknown>) {
  assertApiKey();
  const res = await fetchWithRetry(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("❌ OpenAI error", {
      status: res.status,
      statusText: res.statusText,
      responseText: text.slice(0, 1500),
      requestPreview: redactForLog(JSON.stringify(body || {})),
    });
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (e: any) {
    console.error("❌ Failed to parse OpenAI JSON:", e?.message, text.slice(0, 500));
    throw new Error("Failed to parse OpenAI response JSON");
  }
}

/** Compact any tool result before feeding back to the LLM (keeps token use sane) */
function compactForLLM(result: any) {
  try {
    if (!result || typeof result !== "object") return result;
    const MAX_ARRAY_ITEMS = 50;
    const MAX_STRING_LEN = 300;

    const prune = (v: any): any => {
      if (Array.isArray(v)) return v.slice(0, MAX_ARRAY_ITEMS).map(prune);
      if (v && typeof v === "object") {
        const out: any = {};
        for (const [k, val] of Object.entries(v)) {
          if ((k === "records" || k === "payments") && Array.isArray(val)) {
            out[k] = val.slice(0, MAX_ARRAY_ITEMS).map(prune);
          } else {
            out[k] = prune(val);
          }
        }
        return out;
      }
      if (typeof v === "string") {
        return v.length > MAX_STRING_LEN ? v.slice(0, MAX_STRING_LEN) + "…" : v;
      }
      return v;
    };
    return prune(result);
  } catch {
    return result;
  }
}

/* ------------------------------ Time helpers ------------------------------ */

export const NY_TZ = "America/New_York";

function localISO(d: Date, tz = NY_TZ) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // @ts-ignore
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ytdRange(tz = NY_TZ) {
  const now = new Date();
  const year = new Intl.DateTimeFormat("en", { timeZone: tz, year: "numeric" }).format(now);
  const jan1 = new Date(Number(year), 0, 1);
  return { start: localISO(jan1, tz), end: localISO(now, tz) };
}

function currentWeekMonSun(tz = NY_TZ) {
  const now = new Date();
  const weekday = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "numeric" as any }).format(now)
  ); // 1=Mon..7=Sun
  const offsetFromMon = weekday - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - offsetFromMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: localISO(monday, tz), end: localISO(sunday, tz) };
}

/* -------------------------- Intent classification ------------------------- */

type Topic = "payroll" | "ar" | "ap" | "financial";
type Intent =
  | "customer_profitability"
  | "incoming_cash"
  | "aging_overview"
  | "gross_profit"
  | "generic_financial"
  | "generic_payroll"
  | "generic_ar"
  | "generic_ap"
  | "outgoing_cash";

function classify(message: string): { topic: Topic; intent: Intent } {
  const m = (message || "").toLowerCase();

  const mentionsCustomer = /\b(customers?|tenants?|clients?)\b/.test(m);

  const arTerms = /\b(ar|a\/r|accounts receivable|aging|aged|past due|overdue|collections?|invoices?|receivables?)\b/.test(
    m
  );
  const apTerms =
    /\b(ap|a\/p|accounts payable|payables?|vendors?|supplier invoices?|bills?|outgoing payments?|disbursements?)\b/.test(m);
  const vendorFocus = /\bvendors?|suppliers?\b/.test(m);
  const incomingTerms = /\b(this week|next week|today|tomorrow|in the next (?:\d+\s*)?day|coming in|expected cash|cash forecast|receipts?)\b/.test(
    m
  );
  const outgoingTerms =
    /\b(outgoing cash|cash out|cash going out|pay(?:ments?)? due|bills? due|due (?:today|tomorrow|this week|next week)|owe|owing|upcoming payments?|disbursements?|pay vendors?)\b/.test(m);

  const cogsTerms = /\bcogs\b|cost of goods\b|costs? of sales?\b/.test(m);
  const grossProfitTerms = /\bgross profit\b|\bgp\b(?!t)|\bgp%\b|\bgross margin\b/.test(m);
  const profitabilityTerms =
    cogsTerms ||
    grossProfitTerms ||
    /\bprofit(ability)?\b|\bmargin(s)?\b|\bnet income\b|\brevenue\b.*\b(expenses?|cogs)\b|\bprofit per\b/.test(m);

  const payrollTerms = /\bpayroll|paychecks?|wages?|gross pay|net pay|pay run|direct deposit|pay stub|employees?\b/.test(
    m
  );

  if (payrollTerms) return { topic: "payroll", intent: "generic_payroll" };

  if (apTerms || (vendorFocus && /\b(bills?|payments?|due|owe|owing)\b/.test(m))) {
    return { topic: "ap", intent: outgoingTerms ? "outgoing_cash" : "generic_ap" };
  }

  if (mentionsCustomer && (grossProfitTerms || cogsTerms)) {
    return { topic: "financial", intent: "customer_profitability" };
  }

  if (mentionsCustomer && arTerms) {
    return { topic: "ar", intent: incomingTerms ? "incoming_cash" : "aging_overview" };
  }

  if (arTerms) return { topic: "ar", intent: incomingTerms ? "incoming_cash" : "generic_ar" };

  if (grossProfitTerms || cogsTerms) return { topic: "financial", intent: "gross_profit" };

  if (profitabilityTerms) return { topic: "financial", intent: "generic_financial" };

  return { topic: "financial", intent: "generic_financial" };
}

/* ----------------------------- Tool definition ---------------------------- */

const fnKeys = Object.keys(availableFunctions || {});
function pickFunctionName(candidates: string[]): string | null {
  // exact
  for (const c of candidates) if (fnKeys.includes(c)) return c;
  // case-insensitive exact
  for (const c of candidates) {
    const hit = fnKeys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  // word boundary
  for (const c of candidates) {
    const rx = new RegExp(`\\b${c}\\b`, "i");
    const hit = fnKeys.find((k) => rx.test(k));
    if (hit) return hit;
  }
  // substring
  for (const c of candidates) {
    const hit = fnKeys.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

function buildTools(topic: Topic, intent: Intent) {
  const tools: any[] = [];

  // Payroll → payments
  if (topic === "payroll") {
    const name = pickFunctionName(["getPaymentsSummary", "paymentsSummary", "listPayments"]);
    if (name) {
      tools.push({
        type: "function",
        function: {
          name,
          description: "Query payroll payments (Supabase: payments).",
          parameters: {
            type: "object",
            properties: {
              startDate: { type: "string" },
              endDate: { type: "string" },
              employee: { type: "string" },
              department: { type: "string" },
              minAmount: { type: "number" },
              maxAmount: { type: "number" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const monthly = pickFunctionName(["getPayrollByMonth", "getMonthlyPayroll", "payrollByMonth"]);
    if (monthly) {
      tools.push({
        type: "function",
        function: {
          name: monthly,
          description: "Monthly payroll totals from payments with department breakdown.",
          parameters: {
            type: "object",
            properties: {
              startDate: { type: "string" },
              endDate: { type: "string" },
              employee: { type: "string" },
              department: { type: "string" },
              minAmount: { type: "number" },
              maxAmount: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const payrollRaw = pickFunctionName(["queryPayroll", "queryPayments", "queryPayrollTable"]);
    if (payrollRaw) {
      tools.push({
        type: "function",
        function: {
          name: payrollRaw,
          description: "Direct query access to the payments table; supports arbitrary column filters.",
          parameters: {
            type: "object",
            properties: {
              select: { type: "string", description: 'Columns, e.g. "*" or "date,department"' },
              filters: {
                type: "object",
                description: "Key/value filters; string values use ilike matching",
                additionalProperties: true,
              },
              orderBy: { type: "string" },
              ascending: { type: "boolean" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }
  }

  // A/P
  if (topic === "ap") {
    const apSummary = pickFunctionName(["getAPAgingSummary", "getAPSummary", "getAccountsPayableSummary"]);
    if (apSummary) {
      tools.push({
        type: "function",
        function: {
          name: apSummary,
          description: "Accounts payable aging summary grouped by vendor (Supabase: ap_aging).",
          parameters: {
            type: "object",
            properties: {
              vendor: { type: "string", description: "Vendor name" },
              vendorId: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              dueOnly: { type: "boolean" },
              status: { type: "string", description: "open|paid|overdue" },
              minPastDueDays: { type: "number" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const apDetail = pickFunctionName(["getAPAgingDetail", "getAPOpenBills", "getAPInvoices"]);
    if (apDetail) {
      tools.push({
        type: "function",
        function: {
          name: apDetail,
          description: "Detailed vendor bills from ap_aging including due dates and open balances.",
          parameters: {
            type: "object",
            properties: {
              vendor: { type: "string" },
              vendorId: { type: "string" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              dueOnly: { type: "boolean" },
              status: { type: "string" },
              minPastDueDays: { type: "number" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const apRaw = pickFunctionName(["queryAPAgingTable", "queryAPTable", "queryAPAging"]);
    if (apRaw) {
      tools.push({
        type: "function",
        function: {
          name: apRaw,
          description: "Direct query access to ap_aging with flexible column filters.",
          parameters: {
            type: "object",
            properties: {
              select: { type: "string", description: "Columns to return" },
              filters: {
                type: "object",
                description: "Key/value filters; string values use ilike matching",
                additionalProperties: true,
              },
              orderBy: { type: "string" },
              ascending: { type: "boolean" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }
  }

  // A/R
  if (topic === "ar") {
    const agingDetail = pickFunctionName([
      "getARAgingDetail",
      "getARAgingAnalysis",
      "getAROpenInvoices",
      "getARInvoices",
    ]);
    if (agingDetail) {
      tools.push({
        type: "function",
        function: {
          name: agingDetail,
          description:
            intent === "incoming_cash"
              ? "Open invoices from ar_aging_detail; filter by due date window (e.g., this week)."
              : "A/R aging or open invoices (ar_aging_detail).",
          parameters: {
            type: "object",
            properties: {
              customer: { type: "string", description: "Customer name or ID" },
              startDate: { type: "string", description: "Invoice due start (YYYY-MM-DD)" },
              endDate: { type: "string", description: "Invoice due end (YYYY-MM-DD)" },
              dueOnly: { type: "boolean", description: "Only invoices due in window" },
              status: { type: "string", description: "open|paid|overdue" },
              minPastDueDays: { type: "number" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const arHistory = pickFunctionName(["getARPaymentHistory", "getARHistory", "getReceiptsHistory"]);
    if (arHistory) {
      tools.push({
        type: "function",
        function: {
          name: arHistory,
          description: "A/R payment / collection history over a timeframe.",
          parameters: {
            type: "object",
            properties: {
              customerId: { type: "string" },
              customer: { type: "string" },
              timeframe: {
                type: "string",
                description:
                  'Timeframe label (e.g., "this_week", "last_week", "this_month", "last_month", "ytd", "3_months", "6_months", "12_months", "90_days").',
              },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const arRaw = pickFunctionName(["queryARAgingDetailTable", "queryARAgingDetail", "queryARTable"]);
    if (arRaw) {
      tools.push({
        type: "function",
        function: {
          name: arRaw,
          description: "Direct query access to ar_aging_detail with flexible column filters.",
          parameters: {
            type: "object",
            properties: {
              select: { type: "string", description: "Columns to return" },
              filters: {
                type: "object",
                description: "Key/value filters; string values use ilike matching",
                additionalProperties: true,
              },
              orderBy: { type: "string" },
              ascending: { type: "boolean" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const jlRawAR = pickFunctionName(["queryJournalEntryLines", "queryJournalEntries"]);
    if (jlRawAR) {
      tools.push({
        type: "function",
        function: {
          name: jlRawAR,
          description: "Direct query access to journal_entry_lines with arbitrary filters.",
          parameters: {
            type: "object",
            properties: {
              select: { type: "string", description: "Columns to return" },
              filters: {
                type: "object",
                description: "Key/value filters; string values use ilike matching",
                additionalProperties: true,
              },
              orderBy: { type: "string" },
              ascending: { type: "boolean" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }
  }

  // Financial / GL
  if (topic === "financial") {
    const custProfit = pickFunctionName(["getCustomerProfitability", "getCustomerNetIncome"]);
    const finSummary = pickFunctionName(["getFinancialSummary", "getGLSummary", "getJournalSummary"]);
    const acctTrends = pickFunctionName(["getAccountTrends", "getGLTrends", "getMonthlyTrend"]);

    if (intent === "customer_profitability" && (custProfit || finSummary)) {
      const name = custProfit || finSummary!;
      tools.push({
        type: "function",
        function: {
          name,
          description:
            "Customer profitability using journal_entry_lines (Revenue, COGS/Expenses → Net or GP). Supports customer filter.",
          parameters: {
            type: "object",
            properties: {
              customer: { type: "string", description: "Customer name or ID" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              includeCOGS: { type: "boolean" },
              includeOverhead: { type: "boolean" },
              groupByMonth: { type: "boolean" },
            },
            additionalProperties: false,
          },
        },
      });
    } else if (finSummary) {
      tools.push({
        type: "function",
        function: {
          name: finSummary,
          description:
            'Financial summary from journal_entry_lines. Return totals and top accounts; can filter by account substring (e.g., "Revenue", "COGS") and entity/customer. Use to compute Revenue, COGS, Gross Profit (GP), and GP%.',
          parameters: {
            type: "object",
            properties: {
              startDate: { type: "string" },
              endDate: { type: "string" },
              accountLike: { type: "string" },
              entity: { type: "string", description: "Customer/Entity filter" },
              groupByMonth: { type: "boolean" },
              metricsOnly: { type: "boolean" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });

      if (acctTrends) {
        tools.push({
          type: "function",
          function: {
            name: acctTrends,
            description: "Monthly net trend from journal_entry_lines, optionally filtered by account/entity.",
            parameters: {
              type: "object",
              properties: {
                startDate: { type: "string" },
                endDate: { type: "string" },
                accountLike: { type: "string" },
                entity: { type: "string" },
                limit: { type: "number" },
                offset: { type: "number" },
              },
              additionalProperties: false,
            },
          },
        });
      }
    }

    const jlRawFin = pickFunctionName(["queryJournalEntryLines", "queryJournalEntries"]);
    if (jlRawFin) {
      tools.push({
        type: "function",
        function: {
          name: jlRawFin,
          description: "Direct query access to journal_entry_lines with flexible column filters.",
          parameters: {
            type: "object",
            properties: {
              select: { type: "string", description: "Columns to return" },
              filters: {
                type: "object",
                description: "Key/value filters; string values use ilike matching",
                additionalProperties: true,
              },
              orderBy: { type: "string" },
              ascending: { type: "boolean" },
              limit: { type: "number" },
              offset: { type: "number" },
            },
            additionalProperties: false,
          },
        },
      });
    }
  }

  return tools;
}

/* --------------------------------- Main ----------------------------------- */

export const createCFOCompletion = async (message: string, context: any = {}) => {
  try {
    const { topic, intent } = classify(message);
    const tools = buildTools(topic, intent);

    console.log("🚀 createCFOCompletion:", {
      topic,
      intent,
      messagePreview: (message || "").slice(0, 160),
      toolNames: tools.map((t: any) => t.function.name),
    });

    const today = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: NY_TZ,
    });

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are the AI CFO for the "I AM CFO" platform.

Current date: ${today}.
Keep responses concise (≈350 words). Use bullets and short sections. If content is long, summarize and offer drill-down.

ROUTING
- Payroll → payments
- A/P → ap_aging
- A/R → ar_aging_detail
- Financials & customer profitability → journal_entry_lines
- If the user says "what's coming in this week", interpret as expected receipts from open invoices due THIS calendar week.

EXECUTION
- ALWAYS use tools when available. Do not invent numbers.
- When wording is imperfect, make a reasonable assumption, run the query, and note the assumption rather than refusing.
- If the user didn't provide a period:
  - A/R "incoming cash": use Monday–Sunday of the current week (America/New_York).
  - Financial: default to YTD (America/New_York).
- If only a customer name is given, scope to that customer; otherwise company-wide with top contributors.
- Present clear KPIs and bullets. End with "More than just a balance sheet" when analysis is provided.

GROSS PROFIT LOGIC
- Revenue: sum of credits in Income/Revenue/Sales accounts.
- COGS: sum of debits in accounts containing "COGS" or "Cost of Goods" (exclude overhead unless asked).
- Gross Profit (GP) = Revenue − COGS. GP% = (GP / Revenue) × 100.
- For GP/COGS, prefer the financial summary tool; filter with accountLike "Revenue" and "COGS" when needed.`,
      },
      { role: "user", content: message },
    ];

    // ---- First call: let model choose tool + args
    const firstReq: any = {
      model: MODEL_PLANNER,
      messages,
      temperature: 0.2,
      max_tokens: 500,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    };

    const completion = await createChatCompletion(firstReq);
    const aiMsg = completion.choices?.[0]?.message ?? {};
    console.log("✅ First call finish_reason:", completion.choices?.[0]?.finish_reason);

    if (!aiMsg.tool_calls || aiMsg.tool_calls.length === 0) {
      console.log("ℹ️ No tool calls; returning text.");
      return aiMsg.content ?? "No response.";
    }

    // ---- Execute tool calls
    (messages as any).push(aiMsg);

    const scrubArgs = (fnName: string, rawArgs: any) => {
      const allow = new Set<string>();
      const fnLower = fnName.toLowerCase();

      if (fnLower.includes("payment") || fnLower.includes("payroll")) {
        ["startDate", "endDate", "employee", "department", "minAmount", "maxAmount", "limit", "offset"].forEach((k) =>
          allow.add(k)
        );
      } else if (fnLower.includes("ar")) {
        [
          "customer",
          "customerId",
          "startDate",
          "endDate",
          "dueOnly",
          "status",
          "minPastDueDays",
          "limit",
          "offset",
          "timeframe",
        ].forEach((k) => allow.add(k));
      } else if (fnLower.includes("ap")) {
        [
          "vendor",
          "vendorId",
          "startDate",
          "endDate",
          "dueOnly",
          "status",
          "minPastDueDays",
          "limit",
          "offset",
        ].forEach((k) => allow.add(k));
      } else {
        // financial
        [
          "customer",
          "startDate",
          "endDate",
          "includeCOGS",
          "includeOverhead",
          "groupByMonth",
          "accountLike",
          "entity",
          "metricsOnly",
          "limit",
          "offset",
        ].forEach((k) => allow.add(k));
      }
      const out: any = {};
      if (rawArgs && typeof rawArgs === "object") {
        for (const [k, v] of Object.entries(rawArgs)) if (allow.has(k)) out[k] = v;
      }
      return out;
    };

    for (const tc of aiMsg.tool_calls) {
      const functionName = tc.function?.name as keyof typeof availableFunctions;
      let rawArgs: any = {};
      try {
        rawArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (e: any) {
        console.warn(`⚠️ Could not parse args for ${String(functionName)}:`, e?.message);
      }

      // AR "incoming cash" → this Mon–Sun (NY), open & dueOnly by default
      if (topic === "ar" && intent === "incoming_cash") {
        const { start, end } = currentWeekMonSun(NY_TZ);
        rawArgs.startDate = rawArgs.startDate || start;
        rawArgs.endDate = rawArgs.endDate || end;
        if (typeof rawArgs.dueOnly === "undefined") rawArgs.dueOnly = true;
        if (!rawArgs.status) rawArgs.status = "open";
        if (typeof rawArgs.limit === "undefined") rawArgs.limit = 200;
      }

      // A/P "cash out" defaults → current Mon–Sun window, open bills only
      if (topic === "ap" && intent === "outgoing_cash") {
        const { start, end } = currentWeekMonSun(NY_TZ);
        rawArgs.startDate = rawArgs.startDate || start;
        rawArgs.endDate = rawArgs.endDate || end;
        if (typeof rawArgs.dueOnly === "undefined") rawArgs.dueOnly = true;
        if (!rawArgs.status) rawArgs.status = "open";
      }

      if (topic === "ap") {
        if (typeof rawArgs.limit === "undefined") rawArgs.limit = 200;
        if (typeof rawArgs.offset === "undefined") rawArgs.offset = 0;
      }

      // Financial defaults → YTD; keep payload small
      if (topic === "financial") {
        const { start, end } = ytdRange(NY_TZ);
        rawArgs.startDate = rawArgs.startDate || start;
        rawArgs.endDate = rawArgs.endDate || end;
        if (typeof rawArgs.groupByMonth === "undefined") rawArgs.groupByMonth = true;
        if (typeof rawArgs.metricsOnly === "undefined") rawArgs.metricsOnly = true;
        if (typeof rawArgs.limit === "undefined") rawArgs.limit = 0;
        if (typeof rawArgs.offset === "undefined") rawArgs.offset = 0;

        // Nudge for GP requests
        if (intent === "gross_profit" && !rawArgs.accountLike) {
          rawArgs.accountLike = "Revenue";
        }
      }

      const args = scrubArgs(String(functionName), rawArgs);

      let result: any;
      try {
        const fn = availableFunctions[functionName];
        if (typeof fn !== "function") {
          throw new Error(`Function ${String(functionName)} not found in availableFunctions`);
        }
        console.log(`🔧 Calling ${String(functionName)} with`, redactForLog(JSON.stringify(args || {}), 600));
        result = await fn(args);
      } catch (err: any) {
        console.error(`❌ Tool ${String(functionName)} failed:`, err?.message);
        result = { success: false, error: err?.message || "Tool error" };
      }

      // Tool response back to LLM (compact to keep tokens tidy)
      (messages as any).push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(compactForLLM(result)),
      });
    }

    // ---- Second call: compose final answer
    const second = await createChatCompletion({
      model: MODEL_COMPOSER,
      messages,
      temperature: 0.2,
      max_tokens: 900,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    });

    const finalMsg = second.choices?.[0]?.message ?? {};
    console.log("✅ Second call finish_reason:", second.choices?.[0]?.finish_reason);

    return finalMsg.content ?? "Done.";
  } catch (error: any) {
    console.error("❌ OpenAI Error:", { name: error?.name, message: error?.message, stack: error?.stack });

    const msg = (error?.message || "").toLowerCase();
    if (msg.includes("insufficient_quota")) {
      return "I'm temporarily unable to analyze your data due to API limits. Please try again in a moment.";
    } else if (msg.includes("context_length_exceeded")) {
      return "Your query involves too much data. Please try asking about a specific customer or shorter time period.";
    } else if (msg.includes("api key")) {
      return "There's an issue with the API configuration. Please contact support.";
    } else if (msg.includes("abort")) {
      return "The request timed out. Please try again or narrow the query.";
    } else {
      return "I encountered an issue analyzing your financial data. Please try rephrasing your question or contact support if this persists.";
    }
  }
};
