import { useEffect, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  CableIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleHelpIcon,
  EthernetPortIcon,
  NetworkIcon,
  RefreshCwIcon,
  RouterIcon,
  ServerIcon,
  WifiIcon,
} from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { authBaseURL, authClient } from "#/lib/auth-client.ts"

export const Route = createFileRoute("/devices")({ component: DevicesPage })

type Device = {
  id: string
  name: string
  model: string
  category: "gateway" | "access-point" | "switch" | "console" | "other"
  ipAddress: string | null
  macAddress: string | null
  firmwareVersion: string | null
  firmwareStatus: "update-available" | "up-to-date" | "unknown"
  state: number | null
  online: boolean
  adopted: boolean | null
  uplink: { name: string; macAddress: string | null; port: number | null } | null
  imageId?: string | null
  topologyImageId?: string | null
}

type DeviceSite = {
  id: string
  name: string
  available: boolean
  devices: Device[]
}

type DevicesResponse = {
  updatedAt: string
  sites: DeviceSite[]
  error?: string
}

function DeviceIcon({ category }: { category: Device["category"] }) {
  const Icon =
    category === "gateway"
      ? RouterIcon
      : category === "access-point"
        ? WifiIcon
        : category === "switch"
          ? EthernetPortIcon
          : ServerIcon

  return (
    <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
      <Icon className="size-8" />
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all font-medium">{value || "—"}</span>
    </div>
  )
}

function FirmwareBadge({ status }: { status: Device["firmwareStatus"] }) {
  if (status === "update-available") {
    return (
      <Badge variant="outline">
        <RefreshCwIcon />
        Firmware update available
      </Badge>
    )
  }

  if (status === "up-to-date") {
    return (
      <Badge variant="outline">
        <CircleCheckIcon />
        Firmware up to date
      </Badge>
    )
  }

  return (
    <Badge variant="outline">
      <CircleHelpIcon />
      Firmware status unknown
    </Badge>
  )
}

function DeviceCard({ device }: { device: Device }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-4">
          <DeviceIcon category={device.category} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-lg">{device.name}</CardTitle>
                <CardDescription className="mt-1">{device.model}</CardDescription>
              </div>
              <Badge variant={device.online ? "secondary" : "destructive"}>
                <CircleDotIcon />
                {device.online ? "Online" : "Offline"}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <DetailRow label="IP address" value={device.ipAddress} />
        <DetailRow label="MAC" value={device.macAddress} />
        <DetailRow label="Firmware" value={device.firmwareVersion} />
        {device.uplink ? <DetailRow label="Uplink" value={`${device.uplink.name}${device.uplink.port ? ` · Port ${device.uplink.port}` : ""}`} /> : null}
        <div className="pt-1">
          <FirmwareBadge status={device.firmwareStatus} />
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingPage() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-80 max-w-full" /></div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-xl" />)}
        </div>
      </div>
    </main>
  )
}

function DevicesPage() {
  const { data: session, isPending } = authClient.useSession()
  const [data, setData] = useState<DevicesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isPending || session) return
    const redirectTo = encodeURIComponent(window.location.href)
    window.location.replace(`${authBaseURL.replace(/\/$/, "")}/auth/sign-in?redirectTo=${redirectTo}`)
  }, [isPending, session])

  useEffect(() => {
    if (!session) return
    let cancelled = false

    async function loadDevices() {
      try {
        const response = await fetch("/api/devices", { headers: { Accept: "application/json" } })
        const body = (await response.json()) as DevicesResponse
        if (!response.ok) throw new Error(body.error ?? "Unable to load UniFi devices")
        if (!cancelled) {
          setData(body)
          setError(null)
          setLoading(false)
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load UniFi devices")
          setLoading(false)
        }
      }
    }

    void loadDevices()
    const timer = window.setInterval(() => void loadDevices(), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [session])

  if (isPending || (session && loading)) return <LoadingPage />
  if (!session) return null

  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm">
              <CableIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
              <p className="mt-1 text-sm text-muted-foreground">UniFi equipment inventory, addressing, and firmware status across NiteOwl-managed venues.</p>
            </div>
          </div>
          <Badge variant={error ? "destructive" : "outline"} className="w-fit">
            <NetworkIcon />
            {error ? error : data?.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}` : "Connecting to UniFi"}
          </Badge>
        </div>

        {data?.sites.map((site) => (
          <section key={site.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{site.name}</h2>
                <p className="text-sm text-muted-foreground">{site.available ? `${site.devices.length} UniFi device${site.devices.length === 1 ? "" : "s"}` : "Console unavailable"}</p>
              </div>
            </div>
            {site.devices.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {site.devices.map((device) => <DeviceCard key={device.id} device={device} />)}
              </div>
            ) : (
              <Card><CardHeader><CardTitle>No devices available</CardTitle><CardDescription>{site.available ? "This UniFi site did not return adopted devices." : "The UniFi Network console could not be reached through the Fabric connector."}</CardDescription></CardHeader></Card>
            )}
          </section>
        ))}

        {!data?.sites.length ? (
          <Card><CardHeader><CardTitle>Device inventory unavailable</CardTitle><CardDescription>{error ?? "No configured UniFi sites were returned."}</CardDescription></CardHeader></Card>
        ) : null}
      </div>
    </main>
  )
}
