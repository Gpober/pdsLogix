// server/ai/createCFOCompletion.ts
// Server-only. Do NOT import into "use client" files.

import { availableFunctions } from '../server/functions';

async function createChatCompletion(body: Record<string, unknown>) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('❌ OpenAI error', {
      status: res.status,
      statusText: res.statusText,
      responseText: text.slice(0, 2000),
      requestPreview: JSON.stringify(body).slice(0, 2000),
    });
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }
  try { return JSON.parse(text); }
  catch (e: any) {
    console.error('❌ Failed to parse OpenAI JSON:', e?.message, text.slice(0, 500));
    throw new Error('Failed to parse OpenAI response JSON');
  }
}

// ---------- Intent classification ----------
type Topic = 'payroll' | 'ar' | 'financial';
type Intent =
  | 'customer_profitability'
  | 'incoming_cash'
  | 'aging_overview'
  | 'generic_financial'
  | 'generic_payroll'
  | 'generic_ar';

function classify(message: string): { topic: Topic; intent: Intent } {
  const m = (message || '').toLowerCase();

  const mentionsCustomer = /\bcustomers?\b|\btenant(s)?\b|\bclient(s)?\b/.test(m);

  const arTerms = /\b(ar|a\/r|accounts receivable|aging|aged|past due|overdue|collections?|invoice(s)?|receivable(s)?)\b/.test(m);
  const incomingTerms = /\bthis week|next week|today|tomorrow|in the next (?:\d+ )?day|coming in|expected cash|cash forecast|receipts?\b/.test(m);

  const profitabilityTerms = /\bprofit(ability)?\b|\bmargin(s)?\b|\bnet income\b|\bgp\b|\bgross margin\b|\bcontribution\b|\brevenue\b.*\b(expenses?|cogs)\b|\bcogs\b|\bprofit per\b/.test(m);

  const payrollTerms = /\bpayroll|paycheck|wages?|gross pay|net pay|pay run|direct deposit|pay stub|employees?\b/.test(m);

  // Payroll has priority if clearly present
  if (payrollTerms) return { topic: 'payroll', intent: 'generic_payroll' };

  // Customer rules you requested:
  // - Customer + profitability → financial (journal_entry_lines)
  if (mentionsCustomer && profitabilityTerms) {
    return { topic: 'financial', intent: 'customer_profitability' };
  }

  // - Customer + AR/invoice/expected cash → AR (ar_aging_detail)
  if (mentionsCustomer && arTerms) {
    if (incomingTerms) return { topic: 'ar', intent: 'incoming_cash' };
    return { topic: 'ar', intent: 'aging_overview' };
  }

  // General AR
  if (arTerms) {
    if (incomingTerms) return { topic: 'ar', intent: 'incoming_cash' };
    return { topic: 'ar', intent: 'generic_ar' };
  }

  // General profitability / financial
  if (profitabilityTerms) {
    return { topic: 'financial', intent: 'generic_financial' };
  }

  // Default to financial/GL
  return { topic: 'financial', intent: 'generic_financial' };
}

// ---------- Tool name resolver (avoids name mismatches) ----------
const fnKeys = Object.keys(availableFunctions || {});
function pickFunctionName(candidates: string[]): string | null {
  // exact match first
  for (const c of candidates) if (fnKeys.includes(c)) return c;
  // case-insensitive exact
  for (const c of candidates) {
    const hit = fnKeys.find(k => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  // substring fallback
  for (const c of candidates) {
    const hit = fnKeys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

// ---------- Build tools for each topic/intent ----------
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
          description: 'Query payroll payments (Supabase: payments)',
          parameters: {
            type: 'object',
            properties: {
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              employee: { type: 'string' },
              department: { type: 'string' },
              minAmount: { type: 'number' },
              maxAmount: { type: 'number' },
            },
          },
        },
      });
    }
  }

  // A/R → ar_aging_detail
  if (topic === 'ar') {
    const agingDetail = pickFunctionName([
      'getARAgingDetail',
      'getARAgingAnalysis',
      'getAROpenInvoices',
      'getARInvoices'
    ]);
    if (agingDetail) {
      tools.push({
        type: 'function',
        function: {
          name: agingDetail,
          description:
            intent === 'incoming_cash'
              ? 'Fetch open invoices from ar_aging_detail; can filter by due date window (e.g., this week).'
              : 'A/R by customer (aging/open invoices) from ar_aging_detail.',
          parameters: {
            type: 'object',
            properties: {
              customer: { type: 'string', description: 'Customer name or ID' },
              startDate: { type: 'string', description: 'Invoice due/issue start date (YYYY-MM-DD)' },
              endDate: { type: 'string', description: 'Invoice due/issue end date (YYYY-MM-DD)' },
              dueOnly: { type: 'boolean', description: 'Only invoices due in window' },
              status: { type: 'string', description: 'open|paid|overdue' },
              minPastDueDays: { type: 'number' },
            },
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
          description: 'A/R payment/collection history windowed by timeframe.',
          parameters: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              timeframe: { type: 'string', enum: ['this_week', 'last_week', '3_months', '6_months', '12_months'] },
            },
          },
        },
      });
    }
  }

  // Financial/GL → journal_entry_lines
  if (topic === 'financial') {
    // Customer profitability: prefer explicit customer profitability function if you have one, else fall back to summary
    const custProfit = pickFunctionName(['getCustomerProfitability', 'getCustomerNetIncome']);
    const finSummary = pickFunctionName(['getFinancialSummary', 'getGLSummary', 'getJournalSummary']);

    if (intent === 'customer_profitability' && (custProfit || finSummary)) {
      const name = custProfit || finSummary!;
      tools.push({
        type: 'function',
        function: {
          name,
          description:
            'Customer profitability using journal_entry_lines (revenue, COGS/expenses, net income), optionally filtered by customer.',
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
          },
        },
      });
    } else {
      if (finSummary) {
        tools.push({
          type: 'function',
          function: {
            name: finSummary,
            description:
              'Debits, credits, net, and top accounts from journal_entry_lines. Can filter by account substring and entity/customer.',
            parameters: {
              type: 'object',
              properties: {
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                accountLike: { type: 'string' },
                entity: { type: 'string', description: 'Customer/Entity filter' },
                groupByMonth: { type: 'boolean' },
              },
            },
          },
        });
      }
      const acctTrends = pickFunctionName(['getAccountTrends', 'getGLTrends', 'getMonthlyTrend']);
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
              },
            },
          },
        });
      }
    }
  }

  return tools;
}

// ---------- Main entry ----------
export const createCFOCompletion = async (message: string, context: any = {}) => {
  try {
    const { topic, intent } = classify(message);
    const tools = buildTools(topic, intent);

    console.log('🚀 createCFOCompletion:', {
      topic,
      intent,
      messagePreview: message.slice(0, 160),
      toolNames: tools.map((t: any) => t.function.name),
    });

    const messages: any[] = [
      {
        role: 'system',
        content:
`You are the AI CFO for the "I AM CFO" platform.

ROUTING:
- Payroll → payments
- A/R → ar_aging_detail
- Financials & customer profitability → journal_entry_lines
- If the user says "what's coming in this week", interpret as expected receipts from open invoices due THIS calendar week.

EXECUTION:
- ALWAYS use tools when available. Do not invent numbers.
- If the user didn't provide a period:
  - A/R "incoming cash": use Monday–Sunday of the current week (America/New_York).
  - Financial: default to YTD.
- If only a customer name is given, scope to that customer; otherwise return company-wide and highlight top contributors.
- Present clear KPIs and bullets. End with "More than just a balance sheet" when analysis is provided.`,
      },
      { role: 'user', content: message },
    ];

    // ---- First call: let model choose tool + args
    const firstReq: any = {
      model: 'gpt-4o',
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
    for (const tc of aiMsg.tool_calls) {
      const functionName = tc.function?.name as keyof typeof availableFunctions;
      let args: any = {};
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (e: any) {
        console.warn(`⚠️ Could not parse args for ${String(functionName)}:`, e?.message);
      }

      // If user asked "this week" for AR, normalize dates here if tool didn't set them
      if (topic === 'ar' && intent === 'incoming_cash') {
        try {
          const now = new Date();
          const day = now.getDay(); // 0 Sun .. 6 Sat
          // Week: Monday (1) to Sunday (0 => 7)
          const diffToMonday = (day + 6) % 7; // Mon=0 ... Sun=6
          const monday = new Date(now); monday.setDate(now.getDate() - diffToMonday);
          const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);

          const toISO = (d: Date) => d.toISOString().slice(0, 10);
          args.startDate = args.startDate || toISO(monday);
          args.endDate = args.endDate || toISO(sunday);
          if (typeof args.dueOnly === 'undefined') args.dueOnly = true;
          if (!args.status) args.status = 'open';
        } catch {}
      }

      let result: any;
      try {
        const fn = availableFunctions[functionName];
        if (typeof fn !== 'function') {
          throw new Error(`Function ${String(functionName)} not found in availableFunctions`);
        }
        console.log(`🔧 Calling ${String(functionName)} with`, args);
        result = await fn(args);
      } catch (err: any) {
        console.error(`❌ Tool ${String(functionName)} failed:`, err?.message);
        result = { success: false, error: err?.message || 'Tool error' };
      }

      // IMPORTANT: tool message must NOT include name
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    // ---- Second call: compose final answer (keep tools for rare chaining)
    const second = await createChatCompletion({
      model: 'gpt-4o',
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

    if ((error?.message || '').includes('insufficient_quota')) {
      return "I'm temporarily unable to analyze your data due to API limits. Please try again in a moment.";
    } else if ((error?.message || '').includes('context_length_exceeded')) {
      return 'Your query involves too much data. Please try asking about a specific customer or shorter time period.';
    } else if ((error?.message || '').toLowerCase().includes('api key')) {
      return "There's an issue with the API configuration. Please contact support.";
    } else {
      return "I encountered an issue analyzing your financial data. Please try rephrasing your question or contact support if this persists.";
    }
  }
};
