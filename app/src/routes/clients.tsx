import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CableIcon,
  MonitorSmartphoneIcon,
  WifiIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import { Button } from "#/components/ui/button.tsx"
import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"
import { Input } from "#/components/ui/input.tsx"
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx"
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

type Network = { id: string; name: string; vlanId?: number | null; clients?: Client[] }
type Zone = { id: string; name: string; networks: Network[] }
type ZonesResponse = { updatedAt?: string; zones?: Zone[]; error?: string }
type ClientRow = Client & {
  key: string
  networkName: string
  vlanId: number | null
  zoneName: string
}
type ConnectionFilter = "all" | "wired" | "wireless"
type SortKey = "client" | "connection" | "network" | "ip" | "uplink" | "signal"
type SortDirection = "asc" | "desc"

function SortableHeader({
  align = "left",
  direction,
  label,
  onSort,
}: {
  align?: "left" | "right"
  direction: SortDirection | null
  label: string
  onSort: () => void
}) {
  const Icon = direction === "asc" ? ArrowUpIcon : direction === "desc" ? ArrowDownIcon : ArrowUpDownIcon
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={align === "right" ? "ml-auto" : "-ml-2"}
      onClick={onSort}
      aria-label={`Sort by ${label}${direction ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
    >
      {label}
      <Icon data-icon="inline-end" />
    </Button>
  )
}

function compareNullable<T>(left: T | null, right: T | null, compare: (a: T, b: T) => number, direction: SortDirection) {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  const result = compare(left, right)
  return direction === "asc" ? result : -result
}

function ClientDevicesPage() {
  const { data: session, isPending } = authClient.useSession()
  const { data: activeOrganization, isPending: organizationPending } =
    authClient.useActiveOrganization()
  const [data, setData] = useState<ZonesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [connectionFilter, setConnectionFilter] = useState<ConnectionFilter>("all")
  const [vlanFilter, setVlanFilter] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("client")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

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
            vlanId: network.vlanId ?? null,
            zoneName: zone.name,
          })
        }
      }
    }
    return rows
  }, [data])

  const vlanOptions = useMemo(
    () => [...new Set(clients.flatMap((client) => client.vlanId === null ? [] : [client.vlanId]))].sort((a, b) => a - b),
    [clients],
  )

  const visibleClients = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = clients.filter((client) => {
      if (connectionFilter === "wired" && client.wired !== true) return false
      if (connectionFilter === "wireless" && client.wired !== false) return false
      if (vlanFilter === "untagged" && client.vlanId !== null) return false
      if (vlanFilter !== "all" && vlanFilter !== "untagged" && client.vlanId !== Number(vlanFilter)) return false
      return !query || [client.name, client.mac, client.ipAddress, client.ssid, client.networkName, client.zoneName, client.uplinkName, client.vlanId === null ? "untagged" : String(client.vlanId)].some((value) => value?.toLowerCase().includes(query))
    })
    const textCompare = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
    return [...filtered].sort((left, right) => {
      let result = 0
      if (sortKey === "client") result = textCompare(left.name ?? left.mac ?? "", right.name ?? right.mac ?? "")
      if (sortKey === "connection") result = textCompare(left.wired === true ? "wired" : left.wired === false ? "wireless" : "unknown", right.wired === true ? "wired" : right.wired === false ? "wireless" : "unknown")
      if (sortKey === "network") result = textCompare(`${left.networkName} ${left.vlanId ?? ""}`, `${right.networkName} ${right.vlanId ?? ""}`)
      if (sortKey === "ip") return compareNullable(left.ipAddress, right.ipAddress, textCompare, sortDirection)
      if (sortKey === "uplink") return compareNullable(left.uplinkName, right.uplinkName, textCompare, sortDirection)
      if (sortKey === "signal") return compareNullable(left.signalDbm, right.signalDbm, (a, b) => a - b, sortDirection)
      return sortDirection === "asc" ? result : -result
    })
  }, [clients, connectionFilter, search, sortDirection, sortKey, vlanFilter])

  function handleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc")
      return
    }
    setSortKey(nextKey)
    setSortDirection("asc")
  }

  const hasFilters = search.length > 0 || connectionFilter !== "all" || vlanFilter !== "all"

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

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients, IPs, networks, VLANs, or uplinks" aria-label="Search client devices" className="min-w-0 flex-1" />
          <NativeSelect value={connectionFilter} onChange={(event) => setConnectionFilter(event.target.value as ConnectionFilter)} aria-label="Filter by connection type" className="w-full sm:w-40">
            <NativeSelectOption value="all">All connections</NativeSelectOption>
            <NativeSelectOption value="wired">Wired</NativeSelectOption>
            <NativeSelectOption value="wireless">Wireless</NativeSelectOption>
          </NativeSelect>
          <NativeSelect value={vlanFilter} onChange={(event) => setVlanFilter(event.target.value)} aria-label="Filter by VLAN" className="w-full sm:w-40">
            <NativeSelectOption value="all">All VLANs</NativeSelectOption>
            {clients.some((client) => client.vlanId === null) ? <NativeSelectOption value="untagged">Untagged</NativeSelectOption> : null}
            {vlanOptions.map((vlanId) => <NativeSelectOption key={vlanId} value={String(vlanId)}>VLAN {vlanId}</NativeSelectOption>)}
          </NativeSelect>
          {hasFilters ? <Button type="button" variant="ghost" onClick={() => { setSearch(""); setConnectionFilter("all"); setVlanFilter("all") }}><XIcon data-icon="inline-start" />Clear</Button> : null}
        </div>

        {error || visibleClients.length === 0 ? (
          <Card><CardHeader><CardTitle>{error ? "Client devices unavailable" : hasFilters ? "No matching clients" : "No connected clients"}</CardTitle><CardDescription>{error ?? (hasFilters ? "Try different search terms or filters." : "UniFi did not report any active clients for this organization.")}</CardDescription></CardHeader></Card>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead aria-sort={sortKey === "client" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><SortableHeader label="Client" direction={sortKey === "client" ? sortDirection : null} onSort={() => handleSort("client")} /></TableHead><TableHead aria-sort={sortKey === "connection" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><SortableHeader label="Connection" direction={sortKey === "connection" ? sortDirection : null} onSort={() => handleSort("connection")} /></TableHead><TableHead aria-sort={sortKey === "network" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><SortableHeader label="Network / VLAN" direction={sortKey === "network" ? sortDirection : null} onSort={() => handleSort("network")} /></TableHead><TableHead aria-sort={sortKey === "ip" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><SortableHeader label="IP address" direction={sortKey === "ip" ? sortDirection : null} onSort={() => handleSort("ip")} /></TableHead><TableHead aria-sort={sortKey === "uplink" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><SortableHeader label="Uplink" direction={sortKey === "uplink" ? sortDirection : null} onSort={() => handleSort("uplink")} /></TableHead><TableHead aria-sort={sortKey === "signal" ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><SortableHeader label="Signal" align="right" direction={sortKey === "signal" ? sortDirection : null} onSort={() => handleSort("signal")} /></TableHead></TableRow></TableHeader>
              <TableBody>{visibleClients.map((client) => <TableRow key={client.key}><TableCell><div className="min-w-44"><p className="font-medium">{client.name ?? "Unnamed client"}</p><p className="font-mono text-xs text-muted-foreground">{client.mac ?? "MAC unavailable"}</p></div></TableCell><TableCell><Badge variant="outline">{client.wired === true ? <CableIcon /> : <WifiIcon />}{client.wired === true ? "Wired" : client.wired === false ? "Wireless" : "Unknown"}</Badge></TableCell><TableCell><p className="font-medium">{client.networkName}</p><p className="text-xs text-muted-foreground">{client.vlanId === null ? "Untagged" : `VLAN ${client.vlanId}`} · {client.ssid ?? client.zoneName}</p></TableCell><TableCell className="font-mono text-sm">{client.ipAddress ?? "—"}</TableCell><TableCell>{client.uplinkName ? `${client.uplinkName}${client.switchPort ? ` · Port ${client.switchPort}` : ""}` : "—"}</TableCell><TableCell className="text-right tabular-nums">{client.signalDbm !== null ? `${client.signalDbm} dBm` : "—"}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  )
}
