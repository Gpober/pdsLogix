"use client"

import { useEffect, useState } from "react"
import { Toaster, toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"

interface Row {
  source: "department" | "location"
  sourceId: string
  sourceName?: string
  mappedCustomer: string
}

export default function PayrollMappingPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)

  const loadRows = async () => {
    const res = await fetch("/api/integrations/gusto/mapping")
    const json = await res.json()
    setRows(json.items || [])
  }

  useEffect(() => {
    loadRows()
  }, [])

  const updateRow = (index: number, field: keyof Row, value: any) => {
    setRows((prev) => {
      const copy = [...prev]
      ;(copy[index] as any)[field] = value
      return copy
    })
  }

  const addRow = () => setRows([...rows, { source: "department", sourceId: "", sourceName: "", mappedCustomer: "" }])
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch("/api/integrations/gusto/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      if (json.ok) {
        toast.success("Saved")
      } else {
        toast.error(json.error || "Failed to save")
      }
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Toaster position="top-right" />
      <h1 className="text-2xl font-semibold">Payroll Mapping</h1>
      <div className="overflow-x-auto rounded-2xl border bg-white shadow">
        <table className="w-full min-w-max divide-y">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left text-sm font-medium">Source</th>
              <th className="px-4 py-2 text-left text-sm font-medium">Source ID</th>
              <th className="px-4 py-2 text-left text-sm font-medium">Source Name</th>
              <th className="px-4 py-2 text-left text-sm font-medium">Mapped Customer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="px-4 py-2">
                  <Select
                    value={row.source}
                    onValueChange={(v) => updateRow(i, "source", v as Row["source"])}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="department">Department</SelectItem>
                      <SelectItem value="location">Location</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={row.sourceId}
                    onChange={(e) => updateRow(i, "sourceId", e.target.value)}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={row.sourceName || ""}
                    onChange={(e) => updateRow(i, "sourceName", e.target.value)}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={row.mappedCustomer}
                    onChange={(e) => updateRow(i, "mappedCustomer", e.target.value)}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="outline" onClick={() => removeRow(i)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={addRow}>
          Add Row
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <span className="mr-2">Saving...</span>}
          Save
        </Button>
      </div>
    </div>
  )
}
