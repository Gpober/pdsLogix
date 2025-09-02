"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { Loader2 } from "lucide-react"
import { toast, Toaster } from "sonner"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

dayjs.extend(relativeTime)

interface IntegrationStatus {
  type: "gusto" | "accounting"
  status: "connected" | "not_connected" | "action_required"
  accountName?: string | null
  lastSyncAt?: string | null
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<IntegrationStatus[]>([])
  const [syncLoading, setSyncLoading] = useState(false)
  const [disconnectLoading, setDisconnectLoading] = useState(false)
  const [connectLoading, setConnectLoading] = useState(false)

  const fetchStatuses = async () => {
    const res = await fetch("/api/integrations")
    const json = await res.json()
    setItems(json.items || [])
  }

  useEffect(() => {
    fetchStatuses()
  }, [])

  const accounting = items.find((i) => i.type === "accounting")
  const gusto =
    items.find((i) => i.type === "gusto") || ({ type: "gusto", status: "not_connected" } as IntegrationStatus)

  const formatLastSync = (ts?: string | null) => {
    if (!ts) return null
    return (
      <span title={dayjs(ts).format("YYYY-MM-DD HH:mm:ss")}>
        Last sync {dayjs(ts).fromNow()}
      </span>
    )
  }

  const handleConnect = async () => {
    try {
      setConnectLoading(true)
      const res = await fetch("/api/integrations/gusto/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "oauth" }),
      })
      const json = await res.json()
      if (json.redirectUrl) {
        window.location.href = json.redirectUrl
      } else {
        toast.error("Failed to initiate OAuth")
      }
    } catch {
      toast.error("Failed to initiate OAuth")
    } finally {
      setConnectLoading(false)
    }
  }

  const handleSync = async () => {
    try {
      setSyncLoading(true)
      const res = await fetch("/api/integrations/gusto/sync", { method: "POST" })
      const json = await res.json()
      if (json.ok) {
        toast.success("Sync started")
        fetchStatuses()
      } else {
        toast.error(json.error || "Sync failed")
      }
    } catch {
      toast.error("Sync failed")
    } finally {
      setSyncLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setDisconnectLoading(true)
      const res = await fetch("/api/integrations/gusto", { method: "DELETE" })
      const json = await res.json()
      if (json.ok) {
        toast.success("Disconnected")
        fetchStatuses()
      } else {
        toast.error(json.error || "Failed to disconnect")
      }
    } catch {
      toast.error("Failed to disconnect")
    } finally {
      setDisconnectLoading(false)
    }
  }

  return (
    <div className="space-y-8 p-6">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow">
        <div className="font-medium">Accounting Data</div>
        <div className="text-sm text-gray-600">
          {accounting?.status === "connected" ? "Connected" : "Not connected"}
          {accounting?.lastSyncAt && (
            <span className="ml-2">{formatLastSync(accounting.lastSyncAt)}</span>
          )}
        </div>
      </div>
      <Card className="rounded-2xl shadow">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Gusto</CardTitle>
          <Badge variant={gusto.status === "connected" ? "default" : gusto.status === "action_required" ? "outline" : "secondary"}>
            {gusto.status === "connected"
              ? "Connected"
              : gusto.status === "action_required"
              ? "Action required"
              : "Not connected"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {gusto.accountName && <div className="text-sm">{gusto.accountName}</div>}
          {gusto.lastSyncAt && (
            <div className="text-sm text-gray-600">{formatLastSync(gusto.lastSyncAt)}</div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {gusto.status !== "connected" ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button disabled={connectLoading}>
                  {connectLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect Gusto</DialogTitle>
                  <DialogDescription>
                    You'll be redirected to Gusto to authorize access.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button onClick={handleConnect} disabled={connectLoading}>
                    {connectLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <>
              <Button onClick={handleSync} disabled={syncLoading}>
                {syncLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Run Sync
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/settings/integrations/gusto/mapping">
                  Payroll Mapping
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnectLoading}
              >
                {disconnectLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Disconnect
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
