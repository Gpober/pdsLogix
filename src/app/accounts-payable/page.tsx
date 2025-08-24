"use client"

import React, { useState } from "react"
import { Users, Clock, AlertCircle, CheckCircle, RefreshCw, Search, Calendar, ChevronDown, ChevronRight } from "lucide-react"

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: "#56B6E9",
  secondary: "#3A9BD1",
  tertiary: "#7CC4ED",
  accent: "#2E86C1",
  success: "#27AE60",
  warning: "#F39C12",
  danger: "#E74C3C",
}

export default function AccountsPayablePage() {
  const [selectedPeriod, setSelectedPeriod] = useState("May 2025")
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value)
  }

  const toggleRow = (id) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const getTotalPayments = (payments = []) =>
    payments.reduce((sum, p) => sum + p.amount, 0)

  // Mock A/P data
  const apData = {
    totalAP: 195000,
    current: 145000,
    days30: 35000,
    days60: 10000,
    days90Plus: 5000,
    averageDPO: 32,
  }

  const apDetails = [
    {
      id: 1,
      vendor: "Property Maintenance Co",
      amount: 25000,
      dueDate: "2025-06-15",
      daysUntilDue: 15,
      status: "current",
      category: "Maintenance",
      payments: [
        { invoice: "PM-100", date: "2025-05-01", amount: 10000 },
        { invoice: "PM-101", date: "2025-05-15", amount: 5000 },
      ],
    },
    {
      id: 2,
      vendor: "Utility Services Inc",
      amount: 18000,
      dueDate: "2025-06-10",
      daysUntilDue: 10,
      status: "current",
      category: "Utilities",
      payments: [{ invoice: "US-200", date: "2025-05-05", amount: 8000 }],
    },
    {
      id: 3,
      vendor: "Insurance Partners LLC",
      amount: 22000,
      dueDate: "2025-06-05",
      daysUntilDue: 5,
      status: "current",
      category: "Insurance",
      payments: [],
    },
    {
      id: 4,
      vendor: "Legal Services Group",
      amount: 15000,
      dueDate: "2025-05-25",
      daysUntilDue: -5,
      status: "overdue",
      category: "Professional Services",
      payments: [],
    },
    {
      id: 5,
      vendor: "Cleaning Solutions Pro",
      amount: 12000,
      dueDate: "2025-06-20",
      daysUntilDue: 20,
      status: "current",
      category: "Maintenance",
      payments: [],
    },
    {
      id: 6,
      vendor: "Security Systems Ltd",
      amount: 8000,
      dueDate: "2025-05-20",
      daysUntilDue: -10,
      status: "overdue",
      category: "Security",
      payments: [],
    },
    {
      id: 7,
      vendor: "Landscaping Experts",
      amount: 9500,
      dueDate: "2025-06-12",
      daysUntilDue: 12,
      status: "current",
      category: "Landscaping",
      payments: [],
    },
    {
      id: 8,
      vendor: "Office Supplies Direct",
      amount: 3500,
      dueDate: "2025-06-08",
      daysUntilDue: 8,
      status: "current",
      category: "Office Supplies",
      payments: [],
    },
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case "current":
        return "text-green-600 bg-green-100"
      case "due-soon":
        return "text-yellow-600 bg-yellow-100"
      case "overdue":
        return "text-red-600 bg-red-100"
      default:
        return "text-gray-600 bg-gray-100"
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "current":
        return <CheckCircle className="w-4 h-4" />
      case "due-soon":
        return <Clock className="w-4 h-4" />
      case "overdue":
        return <AlertCircle className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const getStatusFromDays = (daysUntilDue) => {
    if (daysUntilDue < 0) return "overdue"
    if (daysUntilDue <= 7) return "due-soon"
    return "current"
  }

  const filteredAPDetails = apDetails.filter(
    (item) =>
      item.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Accounts Payable</h1>
              <p className="text-sm text-gray-600 mt-1">Manage vendor payments and cash flow obligations</p>
            </div>

            <div className="flex items-center space-x-4">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-500 focus:outline-none focus:ring-2 transition-all"
                style={{ "--tw-ring-color": BRAND_COLORS.secondary + "33" }}
              >
                <option value="May 2025">May 2025</option>
                <option value="April 2025">April 2025</option>
                <option value="March 2025">March 2025</option>
              </select>

              <button
                onClick={() => setIsLoading(!isLoading)}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* A/P Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.primary }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Total A/P</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(apData.totalAP)}</div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Outstanding</div>
                </div>
                <Users className="w-8 h-8" style={{ color: BRAND_COLORS.primary }} />
              </div>
            </div>

            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.success }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Current</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(apData.current)}</div>
                  <div className="text-xs text-green-600 font-medium mt-1">74% of total</div>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.danger }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Overdue</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(apData.days30 + apData.days60 + apData.days90Plus)}
                  </div>
                  <div className="text-xs text-red-600 font-medium mt-1">26% of total</div>
                </div>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div
              className="bg-white p-6 rounded-lg shadow-sm border-l-4"
              style={{ borderLeftColor: BRAND_COLORS.secondary }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-gray-600 text-sm font-medium mb-2">Avg DPO</div>
                  <div className="text-2xl font-bold text-gray-900">{apData.averageDPO}</div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Days</div>
                </div>
                <Calendar className="w-8 h-8" style={{ color: BRAND_COLORS.secondary }} />
              </div>
            </div>
          </div>

          {/* Payment Schedule */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Payment Schedule</h3>
              <div className="text-sm text-gray-600 mt-1">Upcoming payment obligations for {selectedPeriod}</div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 mb-2">{formatCurrency(145000)}</div>
                  <div className="text-sm text-gray-600 mb-1">Current (Not Due)</div>
                  <div className="text-xs text-green-600">On track for payment</div>
                </div>

                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600 mb-2">{formatCurrency(35000)}</div>
                  <div className="text-sm text-gray-600 mb-1">Due Within 7 Days</div>
                  <div className="text-xs text-yellow-600">Requires attention</div>
                </div>

                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600 mb-2">{formatCurrency(15000)}</div>
                  <div className="text-sm text-gray-600 mb-1">Overdue</div>
                  <div className="text-xs text-red-600">Immediate action needed</div>
                </div>
              </div>
            </div>
          </div>

          {/* A/P Details */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Outstanding Payables</h3>
                  <div className="text-sm text-gray-600 mt-1">Detailed breakdown by vendor</div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search vendors..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-blue-500"
                    style={{ "--tw-ring-color": BRAND_COLORS.primary + "33" }}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vendor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payments
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days Until Due
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAPDetails.map((item) => {
                    const actualStatus = getStatusFromDays(item.daysUntilDue)
                    const totalPaid = getTotalPayments(item.payments)
                    const expanded = expandedRows[item.id]
                    return (
                      <React.Fragment key={item.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <button onClick={() => toggleRow(item.id)} className="mr-2">
                                {expanded ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                )}
                              </button>
                              <div className="text-sm font-medium text-gray-900">{item.vendor}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">{item.category}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {totalPaid > 0 ? (
                              <button
                                onClick={() => toggleRow(item.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {formatCurrency(totalPaid)}
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="text-sm text-gray-900">{new Date(item.dueDate).toLocaleDateString()}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div
                              className={`text-sm font-medium ${
                                item.daysUntilDue < 0
                                  ? "text-red-600"
                                  : item.daysUntilDue <= 7
                                    ? "text-yellow-600"
                                    : "text-green-600"
                              }`}
                            >
                              {item.daysUntilDue < 0
                                ? `${Math.abs(item.daysUntilDue)} overdue`
                                : `${item.daysUntilDue} days`}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(actualStatus)}`}
                            >
                              {getStatusIcon(actualStatus)}
                              <span className="ml-1 capitalize">{actualStatus.replace("-", " ")}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                            <button className="text-blue-600 hover:text-blue-900 mr-3">View</button>
                            <button className="text-green-600 hover:text-green-900">Pay</button>
                          </td>
                        </tr>
                        {expanded && item.payments.length > 0 && (
                          <tr className="bg-gray-50">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {item.payments.map((p, idx) => (
                                      <tr key={idx}>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                          {new Date(p.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{p.invoice}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900">
                                          {formatCurrency(p.amount)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
