import { NextResponse } from "next/server"
import { z } from "zod"
import { ensureIntegration, getPayrollMapping, savePayrollMapping } from "@/lib/repos/integrations"

const rowSchema = z.object({
  source: z.union([z.literal("department"), z.literal("location")]),
  sourceId: z.string(),
  sourceName: z.string().optional(),
  mappedCustomer: z.string(),
})

const bodySchema = z.object({ rows: z.array(rowSchema) })

export async function GET() {
  try {
    const id = await ensureIntegration("gusto")
    const items = await getPayrollMapping(id)
    return NextResponse.json({ items })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const id = await ensureIntegration("gusto")
    const body = await req.json()
    const { rows } = bodySchema.parse(body)
    await savePayrollMapping(id, rows)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 })
  }
}
