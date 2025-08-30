export const runtime = 'edge'

const toolSchemas = [
  {
    type: 'function',
    function: {
      name: 'getPaymentsSummary',
      description:
        'Query payroll payments (table: payments). Columns: id, first_name, last_name, department, payment_method, date, total_amount.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date', description: 'filter date >= startDate' },
          endDate: { type: 'string', format: 'date', description: 'filter date <= endDate' },
          employee: { type: 'string', description: 'match first or last name (case-insensitive)' },
          department: { type: 'string', description: 'exact department match' },
          minAmount: { type: 'number', description: 'filter total_amount >= minAmount' },
          maxAmount: { type: 'number', description: 'filter total_amount <= maxAmount' },
          limit: { type: 'integer', description: 'max rows (default 1000)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getARAgingDetail',
      description:
        'Lookup A/R aging detail (table: ar_aging_detail). Columns: id, customer_id, invoice_id, invoice_date, due_date, amount_due, status, aging_bucket.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'customer_id filter' },
          startDate: { type: 'string', format: 'date', description: 'invoice_date >= startDate' },
          endDate: { type: 'string', format: 'date', description: 'invoice_date <= endDate' },
          limit: { type: 'integer', description: 'max rows (default 500)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getFinancialData',
      description:
        'Query journal_entry_lines for overall financials and profitability. Columns: id, date, account, customer_id, memo, debit, credit, amount, category.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'customer_id filter' },
          startDate: { type: 'string', format: 'date', description: 'date >= startDate' },
          endDate: { type: 'string', format: 'date', description: 'date <= endDate' },
          limit: { type: 'integer', description: 'max rows (default 200)' },
        },
      },
    },
  },
]

export async function POST() {
  if (!process.env.OPENAI_API_KEY) {
    return new Response('Missing OPENAI_API_KEY', { status: 500 })
  }

  const body = {
    model: 'gpt-4o-realtime-preview-2024-12-17',
    voice: 'verse',
    instructions:
      'You are the I AM CFO voice assistant. Answer any question about data from payments, ar_aging_detail, or journal_entry_lines using the corresponding tool. Payroll questions use getPaymentsSummary; accounts receivable and cash timing use getARAgingDetail; overall financials and customer profitability use getFinancialData. Always call a tool when a user asks about these tables. Keep answers short and crisp. For long answers end with "More than just a balance sheet." If silent for 30 seconds, say "I\u2019ll be here when you need me" and end the session.',
    tools: toolSchemas,
  }

  const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    return new Response(text, { status: res.status })
  }

  const data = await res.json()
  return Response.json(data)
}
