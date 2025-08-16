"use client"

import { useState, useEffect } from "react"
import Papa from "papaparse"
import { supabase } from "@/lib/supabaseClient"

interface ManualBalance {
  account: string
  accountType: string
  balance: string
}

// Map common account labels from CSVs to standardized account names
const accountMappings: Record<string, string> = {
  cash: "Cash",
  checking: "Checking",
  "checking account": "Checking",
  savings: "Savings",
  "savings account": "Savings",
  bank: "Bank",
  "accounts receivable": "Accounts receivable (A/R)",
  "a/r": "Accounts receivable (A/R)",
  "ar": "Accounts receivable (A/R)",
  "receivables": "Accounts receivable (A/R)",
  "accounts payable": "Accounts payable (A/P)",
  "a/p": "Accounts payable (A/P)",
  "ap": "Accounts payable (A/P)",
  "payables": "Accounts payable (A/P)",
  inventory: "Inventory",
}

export default function SettingsPage() {
  const [date, setDate] = useState("")
  const [balances, setBalances] = useState<ManualBalance[]>([
    { account: "", accountType: "", balance: "" },
  ])
  const [availableAccountTypes, setAvailableAccountTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Load available account types from the database
  useEffect(() => {
    const loadAccountTypes = async () => {
      try {
        const { data, error } = await supabase
          .from("balance_sheet_accounts")
          .select("account_type")
          .not("account_type", "is", null)

        if (error) throw error

        // Get unique account types and sort them
        const uniqueTypes = [...new Set(data?.map(row => row.account_type).filter(Boolean))]
        setAvailableAccountTypes(uniqueTypes.sort())
      } catch (err) {
        console.error("Error loading account types:", err)
        // Fallback to standardized types with exact A/R and A/P labels
        setAvailableAccountTypes([
          "Bank",
          "Accounts receivable (A/R)", 
          "Other Current Assets",
          "Fixed Assets",
          "Accounts payable (A/P)",
          "Credit Card",
          "Other Current Liabilities",
          "Long Term Liabilities",
          "Equity"
        ])
      } finally {
        setLoading(false)
      }
    }

    loadAccountTypes()
  }, [])

  const applyAccountTypes = async (entries: ManualBalance[]) => {
    const accountNames = entries.map((e) => e.account)
    if (!accountNames.length) return entries
    try {
      const { data } = await supabase
        .from("balance_sheet_accounts")
        .select("account, account_type")
        .in("account", accountNames)

      const typeMap: Record<string, string> = {}
      data?.forEach((row: any) => {
        const type = row.account_type
        if (type) {
          typeMap[row.account] = type
        }
      })

      entries.forEach((e) => {
        if (typeMap[e.account]) {
          e.accountType = typeMap[e.account]
        } else if (!e.accountType && availableAccountTypes.length > 0) {
          // Default to first available account type if none set
          e.accountType = availableAccountTypes[0]
        }
      })
    } catch (err) {
      console.error("Error fetching account types", err)
      entries.forEach((e) => {
        if (!e.accountType && availableAccountTypes.length > 0) {
          e.accountType = availableAccountTypes[0]
        }
      })
    }
    return entries
  }

  const handleBalanceChange = (
    index: number,
    field: keyof ManualBalance,
    value: string,
  ) => {
    const updated = [...balances]
    updated[index] = { ...updated[index], [field]: value }
    setBalances(updated)
  }

  const addBalanceRow = () =>
    setBalances([...balances, { account: "", accountType: "", balance: "" }])

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!date) {
      alert("Please select a balance date before uploading.")
      e.target.value = ""
      return
    }
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const parsed = Papa.parse(text, {
      skipEmptyLines: true,
    })

    const entries: ManualBalance[] = []
    parsed.data.forEach((row: any) => {
      const [rawAccount, rawType, rawAmount] = row
      if (!rawAccount || !rawAmount) return

      const cleanAccount = rawAccount.toString().replace(/^"|"$/g, "").trim()
      const mapped =
        accountMappings[cleanAccount.toLowerCase()] || cleanAccount

      let cleanType = rawType?.toString().replace(/^"|"$/g, "").trim() || ""
      
      // Apply account type mapping for standardized A/R and A/P labels
      if (cleanType) {
        const mappedType = accountMappings[cleanType.toLowerCase()]
        if (mappedType) {
          cleanType = mappedType
        }
      }

      const amountStr = rawAmount.toString().replace(/[$,()"\s]/g, "")
      let amt = parseFloat(amountStr)
      if (rawAmount.toString().includes("(") && rawAmount.toString().includes(")"))
        amt *= -1

      if (!isNaN(amt))
        entries.push({ account: mapped, accountType: cleanType, balance: amt.toString() })
    })

    if (!entries.length) alert("No balances found in uploaded CSV.")
    await applyAccountTypes(entries)

    setBalances(
      entries.length
        ? entries
        : [{ account: "", accountType: "", balance: "" }],
    )
  }

  const handleSave = async () => {
    if (!date) {
      alert("Please select a balance date before saving.")
      return
    }
    const filtered = balances.filter((b) => b.account && b.balance)
    if (!filtered.length) {
      alert("Please enter at least one balance before saving.")
      return
    }
    await applyAccountTypes(filtered)
    const data = {
      date,
      balances: filtered.map((b) => ({
        account: b.account,
        balance: Number(b.balance),
        accountType: b.accountType,
      })),
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("beginningBalances", JSON.stringify(data))
      alert("Balances saved")
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading account types...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="date">
          Balance Date
        </label>
        <input
          id="date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded p-2"
        />
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Beginning Balance Sheet Balances</h2>
        <div className="mb-3 text-sm text-gray-600">
          Enter beginning balances for balance sheet accounts only (Assets, Liabilities, Equity)
        </div>
        {balances.map((row, idx) => (
          <div key={idx} className="flex space-x-2 mb-2">
            <input
              className="flex-1 border rounded p-2"
              placeholder="Account Name"
              value={row.account}
              onChange={(e) =>
                handleBalanceChange(idx, "account", e.target.value)
              }
            />
            <select
              className="w-60 border rounded p-2 text-sm"
              value={row.accountType}
              onChange={(e) =>
                handleBalanceChange(idx, "accountType", e.target.value)
              }
            >
              <option value="">Select Account Type</option>
              {availableAccountTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              className="w-32 border rounded p-2"
              placeholder="Balance"
              type="number"
              value={row.balance}
              onChange={(e) =>
                handleBalanceChange(idx, "balance", e.target.value)
              }
            />
          </div>
        ))}
        <button
          onClick={addBalanceRow}
          className="text-sm text-blue-600 hover:text-blue-800"
          type="button"
        >
          + Add account
        </button>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Upload Balance Sheet CSV</h2>
        <div className="mb-2 text-sm text-gray-600">
          CSV format: Account Name, Account Type, Balance Amount
        </div>
        <input
          type="file"
          accept="text/csv,application/vnd.ms-excel"
          onChange={handleFileUpload}
          className="border rounded p-2"
        />
      </div>

      <button
        onClick={handleSave}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        type="button"
      >
        Save Beginning Balances
      </button>

      {availableAccountTypes.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium mb-2">Available Account Types</h3>
          <div className="text-sm text-gray-600">
            <p className="mb-2">The following account types are available in your system:</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableAccountTypes.map((type) => (
                <div key={type} className="bg-white px-2 py-1 rounded border">
                  {type}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
