import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  ActivityIcon,
  CableIcon,
  ChevronDownIcon,
  CloudCogIcon,
  EthernetPortIcon,
  GaugeIcon,
  RadioTowerIcon,
  RouterIcon,
  ShieldAlertIcon,
  WifiIcon,
} from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import { Button } from "#/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import { Separator } from "#/components/ui/separator.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { authBaseURL, authClient } from "#/lib/auth-client.ts"

export const Route = createFileRoute("/")({ component: NetworkStatusPage })

type SiteStatus = {
  id: string
  name: string
  siteMagic: string
  internet: string
  wanUptime?: number | null
  lteFailover: "Ready" | "Unavailable"
  gateway: string
  publicIp: string
  gatewayDevices: number
  clients: number
  wifiAps: number
  switches: number
  internetIssues: number
  criticalAlerts: number
  offlineDevices: number
}

type StatusResponse = {
  updatedAt: string
  sites: SiteStatus[]
}

const metrics = [
  { key: "gatewayDevices", label: "Gateway Devices", icon: RouterIcon },
  { key: "clients", label: "Clients", icon: ActivityIcon },
  { key: "wifiAps", label: "WiFi APs", icon: WifiIcon },
  { key: "switches", label: "Switches", icon: EthernetPortIcon },
  { key: "internetIssues", label: "Internet Issues", icon: ShieldAlertIcon },
  { key: "criticalAlerts", label: "Critical Alerts", icon: ShieldAlertIcon },
  { key: "offlineDevices", label: "Offline Devices", icon: CableIcon },
] as const

const siteGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4"

function SessionSkeleton() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className={siteGridClassName}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-96 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  )
}

function StatusLoadingSkeleton() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Network Status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live UniFi health and device status across NiteOwl-managed venues.
            </p>
          </div>
          <Skeleton className="h-6 w-36 rounded-full" />
        </div>
        <div className={siteGridClassName}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-96 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  )
}

function StatusRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof GaugeIcon
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function UptimeBar({ value }: { value?: number | null }) {
  const displayValue =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : null

  return (
    <div className="mt-3 w-full space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Connection uptime</span>
        <span className="font-medium tabular-nums">
          {displayValue === null ? "—" : `${displayValue.toFixed(2)}%`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${displayValue ?? 0}%` }}
        />
      </div>
    </div>
  )
}

function SiteCard({ site }: { site: SiteStatus }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const healthy = site.internet === "Healthy" && site.offlineDevices === 0

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">{site.name}</CardTitle>
            <CardDescription>UniFi Network</CardDescription>
          </div>
          <Badge variant={healthy ? "secondary" : "destructive"}>
            {healthy ? "Healthy" : "Attention"}
          </Badge>
        </div>
        <UptimeBar value={site.wanUptime} />
      </CardHeader>

      <CardContent>
        <div className="space-y-0.5">
          <StatusRow label="Site Magic" value={site.siteMagic} icon={CloudCogIcon} />
          <StatusRow label="Internet" value={site.internet} icon={RadioTowerIcon} />
          <StatusRow label="LTE Failover" value={site.lteFailover} icon={GaugeIcon} />
          <StatusRow label="Gateway" value={site.gateway} icon={RouterIcon} />
          <StatusRow label="Public IP" value={site.publicIp} icon={CableIcon} />
        </div>

        <Separator className="mt-3" />

        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full justify-between px-0 text-sm text-muted-foreground hover:bg-transparent hover:text-foreground"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Details
          <ChevronDownIcon
            className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
          />
        </Button>

        {detailsOpen ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 pb-1 pt-1">
            {metrics.map(({ key, label, icon: Icon }) => (
              <div key={key} className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{site[key]}</div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function NetworkStatusPage() {
  const { data: session, isPending } = authClient.useSession()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusPending, setStatusPending] = useState(true)

  useEffect(() => {
    if (isPending || session) {
      return
    }

    const redirectTo = encodeURIComponent(window.location.href)
    const signInURL = `${authBaseURL.replace(/\/$/, "")}/auth/sign-in?redirectTo=${redirectTo}`

    window.location.replace(signInURL)
  }, [isPending, session])

  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function loadStatus() {
      try {
        const response = await fetch("/api/status", {
          headers: {
            Accept: "application/json",
          },
        })

        const body = (await response.json()) as StatusResponse | { error?: string }

        if (!response.ok) {
          throw new Error("error" in body && body.error ? body.error : "Unable to load UniFi status")
        }

        if (!cancelled) {
          setStatus(body as StatusResponse)
          setStatusError(null)
          setStatusPending(false)
        }
      } catch (error) {
        if (!cancelled) {
          setStatusError(error instanceof Error ? error.message : "Unable to load UniFi status")
          setStatusPending(false)
        }
      }
    }

    void loadStatus()
    const timer = window.setInterval(() => void loadStatus(), 30_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [session])

  if (isPending) {
    return <SessionSkeleton />
  }

  if (!session) {
    return null
  }

  if (statusPending) {
    return <StatusLoadingSkeleton />
  }

  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Network Status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live UniFi health and device status across NiteOwl-managed venues.
            </p>
          </div>
          <Badge variant={statusError ? "destructive" : "outline"} className="w-fit">
            <CloudCogIcon />
            {statusError
              ? statusError
              : status?.updatedAt
                ? `Updated ${new Date(status.updatedAt).toLocaleTimeString()}`
                : "Connecting to UniFi"}
          </Badge>
        </div>

        {status?.sites?.length ? (
          <div className={siteGridClassName}>
            {status.sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>UniFi status unavailable</CardTitle>
              <CardDescription>
                {statusError ?? "The UniFi Site Manager API did not return any configured sites."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </main>
  )
}
