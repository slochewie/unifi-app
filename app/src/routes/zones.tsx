import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { ResourceSelector } from "@niteowl/ui"
import { NetworkIcon, PanelsTopLeftIcon, WifiIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"
import { authBaseURL, authClient } from "#/lib/auth-client.ts"

export const Route = createFileRoute("/zones")({ component: ZonesPage })

type Zone = {
  id: string
  name: string
  networks: Array<{
    id: string
    name: string
    vlanId?: number | null
    subnet?: string | null
    gateway?: string | null
    dns?: string[]
    dhcpStart?: string | null
    dhcpEnd?: string | null
    ssids?: string[]
  }>
}

type ZonesResponse = { zones: Zone[] }

function ZonesPage() {
  const { data: session, isPending } = authClient.useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [data, setData] = useState<ZonesResponse>({ zones: [] })
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

  useEffect(() => {
    if (isPending || session) return
    const redirectTo = encodeURIComponent(window.location.href)
    window.location.replace(`${authBaseURL.replace(/\/$/, "")}/auth/sign-in?redirectTo=${redirectTo}`)
  }, [isPending, session])

  useEffect(() => {
    if (!session || !activeOrganization?.id) return
    let cancelled = false
    void fetch(`/api/zones?organizationId=${encodeURIComponent(activeOrganization.id)}`)
      .then(async (response) => {
        const body = (await response.json()) as ZonesResponse
        if (!cancelled && response.ok) {
          setData(body)
          setSelectedZoneId(body.zones[0]?.id ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) setData({ zones: [] })
      })
    return () => { cancelled = true }
  }, [activeOrganization?.id, session])

  const selectedZone = useMemo(
    () => data.zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [data.zones, selectedZoneId],
  )

  if (isPending || !session) return null

  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm">
            <PanelsTopLeftIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Zones</h1>
            <p className="mt-1 text-sm text-muted-foreground">Networks, addressing, DHCP, DNS, and wireless networks for the selected organization.</p>
          </div>
        </div>

        <ResourceSelector
          title="Zone"
          description="Select a UniFi zone to inspect its networks."
          resources={data.zones}
          value={selectedZoneId}
          onValueChange={setSelectedZoneId}
          placeholder="Select zone"
          emptyLabel="No zones available"
          icon={PanelsTopLeftIcon}
        />

        {selectedZone ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {selectedZone.networks.map((network) => (
              <Card key={network.id}>
                <CardHeader>
                  <div className="flex items-center gap-2"><NetworkIcon className="size-5 text-muted-foreground" /><CardTitle>{network.name}</CardTitle></div>
                  <CardDescription>{network.subnet ?? "Subnet unavailable"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2">
                    <dt className="text-muted-foreground">VLAN ID</dt><dd>{network.vlanId ?? "—"}</dd>
                    <dt className="text-muted-foreground">Subnet</dt><dd>{network.subnet ?? "—"}</dd>
                    <dt className="text-muted-foreground">Gateway</dt><dd>{network.gateway ?? "—"}</dd>
                    <dt className="text-muted-foreground">DNS</dt><dd>{network.dns?.join(", ") || "—"}</dd>
                    <dt className="text-muted-foreground">DHCP range</dt><dd>{network.dhcpStart && network.dhcpEnd ? `${network.dhcpStart} – ${network.dhcpEnd}` : "—"}</dd>
                  </dl>
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-medium"><WifiIcon className="size-4" />SSIDs</div>
                    <p className="text-muted-foreground">{network.ssids?.join(", ") || "No SSIDs mapped"}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card><CardHeader><CardTitle>No zone selected</CardTitle><CardDescription>UniFi zone data will appear here once the Fabric API source is connected.</CardDescription></CardHeader></Card>
        )}
      </div>
    </main>
  )
}
