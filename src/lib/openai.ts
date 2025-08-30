// server/ai/createCFOCompletion.ts
// Server-only. Do NOT import into "use client" files.

import { availableFunctions } from '../server/functions';

/* -------------------------- OpenAI helpers -------------------------- */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL_PLANNER = 'gpt-4o';   // you can switch to 'gpt-4o-mini' to save $
const MODEL_COMPOSER = 'gpt-4o';

function assertApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }
}

function redactForLog(s: string, max = 800) {
  if (!s) return s;
  try {
    const trimmed = s.length > max ? s.slice(0, max) + '…' : s;
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
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const delay = 400 * Math.pow(2, i) + Math.random() * 200;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const delay = 400 * Math.pow(2, i) + Math.random() * 200;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr || new Error('Network error');
}

async function createChatCompletion(body: Record<string, unknown>) {
  assertApiKey();
  const res = await fetchWithRetry(
    OPENAI_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    console.error('❌ OpenAI error', {
      status: res.status,
      statusText: res.statusText,
      responseText: text.slice(0, 1500),
      requestPreview: redactForLog(JSON.stringify(body || {})),
    });
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }
  try { return JSON.parse(text); }
  catch (e: any) {
    console.error('❌ Failed to parse OpenAI JSON:', e?.message, text.slice(0, 500));
    throw new Error('Failed to parse OpenAI response JSON');
  }
}

/** Compact a tool result before passing it into the second LLM call */
function compactForLLM(result: any) {
  try {
    if (!result || typeof result !== 'object') return result;
    const MAX_ARRAY_ITEMS = 50;
    const MAX_STRING_LEN = 300;

    const prune = (v: any): any => {
      if (Array.isArray(v)) return v.slice(0, MAX_ARRAY_ITEMS).map(prune);
      if (v && typeof v === 'object') {
        const out: any = {};
        for (const [k, val] of Object.entries(v)) {
          if ((k === 'records' || k === 'payments') && Array.isArray(val)) {
            out[k] = val.slice(0, MAX_ARRAY_ITEMS).map(prune);
          } else {
            out[k] = prune(val);
          }
        }
        return out;
      }
      if (typeof v === 'string') return v.length > MAX_STRING_LEN ? v.slice(0, MAX_STRING_LEN) + '…' : v;
      return v;
    };
    return prune(result);
  } catch {
    return result;
  }
}

/* -------------------------- Timezone helpers -------------------------- */

export const NY_TZ = 'America/New_York';

function localISO(d: Date, tz = NY_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // @ts-ignore
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ytdRange(tz = NY_TZ) {
  const now = new Date();
  const year = new Intl.DateTimeFormat('en', { timeZone: tz, year: 'numeric' }).format(now);
  const jan1 = new Date(Number(year), 0, 1);
  return { start: localISO(jan1, tz), end: localISO(now, tz) };
}

function currentWeekMonSun(tz = NY_TZ) {
  const now = new Date();
  const weekday = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'numeric' as any }).format(now)); // 1=Mon..7=Sun
  const offsetFromMon = weekday - 1;
  const monday = new Date(now); monday.setDate(now.getDate() - offsetFromMon);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { start: localISO(monday, tz), end: localISO(sunday, tz) };
}

/* -------------------------- Intent classification -------------------------- */

type Topic = 'payroll' | 'ar' | 'financial';
type Intent =
  | 'customer_profitability'
  | 'incoming_cash'
  | 'aging_overview'
  | 'gross_profit'           // NEW
  | 'generic_financial'
  | 'generic_payroll'
  | 'generic_ar';

function classify(message: string): { topic: Topic; intent: Intent } {
  const m = (message || '').toLowerCase();

  const mentionsCustomer = /\b(customers?|tenants?|clients?)\b/.test(m);

  const arTerms = /\b(ar|a\/r|accounts receivable|aging|aged|past due|overdue|collections?|invoices?|receivables?)\b/.test(m);
  const incomingTerms = /\b(this week|next week|today|tomorrow|in the next (?:\d+\s*)?day|coming in|expected cash|cash forecast|receipts?)\b/.test(m);

  const cogsTerms = /\bcogs\b|cost of goods\b|costs? of sales?\b/.test(m);
  const grossProfitTerms = /\bgross profit\b|\bgp\b(?!t)|\bgp%\b|\bgross margin\b/.test(m);
  const profitabilityTerms =
    cogsTerms ||
    grossProfitTerms ||
    /\bprofit(ability)?\b|\bmargin(s)?\b|\bnet income\b|\brevenue\b.*\b(expenses?|cogs)\b|\bprofit per\b/.test(m);

  const payrollTerms = /\bpayroll|paychecks?|wages?|gross pay|net pay|pay run|direct deposit|pay stub|employees?\b/.test(m);

  if (payrollTerms) return { topic: 'payroll', intent: 'generic_payroll' };

  if (mentionsCustomer && (grossProfitTerms || cogsTerms)) {
    // Customer + GP/COGS → profitability view per customer
    return { topic: 'financial', intent: 'customer_profitability' };
  }

  if (mentionsCustomer && arTerms) {
    return { topic: 'ar', intent: incomingTerms ? 'incoming_cash' : 'aging_overview' };
  }

  if (arTerms) {
    return { topic: 'ar', intent: incomingTerms ? 'incoming_cash' : 'generic_ar' };
  }

  if (grossProfitTerms || cogsTerms) {
    return { topic: 'financial', intent: 'gross_profit' };
  }

  if (profitabilityTerms) {
    return { topic: 'financial', intent: 'generic_financial' };
  }

  return { topic: 'financial', intent: 'generic_financial' };
}

/* -------------------------- Tool picking -------------------------- */

const fnKeys = Object.keys(availableFunctions || {});
function pickFunctionName(candidates: string[]): string | null {
  // exact
  for (const c of candidates) if (fnKeys.includes(c)) return c;
  // case-insensitive
  for (const c of candidates) {
    const hit = fnKeys.find(k => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  // word boundary
  for (const c of candidates) {
    const rx = new RegExp(`\\b${c}\\b`, 'i');
    const hit = fnKeys.find(k => rx.test(k));
    if (hit) return hit;
  }
  // substring
  for (const c of candidates) {
    const hit = fnKeys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

function buildTools(topic: Topic, intent: Intent) {
  const tools: any[] = [];

  // Payroll → payments
  if (topic === 'payroll') {
    const name = pickFunctionName(['getPaymentsSummary', 'paymentsSummary', 'listPayments']);
    if (name) {
      tools.push({
        type: 'function',
        function: {
          name,
          description: 'Query payroll payments (Supabase: payments).',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              employee: { type: 'string' },
              department: { type: 'string' },
              minAmount: { type: 'number' },
              maxAmount: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
      });
    }
  }

  // A/R
  if (topic === 'ar') {
    const agingDetail = pickFunctionName([
      'getARAgingDetail',
      'getARAgingAnalysis',
      'getAROpenInvoices',
      'getARInvoices',
    ]);
    if (agingDetail) {
      tools.push({
        type: 'function',
        function: {
          name: agingDetail,
          description:
            intent === 'incoming_cash'
              ? 'Open invoices from ar_aging_detail; filter by due date window (e.g., this week).'
              : 'A/R aging or open invoices (ar_aging_detail).',
          parameters: {
            type: 'object',
            properties: {
              customer: { type: 'string', description: 'Customer name or ID' },
              startDate: { type: 'string', description: 'Invoice due start (YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'Invoice due end (YYYY-MM-DD)' },
              dueOnly: { type: 'boolean', description: 'Only invoices due in window' },
              status: { type: 'string', description: 'open|paid|overdue' },
              minPastDueDays: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
      });
    }

    const arHistory = pickFunctionName(['getARPaymentHistory', 'getARHistory', 'getReceiptsHistory']);
    if (arHistory) {
      tools.push({
        type: 'function',
        function: {
          name: arHistory,
          description: 'A/R payment / collection history over a timeframe.',
          parameters: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              customer: { type: 'string' },
              timeframe: { type: 'string', enum: ['this_week', 'last_week', '3_months', '6_months', '12_months'] },
            },
            additionalProperties: false,
          },
        },
      });
    }
  }

  // Financial / GL
  if (topic === 'financial') {
    const custProfit = pickFunctionName(['getCustomerProfitability', 'getCustomerNetIncome']);
    const finSummary = pickFunctionName(['getFinancialSummary', 'getGLSummary', 'getJournalSummary']);
    const acctTrends = pickFunctionName(['getAccountTrends', 'getGLTrends', 'getMonthlyTrend']);

    if (intent === 'customer_profitability' && (custProfit || finSummary)) {
      const name = custProfit || finSummary!;
      tools.push({
        type: 'function',
        function: {
          name,
          description:
            'Customer profitability using journal_entry_lines (Revenue, COGS/Expenses → Net or GP). Supports customer filter.',
          parameters: {
            type: 'object',
            properties: {
              customer: { type: 'string', description: 'Customer name or ID' },
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              includeCOGS: { type: 'boolean' },
              includeOverhead: { type: 'boolean' },
              groupByMonth: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
      });
    } else if (finSummary) {
      // Use Financial Summary for GP/COGS/GP% and generic financials
      tools.push({
        type: 'function',
        function: {
          name: finSummary,
          description:
            'Financial summary from journal_entry_lines. Return totals and top accounts; can filter by account substring (e.g., "Revenue", "COGS") and entity/customer. Use to compute Revenue, COGS, Gross Profit (GP), and GP%.',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              accountLike: { type: 'string' },
              entity: { type: 'string', description: 'Customer/Entity filter' },
              groupByMonth: { type: 'boolean' },
              metricsOnly: { type: 'boolean' },
              detailLimit: { type: 'number' },
              limit: { type: 'number' },
              offset: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
      });
      if (acctTrends) {
        tools.push({
          type: 'function',
          function: {
            name: acctTrends,
            description: 'Monthly net trend from journal_entry_lines, optionally filtered by account/entity.',
            parameters: {
              type: 'object',
              properties: {
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                accountLike: { type: 'string' },
                entity: { type: 'string' },
                limit: { type: 'number' },
                offset: { type: 'number' },
              },
              additionalProperties: false,
            },
          },
        });
      }
    }
  }

  return tools;
}

/* -------------------------- Main entry -------------------------- */

export const createCFOCompletion = async (message: string, context: any = {}) => {
  try {
    const { topic, intent } = classify(message);
    const tools = buildTools(topic, intent);

    console.log('🚀 createCFOCompletion:', {
      topic,
      intent,
      messagePreview: (message || '').slice(0, 160),
      toolNames: tools.map((t: any) => t.function.name),
    });

    const today = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: NY_TZ,
    });

    const messages: any[] = [
      {
        role: 'system',
        content: `You are the AI CFO for the "I AM CFO" platform.

Current date: ${today}.

ROUTING
- Payroll → payments
- A/R → ar_aging_detail
- Financials & customer profitability → journal_entry_lines
- If the user says "what's coming in this week", interpret as expected receipts from open invoices due THIS calendar week.

EXECUTION
- ALWAYS use tools when available. Do not invent numbers.
- If the user didn't provide a period:
  - A/R "incoming cash": use Monday–Sunday of the current week (America/New_York).
  - Financial: default to YTD (America/New_York).
- If only a customer name is given, scope to that customer; otherwise return company-wide and highlight top contributors.
- Present clear KPIs and bullets. End with "More than just a balance sheet" when analysis is provided.

GROSS PROFIT LOGIC
- Revenue: sum of credits in Income/Revenue/Sales accounts.
- COGS: sum of debits in accounts containing "COGS" or "Cost of Goods" (do NOT include overhead unless explicitly asked).
- Gross Profit (GP) = Revenue − COGS.
- GP% = (GP / Revenue) × 100.
- If the user asks for GP/GP% or COGS, prefer the financial summary tool and compute GP/GP% from its output. If needed, filter with accountLike "Revenue" and "COGS".`,
      },
      { role: 'user', content: message },
    ];

    // ---- First call: let model choose tool + args
    const firstReq: any = {
      model: MODEL_PLANNER,
      messages,
      temperature: 0.2,
      max_tokens: 500,
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
    };

    const completion = await createChatCompletion(firstReq);
    let aiMsg = completion.choices?.[0]?.message ?? {};
    console.log('✅ First call finish_reason:', completion.choices?.[0]?.finish_reason);

    if (!aiMsg.tool_calls || aiMsg.tool_calls.length === 0) {
      console.log('ℹ️ No tool calls; returning text.');
      return aiMsg.content ?? 'No response.';
    }

    // ---- Execute tool calls
    messages.push(aiMsg);

    const scrubArgs = (fnName: string, rawArgs: any) => {
      const allow = new Set<string>();
      if (/payments/i.test(fnName)) {
        ['startDate','endDate','employee','department','minAmount','maxAmount','limit','offset'].forEach(k => allow.add(k));
      } else if (/ar/i.test(fnName)) {
        ['customer','customerId','startDate','endDate','dueOnly','status','minPastDueDays','limit','offset','timeframe'].forEach(k => allow.add(k));
      } else { // financial
        ['customer','startDate','endDate','includeCOGS','includeOverhead','groupByMonth','accountLike','entity','metricsOnly','detailLimit','limit','offset'].forEach(k => allow.add(k));
      }
      const out: any = {};
      if (rawArgs && typeof rawArgs === 'object') {
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

      // Normalize dates for AR "incoming cash" → this week Mon–Sun (NY)
      if (topic === 'ar' && intent === 'incoming_cash') {
        const { start, end } = currentWeekMonSun(NY_TZ);
        rawArgs.startDate = rawArgs.startDate || start;
        rawArgs.endDate = rawArgs.endDate || end;
        if (typeof rawArgs.dueOnly === 'undefined') rawArgs.dueOnly = true;
        if (!rawArgs.status) rawArgs.status = 'open';
        if (typeof rawArgs.limit === 'undefined') rawArgs.limit = 200;
      }

      // Financial defaults → YTD. Prefer aggregate-only to keep payload small.
      if (topic === 'financial') {
        const { start, end } = ytdRange(NY_TZ);
        rawArgs.startDate = rawArgs.startDate || start;
        rawArgs.endDate = rawArgs.endDate || end;
        if (typeof rawArgs.groupByMonth === 'undefined') rawArgs.groupByMonth = true;
        if (typeof rawArgs.metricsOnly === 'undefined') rawArgs.metricsOnly = true;
        if (typeof rawArgs.detailLimit === 'undefined') rawArgs.detailLimit = 0;

        // If intent is gross_profit, give the model a nudge: it can set accountLike itself, but
        // providing a sane default often helps (it will still override if it wants).
        if (intent === 'gross_profit' && !rawArgs.accountLike) {
          rawArgs.accountLike = 'Revenue'; // the tool can be called multiple times (e.g., COGS/Revenue) by the model
        }
      }

      const args = scrubArgs(String(functionName), rawArgs);

      let result: any;
      try {
        const fn = availableFunctions[functionName];
        if (typeof fn !== 'function') {
          throw new Error(`Function ${String(functionName)} not found in availableFunctions`);
        }
        console.log(`🔧 Calling ${String(functionName)} with`, redactForLog(JSON.stringify(args || {}), 600));
        result = await fn(args);
      } catch (err: any) {
        console.error(`❌ Tool ${String(functionName)} failed:`, err?.message);
        result = { success: false, error: err?.message || 'Tool error' };
      }

      // IMPORTANT: tool message must NOT include name; compact to avoid huge context
      messages.push({
        role: 'tool',
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
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
    });
    const finalMsg = second.choices?.[0]?.message ?? {};
    console.log('✅ Second call finish_reason:', second.choices?.[0]?.finish_reason);

    return finalMsg.content ?? 'Done.';

  } catch (error: any) {
    console.error('❌ OpenAI Error:', { name: error?.name, message: error?.message, stack: error?.stack });

    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('insufficient_quota')) {
      return "I'm temporarily unable to analyze your data due to API limits. Please try again in a moment.";
    } else if (msg.includes('context_length_exceeded')) {
      return 'Your query involves too much data. Please try asking about a specific customer or shorter time period.';
    } else if (msg.includes('api key')) {
      return "There's an issue with the API configuration. Please contact support.";
    } else if (msg.includes('abort')) {
      return 'The request timed out. Please try again or narrow the query.';
    } else {
      return "I encountered an issue analyzing your financial data. Please try rephrasing your question or contact support if this persists.";
    }
  }
};
