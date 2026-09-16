import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { ResourceSelector } from "@niteowl/ui"
import {
  CheckCircle2Icon,
  CircleHelpIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"
import { authBaseURL, authClient } from "#/lib/auth-client.ts"

export const Route = createFileRoute("/toast-readiness")({ component: ToastReadinessPage })

type Status = "pass" | "fail" | "verify" | "unknown"

type WifiBroadcast = {
  id: string
  name: string
  enabled: boolean | null
  frequenciesGHz: number[]
  clientIsolationEnabled: boolean | null
  multicastToUnicastConversionEnabled: boolean | null
  securityType: string | null
}

type Client = {
  mac: string | null
  name: string | null
  ipAddress: string | null
  wired: boolean | null
  ssid: string | null
  signalDbm: number | null
  accessPointMac: string | null
  switchMac: string | null
  switchPort: number | null
  uplinkName: string | null
  qosPolicyApplied: boolean | null
}

type Network = {
  id: string
  name: string
  vlanId: number | null
  isolationEnabled: boolean | null
  internetAccessEnabled: boolean | null
  mdnsEnabled: boolean | null
  mdnsForwardingEnabled: boolean | null
  wifiBroadcasts?: WifiBroadcast[]
  clients?: Client[]
}

type Zone = {
  id: string
  name: string
  networks: Network[]
}

type ZonesResponse = {
  zones: Zone[]
  error?: string
}

type PolicyResponse = {
  zoneId?: string
  unrestrictedOutbound?: boolean
  returnTrafficAllowed?: boolean
  icmpEchoRepliesUnrestricted?: boolean
  toastFirewallAllowlistReachable?: boolean
  evidence?: {
    restrictingOutboundPolicies?: string[]
  }
  error?: string
}

type Requirement = {
  label: string
  source: string
  status: Status
  detail?: string
}

function ToastReadinessPage() {
  const { data: session, isPending } = authClient.useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [data, setData] = useState<ZonesResponse>({ zones: [] })
  const [policy, setPolicy] = useState<PolicyResponse | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isPending || session) return
    const redirectTo = encodeURIComponent(window.location.href)
    window.location.replace(`${authBaseURL.replace(/\/$/, "")}/auth/sign-in?redirectTo=${redirectTo}`)
  }, [isPending, session])

  useEffect(() => {
    if (!session || !activeOrganization?.id || !activeOrganization.name) {
      setData({ zones: [] })
      setSelectedZoneId(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setData({ zones: [] })
    setPolicy(null)
    setSelectedZoneId(null)

    const params = new URLSearchParams({
      organizationId: activeOrganization.id,
      organizationName: activeOrganization.name,
    })

    void fetch(`/api/zones?${params.toString()}`)
      .then(async (response) => {
        const body = (await response.json()) as ZonesResponse
        if (cancelled) return

        if (response.ok) {
          setData(body)
          const toastZone = body.zones.find((zone) => zone.name.toLowerCase() === "toast")
          setSelectedZoneId(toastZone?.id ?? body.zones[0]?.id ?? null)
        } else {
          setData({ zones: [], error: body.error ?? `Unable to load zones (${response.status})` })
        }
      })
      .catch(() => {
        if (!cancelled) setData({ zones: [], error: "Unable to load UniFi zones" })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeOrganization?.id, activeOrganization?.name, session])

  useEffect(() => {
    if (!session || !activeOrganization?.name || !selectedZoneId) {
      setPolicy(null)
      return
    }

    let cancelled = false
    setPolicy(null)
    const params = new URLSearchParams({
      organizationName: activeOrganization.name,
      zoneId: selectedZoneId,
    })

    void fetch(`/api/toast-policy?${params.toString()}`)
      .then(async (response) => {
        const body = (await response.json()) as PolicyResponse
        if (cancelled) return
        setPolicy(response.ok ? body : { error: body.error ?? `Unable to evaluate policy (${response.status})` })
      })
      .catch(() => {
        if (!cancelled) setPolicy({ error: "Unable to evaluate UniFi firewall policy" })
      })

    return () => {
      cancelled = true
    }
  }, [activeOrganization?.name, selectedZoneId, session])

  const selectedZone = useMemo(
    () => data.zones.find((zone) => zone.id === selectedZoneId) ?? null,
    [data.zones, selectedZoneId],
  )

  const requirements = useMemo(
    () => buildRequirements(selectedZone, policy),
    [selectedZone, policy],
  )

  if (isPending || !session) return null

  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm">
            <ShieldCheckIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Toast Network Readiness</h1>
            <p className="mt-1 text-sm text-muted-foreground">Checks the selected UniFi zone against Toast's self-managed network requirements.</p>
          </div>
        </div>

        <ResourceSelector
          title="Zone"
          description="Select the UniFi zone used by Toast."
          resources={data.zones}
          value={selectedZoneId}
          onValueChange={setSelectedZoneId}
          placeholder="Select zone"
          emptyLabel={data.error ?? "No zones available"}
          loadingLabel="Loading UniFi zones…"
          loading={loading}
          icon={ShieldCheckIcon}
        />

        <Card>
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
            <CardDescription>Pass and fail are based on configuration exposed by UniFi. Verify requires a physical or operational check. Unknown means the current API data cannot prove either result.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {requirements.map((requirement) => (
              <RequirementRow key={requirement.label} requirement={requirement} />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function buildRequirements(zone: Zone | null, policy: PolicyResponse | null): Requirement[] {
  const networks = zone?.networks ?? []
  const broadcasts = networks.flatMap((network) => network.wifiBroadcasts ?? [])
  const enabledBroadcasts = broadcasts.filter((broadcast) => broadcast.enabled !== false)
  const clients = networks.flatMap((network) => network.clients ?? [])
  const wirelessClients = clients.filter((client) => client.wired === false)
  const clientsWithSignal = wirelessClients.filter(
    (client): client is Client & { signalDbm: number } => client.signalDbm !== null,
  )

  const dedicatedVlan: Status = !zone
    ? "unknown"
    : networks.length === 0
      ? "fail"
      : networks.every((network) => network.vlanId !== null)
        ? "pass"
        : "fail"

  const ssidMapped: Status = !zone
    ? "unknown"
    : networks.length === 0 || enabledBroadcasts.length === 0
      ? "fail"
      : "pass"

  const fiveGhz: Status = enabledBroadcasts.length === 0
    ? "unknown"
    : enabledBroadcasts.every((broadcast) => broadcast.frequenciesGHz.includes(5))
      ? "pass"
      : "fail"

  const wpa2: Status = enabledBroadcasts.length === 0
    ? "unknown"
    : enabledBroadcasts.every((broadcast) => broadcast.securityType === "WPA2_AES_PERSONAL")
      ? "pass"
      : "fail"

  const isolationValues = enabledBroadcasts.map((broadcast) => broadcast.clientIsolationEnabled)
  const clientIsolation: Status = isolationValues.length === 0 || isolationValues.some((value) => value === null)
    ? "unknown"
    : isolationValues.every((value) => value === false)
      ? "pass"
      : "fail"

  const mdnsValues = networks.map((network) => network.mdnsEnabled)
  const mdns: Status = mdnsValues.length === 0 || mdnsValues.some((value) => value === null)
    ? "unknown"
    : mdnsValues.every((value) => value === true)
      ? "pass"
      : "fail"

  const signal: Status = wirelessClients.length === 0 || clientsWithSignal.length !== wirelessClients.length
    ? "unknown"
    : clientsWithSignal.every((client) => client.signalDbm >= -65)
      ? "pass"
      : "fail"

  const signalDetail = wirelessClients.length === 0
    ? "No wireless clients are currently connected to the selected network."
    : clientsWithSignal.length > 0
      ? clientsWithSignal
          .map((client) => `${client.name ?? client.mac ?? "Client"}: ${client.signalDbm} dBm`)
          .join(", ")
      : undefined

  const policyReady = policy?.zoneId === zone?.id && !policy.error
  const icmp: Status = !policyReady
    ? "unknown"
    : policy.icmpEchoRepliesUnrestricted === true
      ? "pass"
      : "fail"
  const firewall: Status = !policyReady
    ? "unknown"
    : policy.toastFirewallAllowlistReachable === true
      ? "pass"
      : "fail"
  const firewallDetail = !policyReady
    ? policy?.error
    : policy.toastFirewallAllowlistReachable
      ? "Selected zone has unrestricted outbound Internet access; Toast's required destinations and ports are not blocked by UniFi zone policy."
      : policy.evidence?.restrictingOutboundPolicies?.length
        ? `Restricting outbound policies: ${policy.evidence.restrictingOutboundPolicies.join(", ")}`
        : "UniFi policy does not prove unrestricted outbound access."
  const icmpDetail = !policyReady
    ? policy?.error
    : policy.icmpEchoRepliesUnrestricted
      ? "Outbound traffic is unrestricted and return traffic is allowed by the External → selected-zone policy."
      : "UniFi policy does not prove unrestricted ICMP echo replies."

  return [
    { label: "Dedicated Toast VLAN", source: "UniFi network", status: dedicatedVlan, detail: networks.length > 0 ? networks.map((network) => `${network.name} · VLAN ${network.vlanId ?? "none"}`).join(", ") : undefined },
    { label: "Non-Toast devices excluded from Toast VLAN", source: "UniFi clients", status: "unknown", detail: clients.length > 0 ? `${clients.length} client${clients.length === 1 ? "" : "s"} currently observed on the selected network; device purpose cannot be proven automatically.` : "No clients are currently observed on the selected network." },
    { label: "Physical Ethernet ports mapped to Toast VLAN", source: "UniFi switching", status: "unknown", detail: "Explicit port overrides are not a complete effective-port configuration; inherited port settings are not treated as pass or fail." },
    { label: "Bonjour / mDNS enabled", source: "UniFi network", status: mdns },
    { label: "Client isolation disabled", source: "UniFi WiFi", status: clientIsolation },
    { label: "Toast SSID mapped to Toast VLAN", source: "UniFi WiFi", status: ssidMapped, detail: enabledBroadcasts.map((broadcast) => broadcast.name).join(", ") || undefined },
    { label: "5 GHz wireless", source: "UniFi WiFi", status: fiveGhz, detail: enabledBroadcasts.map((broadcast) => `${broadcast.name}: ${broadcast.frequenciesGHz.join(" / ")} GHz`).join(", ") || undefined },
    { label: "WPA2/AES Personal encryption", source: "UniFi WiFi", status: wpa2, detail: enabledBroadcasts.map((broadcast) => `${broadcast.name}: ${formatSecurity(broadcast.securityType)}`).join(", ") || undefined },
    { label: "Wireless signal remains at or above -65 dBm", source: "UniFi clients", status: signal, detail: signalDetail },
    { label: "ICMP echo replies unrestricted", source: "UniFi policy", status: icmp, detail: icmpDetail },
    { label: "Toast firewall destinations and ports allowed", source: "Firewall policy", status: firewall, detail: firewallDetail },
    { label: "QoS provides sufficient Toast bandwidth", source: "UniFi traffic policy", status: "unknown" },
    { label: "Cat5e or better cabling / T568B termination", source: "Physical verification", status: "verify" },
    { label: "Toast Ethernet ports clearly labeled", source: "Physical verification", status: "verify" },
  ]
}

function formatSecurity(value: string | null) {
  if (!value) return "Unknown"
  return value.replaceAll("_", " ")
}

function RequirementRow({ requirement }: { requirement: Requirement }) {
  const Icon = requirement.status === "pass"
    ? CheckCircle2Icon
    : requirement.status === "fail"
      ? XCircleIcon
      : CircleHelpIcon

  const label = requirement.status === "pass"
    ? "Pass"
    : requirement.status === "fail"
      ? "Fail"
      : requirement.status === "verify"
        ? "Verify"
        : "Unknown"

  const iconClassName = requirement.status === "pass"
    ? "text-green-600 dark:text-green-500"
    : requirement.status === "fail"
      ? "text-destructive"
      : "text-muted-foreground"

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Icon className={`mt-0.5 size-5 shrink-0 ${iconClassName}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{requirement.label}</p>
        <p className="text-sm text-muted-foreground">{requirement.source}</p>
        {requirement.detail ? <p className="mt-1 text-sm text-muted-foreground">{requirement.detail}</p> : null}
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
