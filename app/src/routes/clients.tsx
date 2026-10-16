import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  CableIcon,
  MonitorSmartphoneIcon,
  SearchIcon,
  WifiIcon,
} from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx"
import { authBaseURL, authClient, networkStatusApiFetch } from "#/lib/auth-client.ts"

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Client Devices" }] }),
  component: ClientDevicesPage,
})

type Client = {
  mac: string | null
  name: string | null
  ipAddress: string | null
  wired: boolean | null
  ssid: string | null
  signalDbm: number | null
  uplinkName: string | null
  switchPort: number | null
}

type Network = { id: string; name: string; clients?: Client[] }
type Zone = { id: string; name: string; networks: Network[] }
type ZonesResponse = { updatedAt?: string; zones?: Zone[]; error?: string }
type ClientRow = Client & { key: string; networkName: string; zoneName: string }

function ClientDevicesPage() {
  const { data: session, isPending } = authClient.useSession()
  const { data: activeOrganization, isPending: organizationPending } =
    authClient.useActiveOrganization()
  const [data, setData] = useState<ZonesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (isPending || session) return
    const redirectTo = encodeURIComponent(window.location.href)
    window.location.replace(
      `${authBaseURL.replace(/\/$/, "")}/auth/sign-in?redirectTo=${redirectTo}`,
    )
  }, [isPending, session])

  useEffect(() => {
    if (!session || !activeOrganization?.id) {
      setData(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setData(null)
    setError(null)
    const params = new URLSearchParams({ organizationId: activeOrganization.id })

    void networkStatusApiFetch(`/api/zones?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ZonesResponse
        if (!response.ok) throw new Error(body.error ?? "Unable to load client devices")
        setData(body)
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Unable to load client devices")
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [activeOrganization?.id, session])

  const clients = useMemo(() => {
    const rows: ClientRow[] = []
    for (const zone of data?.zones ?? []) {
      for (const network of zone.networks) {
        for (const [index, client] of (network.clients ?? []).entries()) {
          rows.push({
            ...client,
            key: `${network.id}-${client.mac ?? client.ipAddress ?? client.name ?? index}`,
            networkName: network.name,
            zoneName: zone.name,
          })
        }
      }
    }
    return rows.sort((a, b) =>
      (a.name ?? a.mac ?? "").localeCompare(b.name ?? b.mac ?? ""),
    )
  }, [data])

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return clients
    return clients.filter((client) =>
      [
        client.name,
        client.mac,
        client.ipAddress,
        client.ssid,
        client.networkName,
        client.zoneName,
        client.uplinkName,
      ].some((value) => value?.toLowerCase().includes(query)),
    )
  }, [clients, search])

  if (isPending || organizationPending || loading) {
    return <main className="flex-1 space-y-6 p-4 md:p-6"><Skeleton className="h-16 w-full max-w-xl" /><Skeleton className="h-12 w-full" /><Skeleton className="h-80 w-full rounded-xl" /></main>
  }
  if (!session) return null
  if (!activeOrganization) {
    return <main className="flex-1 p-4 md:p-6"><Card><CardHeader><CardTitle>Select an organization</CardTitle><CardDescription>Choose an organization to view its connected client devices.</CardDescription></CardHeader></Card></main>
  }

  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm"><MonitorSmartphoneIcon className="size-5" /></div>
            <div><h1 className="text-2xl font-semibold tracking-tight">Client Devices</h1><p className="mt-1 text-sm text-muted-foreground">Connected wired and wireless devices for the selected organization.</p></div>
          </div>
          <Badge variant={error ? "destructive" : "outline"} className="w-fit">{error ?? `${clients.length} connected client${clients.length === 1 ? "" : "s"}`}</Badge>
        </div>

        <div className="relative"><SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients, IPs, networks, or uplinks" className="pl-9" /></div>

        {error || filteredClients.length === 0 ? (
          <Card><CardHeader><CardTitle>{error ? "Client devices unavailable" : search ? "No matching clients" : "No connected clients"}</CardTitle><CardDescription>{error ?? (search ? "Try a different search." : "UniFi did not report any active clients for this organization.")}</CardDescription></CardHeader></Card>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Connection</TableHead><TableHead>Network</TableHead><TableHead>IP address</TableHead><TableHead>Uplink</TableHead><TableHead className="text-right">Signal</TableHead></TableRow></TableHeader>
              <TableBody>{filteredClients.map((client) => <TableRow key={client.key}><TableCell><div className="min-w-44"><p className="font-medium">{client.name ?? "Unnamed client"}</p><p className="font-mono text-xs text-muted-foreground">{client.mac ?? "MAC unavailable"}</p></div></TableCell><TableCell><Badge variant="outline">{client.wired === true ? <CableIcon /> : <WifiIcon />}{client.wired === true ? "Wired" : client.wired === false ? "Wireless" : "Unknown"}</Badge></TableCell><TableCell><p className="font-medium">{client.networkName}</p><p className="text-xs text-muted-foreground">{client.ssid ?? client.zoneName}</p></TableCell><TableCell className="font-mono text-sm">{client.ipAddress ?? "—"}</TableCell><TableCell>{client.uplinkName ? `${client.uplinkName}${client.switchPort ? ` · Port ${client.switchPort}` : ""}` : "—"}</TableCell><TableCell className="text-right tabular-nums">{client.signalDbm !== null ? `${client.signalDbm} dBm` : "—"}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  )
}
