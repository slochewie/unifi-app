import { readFile } from "node:fs/promises"
import { createFileRoute } from "@tanstack/react-router"

type SiteManagerSite = {
  siteId?: string
  hostId?: string
}

type LocalSite = {
  id: string
  name: string
  internalReference?: string
}

type Network = {
  id: string
  name: string
  vlanId?: number
  zoneId?: string
  management?: string
  isolationEnabled?: boolean
  internetAccessEnabled?: boolean
  mdnsForwardingEnabled?: boolean
  ipv4Configuration?: {
    hostIpAddress?: string
    prefixLength?: number
    dhcpConfiguration?: {
      mode?: string
      ipAddressRange?: {
        start?: string
        stop?: string
      }
      gatewayIpAddressOverride?: string
      dnsServerIpAddressesOverride?: string[]
      leaseTimeSeconds?: number
    }
  }
}

type FirewallZone = {
  id: string
  name: string
  networkIds?: string[]
}

type WifiBroadcast = {
  id: string
  name: string
  enabled?: boolean
  network?: {
    type?: string
    networkId?: string
  }
  broadcastingFrequenciesGHz?: number[]
  clientIsolationEnabled?: boolean
  multicastToUnicastConversionEnabled?: boolean
  securityConfiguration?: {
    type?: string
  }
}

type Page<T> = {
  data?: T[]
}

type SiteConfig = {
  siteId: string
  names: string[]
}

const SITE_CONFIG: SiteConfig[] = [
  { siteId: "60b95da3e03dd800f8e1ab9a", names: ["McCarthy's", "McCarthy's Irish Pub"] },
  { siteId: "6550b431b117fd5af385cd74", names: ["Frog", "Frog and Peach"] },
  { siteId: "66dee07febec17067adefdd1", names: ["Bull's", "Bull's Tavern"] },
  { siteId: "66dc10313c42855ad7837628", names: ["Library", "The Library"] },
  { siteId: "65e19814c653b505cd7183f3", names: ["Milestone"] },
]

async function getApiKey() {
  if (process.env.UNIFI_API_KEY?.trim()) return process.env.UNIFI_API_KEY.trim()

  const keyFile = process.env.UNIFI_API_KEY_FILE
  if (!keyFile) return null

  try {
    return (await readFile(keyFile, "utf8")).trim()
  } catch {
    return null
  }
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function getSiteConfig(organizationName: string) {
  const normalized = normalizeName(organizationName)
  return SITE_CONFIG.find((site) =>
    site.names.some((name) => normalizeName(name) === normalized),
  )
}

async function unifiFetch<T>(url: string, apiKey: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    console.error("UniFi API error", response.status, url, body.slice(0, 500))
    throw new Error(`UniFi API returned ${response.status}`)
  }

  return (await response.json()) as T
}

function mapNetwork(network: Network, wifi: WifiBroadcast[]) {
  const ipv4 = network.ipv4Configuration
  const dhcp = ipv4?.dhcpConfiguration
  const ssids = wifi
    .filter((broadcast) => broadcast.network?.networkId === network.id)
    .map((broadcast) => broadcast.name)

  return {
    id: network.id,
    name: network.name,
    vlanId: network.vlanId ?? null,
    subnet:
      ipv4?.hostIpAddress && ipv4.prefixLength !== undefined
        ? `${ipv4.hostIpAddress}/${ipv4.prefixLength}`
        : null,
    gateway: dhcp?.gatewayIpAddressOverride ?? ipv4?.hostIpAddress ?? null,
    dns: dhcp?.dnsServerIpAddressesOverride ?? [],
    dhcpStart: dhcp?.ipAddressRange?.start ?? null,
    dhcpEnd: dhcp?.ipAddressRange?.stop ?? null,
    dhcpMode: dhcp?.mode ?? null,
    dhcpLeaseSeconds: dhcp?.leaseTimeSeconds ?? null,
    management: network.management ?? null,
    isolationEnabled: network.isolationEnabled ?? null,
    internetAccessEnabled: network.internetAccessEnabled ?? null,
    mdnsForwardingEnabled: network.mdnsForwardingEnabled ?? null,
    ssids,
  }
}

async function handleZones(request: Request) {
  const url = new URL(request.url)
  const organizationId = url.searchParams.get("organizationId")
  const organizationName = url.searchParams.get("organizationName")

  if (!organizationId || !organizationName) {
    return Response.json(
      { error: "organizationId and organizationName are required" },
      { status: 400 },
    )
  }

  const apiKey = await getApiKey()
  if (!apiKey) {
    return Response.json(
      { error: "UNIFI_API_KEY or UNIFI_API_KEY_FILE is not configured" },
      { status: 503 },
    )
  }

  const siteConfig = getSiteConfig(organizationName)
  if (!siteConfig) {
    return Response.json(
      { error: `No UniFi site mapping exists for ${organizationName}` },
      { status: 404 },
    )
  }

  try {
    const cloudSites = await unifiFetch<Page<SiteManagerSite>>(
      "https://api.ui.com/v1/sites?pageSize=100",
      apiKey,
    )
    const cloudSite = cloudSites.data?.find((site) => site.siteId === siteConfig.siteId)

    if (!cloudSite?.hostId) {
      return Response.json(
        { error: `UniFi host was not found for ${organizationName}` },
        { status: 502 },
      )
    }

    const base = `https://api.ui.com/v1/connector/consoles/${encodeURIComponent(cloudSite.hostId)}/proxy/network/integration/v1`
    const localSites = await unifiFetch<Page<LocalSite>>(`${base}/sites?offset=0&limit=100`, apiKey)
    const localSite = localSites.data?.[0]

    if (!localSite) {
      return Response.json(
        { error: `UniFi Network site was not found for ${organizationName}` },
        { status: 502 },
      )
    }

    const sitePath = `${base}/sites/${encodeURIComponent(localSite.id)}`
    const [networkPage, zonePage, wifiPage] = await Promise.all([
      unifiFetch<Page<Network>>(`${sitePath}/networks?offset=0&limit=200`, apiKey),
      unifiFetch<Page<FirewallZone>>(`${sitePath}/firewall/zones?offset=0&limit=200`, apiKey),
      unifiFetch<Page<WifiBroadcast>>(`${sitePath}/wifi/broadcasts?offset=0&limit=200`, apiKey),
    ])

    const networks = networkPage.data ?? []
    const firewallZones = zonePage.data ?? []
    const wifi = wifiPage.data ?? []
    const knownNetworkIds = new Set<string>()

    const zones = firewallZones
      .map((zone) => {
        const zoneNetworks = networks.filter(
          (network) => network.zoneId === zone.id || zone.networkIds?.includes(network.id),
        )
        for (const network of zoneNetworks) knownNetworkIds.add(network.id)

        return {
          id: zone.id,
          name: zone.name,
          networks: zoneNetworks.map((network) => mapNetwork(network, wifi)),
        }
      })
      .filter((zone) => zone.networks.length > 0)

    const unassignedNetworks = networks.filter((network) => !knownNetworkIds.has(network.id))
    if (unassignedNetworks.length > 0) {
      zones.push({
        id: "unassigned",
        name: "Unassigned",
        networks: unassignedNetworks.map((network) => mapNetwork(network, wifi)),
      })
    }

    return Response.json({
      organizationId,
      organizationName,
      updatedAt: new Date().toISOString(),
      source: {
        hostId: cloudSite.hostId,
        siteId: localSite.id,
        siteName: localSite.name,
      },
      zones,
    })
  } catch (error) {
    console.error("Failed to load UniFi zones", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to reach UniFi Network API" },
      { status: 502 },
    )
  }
}

export const Route = createFileRoute("/api/zones")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleZones(request),
    },
  },
})
