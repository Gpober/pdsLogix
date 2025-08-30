import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

const isIncomeAccount = (type: string | null) => {
  const t = type?.toLowerCase() || ""
  return (
    t === "income" ||
    t === "other income" ||
    t.includes("income") ||
    t.includes("revenue")
  )
}

const isExpenseAccount = (type: string | null) => {
  const t = type?.toLowerCase() || ""
  return (
    t === "expense" ||
    t === "other expense" ||
    t.includes("expense")
  )
}

const isCogsAccount = (type: string | null) => {
  const t = type?.toLowerCase() || ""
  return t === "cost of goods sold" || t.includes("cost of goods sold")
}

interface Entry {
  customer: string | null
  account_type: string | null
  debit: number | string | null
  credit: number | string | null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const includeProperties = url.searchParams.get("includeProperties") === "true"

  if (!includeProperties) {
    return NextResponse.json({ propertyBreakdown: [] })
  }

  const start = url.searchParams.get("start")
  const end = url.searchParams.get("end")

  let startDate: string
  let endDate: string

  if (start && end) {
    startDate = start
    endDate = end
  } else {
    const month = Number.parseInt(url.searchParams.get("month") || "1", 10)
    const year = Number.parseInt(url.searchParams.get("year") || "2024", 10)
    startDate = `${year}-${String(month).padStart(2, "0")}-01`
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    let lastDay = daysInMonth[month - 1]
    if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
      lastDay = 29
    }
    endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  }

  const { data, error } = await supabase
    .from("journal_entry_lines")
    .select("customer,account_type,debit,credit")
    .gte("date", startDate)
    .lte("date", endDate)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const map: Record<string, {
    name: string
    revenue: number
    grossProfit: number
    operatingExpenses: number
    netIncome: number
    cogs: number
  }> = {}

  ;(data || []).forEach((tx: Entry) => {
    // Group transactions without a customer under "Unassigned"
    const customer = tx.customer || "Unassigned"
    if (!map[customer]) {
      map[customer] = {
        name: customer,
        revenue: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        netIncome: 0,
        cogs: 0,
      }
    }

    const debit = Number(tx.debit) || 0
    const credit = Number(tx.credit) || 0

    if (isIncomeAccount(tx.account_type)) {
      map[customer].revenue += credit - debit
    } else if (isCogsAccount(tx.account_type)) {
      map[customer].cogs += debit - credit
    } else if (isExpenseAccount(tx.account_type)) {
      map[customer].operatingExpenses += debit - credit
    }
  })

  const propertyBreakdown = Object.values(map)
    .map((p) => {
      p.grossProfit = p.revenue - p.cogs
      p.netIncome = p.grossProfit - p.operatingExpenses
      return p
    })
    // Only return properties with financial activity
    .filter(
      (p) =>
        p.revenue !== 0 ||
        p.operatingExpenses !== 0 ||
        p.cogs !== 0 ||
        p.netIncome !== 0,
    )

  return NextResponse.json({ propertyBreakdown })
}
