import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

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
    t === "cost of goods sold" ||
    t.includes("expense")
  )
}

interface Entry {
  account_type: string | null
  debit: number | string | null
  credit: number | string | null
  class?: string | null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const months = Number.parseInt(url.searchParams.get("months") || "12", 10)
  const endMonth = Number.parseInt(url.searchParams.get("endMonth") || "1", 10)
  const endYear = Number.parseInt(url.searchParams.get("endYear") || "2024", 10)
  const classParam = url.searchParams.get("classId")
  const classIds = classParam
    ? classParam
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : []

  const monthlyData: {
    monthName: string
    year: number
    totalRevenue: number
    totalExpenses: number
    netProfit: number
  }[] = []

  for (let i = months - 1; i >= 0; i--) {
    const monthIndex = (endMonth - 1 - i + 12) % 12
    const year = endMonth - 1 - i < 0 ? endYear - 1 : endYear
    const startDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    let lastDay = daysInMonth[monthIndex]
    if (
      monthIndex === 1 &&
      ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
    ) {
      lastDay = 29
    }
    const endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
      lastDay,
    ).padStart(2, "0")}`

    let query = supabase
      .from("financial_transactions")
      .select("account_type,debit,credit,class")
      .gte("date", startDate)
      .lte("date", endDate)

    if (classIds.length > 0) {
      query = query.in("class", classIds)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let totalRevenue = 0
    let totalExpenses = 0

    ;(data || []).forEach((tx: Entry) => {
      const debit = Number(tx.debit) || 0
      const credit = Number(tx.credit) || 0
      if (isIncomeAccount(tx.account_type)) {
        totalRevenue += credit - debit
      } else if (isExpenseAccount(tx.account_type)) {
        totalExpenses += debit - credit
      }
    })

    monthlyData.push({
      monthName: MONTH_NAMES[monthIndex],
      year,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
    })
  }

  return NextResponse.json({ monthlyData })
}
