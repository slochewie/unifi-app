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

type LegacyNetwork = {
  _id?: string
  external_id?: string
  mdns_enabled?: boolean
  network_isolation_enabled?: boolean
  internet_access_enabled?: boolean
}

type LegacyWlan = {
  _id?: string
  external_id?: string
  name?: string
  enabled?: boolean
  networkconf_id?: string
  wlan_bands?: string[]
  wlan_band?: string
  l2_isolation?: boolean
  mcastenhance_enabled?: boolean
  wpa_mode?: string
  wpa_enc?: string
}

type LegacyClient = {
  mac?: string
  hostname?: string
  name?: string
  ip?: string
  last_ip?: string
  is_wired?: boolean
  network_id?: string
  last_connection_network_id?: string
  essid?: string
  signal?: number
  ap_mac?: string
  sw_mac?: string
  sw_port?: number
  last_uplink_name?: string
  qos_policy_applied?: boolean
}

type LegacyResponse<T> = {
  data?: T[]
}

type Page<T> = {
  data?: T[]
}

type SiteConfig = {
  siteId: string
  names: string[]
}

type LegacyData = {
  networks: LegacyNetwork[]
  wlans: LegacyWlan[]
  clients: LegacyClient[]
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

function connectorNetworkBase(hostId: string) {
  return `https://api.ui.com/v1/connector/consoles/${encodeURIComponent(hostId)}/proxy/network`
}

function connectorBase(hostId: string) {
  return `${connectorNetworkBase(hostId)}/integration/v1`
}

async function resolveNetworkHost(
  sites: SiteManagerSite[],
  siteConfig: SiteConfig,
  apiKey: string,
) {
  const candidates = sites.filter(
    (site): site is SiteManagerSite & { hostId: string } =>
      site.siteId === siteConfig.siteId && Boolean(site.hostId),
  )

  for (const candidate of candidates) {
    try {
      const localSites = await unifiFetch<Page<LocalSite>>(
        `${connectorBase(candidate.hostId)}/sites?offset=0&limit=100`,
        apiKey,
      )
      const localSite = localSites.data?.[0]
      if (localSite) return { cloudSite: candidate, localSite }
    } catch (error) {
      console.warn("Skipping unavailable UniFi console", candidate.hostId, error)
    }
  }

  return null
}

async function loadLegacyData(hostId: string, localSite: LocalSite, apiKey: string) {
  const siteReference = localSite.internalReference || "default"
  const base = `${connectorNetworkBase(hostId)}/api/s/${encodeURIComponent(siteReference)}`

  try {
    const [networkResponse, wlanResponse, clientResponse] = await Promise.all([
      unifiFetch<LegacyResponse<LegacyNetwork>>(`${base}/rest/networkconf`, apiKey),
      unifiFetch<LegacyResponse<LegacyWlan>>(`${base}/rest/wlanconf`, apiKey),
      unifiFetch<LegacyResponse<LegacyClient>>(`${base}/stat/sta`, apiKey),
    ])

    return {
      networks: networkResponse.data ?? [],
      wlans: wlanResponse.data ?? [],
      clients: clientResponse.data ?? [],
    } satisfies LegacyData
  } catch (error) {
    console.warn("Unable to load enriched UniFi controller data", error)
    return { networks: [], wlans: [], clients: [] } satisfies LegacyData
  }
}

function legacyBands(wlan: LegacyWlan) {
  if (wlan.wlan_bands?.length) {
    return wlan.wlan_bands.flatMap((band) => band === "2g" ? [2.4] : band === "5g" ? [5] : band === "6g" ? [6] : [])
  }

  if (wlan.wlan_band === "both") return [2.4, 5]
  if (wlan.wlan_band === "2g") return [2.4]
  if (wlan.wlan_band === "5g") return [5]
  if (wlan.wlan_band === "6g") return [6]
  return []
}

function legacySecurityType(wlan: LegacyWlan) {
  if (wlan.wpa_mode === "wpa2" && wlan.wpa_enc === "ccmp") return "WPA2_AES_PERSONAL"
  if (wlan.wpa_mode === "wpa2") return "WPA2_PERSONAL"
  return wlan.wpa_mode?.toUpperCase() ?? null
}

function mapNetwork(network: Network, wifi: WifiBroadcast[], legacy: LegacyData) {
  const ipv4 = network.ipv4Configuration
  const dhcp = ipv4?.dhcpConfiguration
  const legacyNetwork = legacy.networks.find((candidate) => candidate.external_id === network.id)
  const legacyNetworkId = legacyNetwork?._id
  const legacyWlans = legacyNetworkId
    ? legacy.wlans.filter((wlan) => wlan.networkconf_id === legacyNetworkId)
    : []
  const integrationWifi = wifi.filter((broadcast) => broadcast.network?.networkId === network.id)
  const legacyWlanByExternalId = new Map(
    legacyWlans.filter((wlan) => wlan.external_id).map((wlan) => [wlan.external_id, wlan]),
  )
  const integrationIds = new Set(integrationWifi.map((broadcast) => broadcast.id))

  const wifiBroadcasts = integrationWifi.map((broadcast) => {
    const legacyWlan = legacyWlanByExternalId.get(broadcast.id)
    return {
      id: broadcast.id,
      name: broadcast.name,
      enabled: broadcast.enabled ?? legacyWlan?.enabled ?? null,
      frequenciesGHz:
        legacyWlan && legacyBands(legacyWlan).length > 0
          ? legacyBands(legacyWlan)
          : broadcast.broadcastingFrequenciesGHz ?? [],
      clientIsolationEnabled:
        legacyWlan?.l2_isolation ?? broadcast.clientIsolationEnabled ?? null,
      multicastToUnicastConversionEnabled:
        legacyWlan?.mcastenhance_enabled ??
        broadcast.multicastToUnicastConversionEnabled ??
        null,
      securityType:
        legacyWlan ? legacySecurityType(legacyWlan) : broadcast.securityConfiguration?.type ?? null,
    }
  })

  for (const wlan of legacyWlans) {
    if (wlan.external_id && integrationIds.has(wlan.external_id)) continue
    if (!wlan._id || !wlan.name) continue
    wifiBroadcasts.push({
      id: wlan.external_id ?? wlan._id,
      name: wlan.name,
      enabled: wlan.enabled ?? null,
      frequenciesGHz: legacyBands(wlan),
      clientIsolationEnabled: wlan.l2_isolation ?? null,
      multicastToUnicastConversionEnabled: wlan.mcastenhance_enabled ?? null,
      securityType: legacySecurityType(wlan),
    })
  }

  const clients = legacyNetworkId
    ? legacy.clients
        .filter((client) =>
          client.network_id === legacyNetworkId || client.last_connection_network_id === legacyNetworkId,
        )
        .map((client) => ({
          mac: client.mac ?? null,
          name: client.hostname ?? client.name ?? null,
          ipAddress: client.ip ?? client.last_ip ?? null,
          wired: client.is_wired ?? null,
          ssid: client.essid ?? null,
          signalDbm: client.signal ?? null,
          accessPointMac: client.ap_mac ?? null,
          switchMac: client.sw_mac ?? null,
          switchPort: client.sw_port ?? null,
          uplinkName: client.last_uplink_name ?? null,
          qosPolicyApplied: client.qos_policy_applied ?? null,
        }))
    : []

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
    isolationEnabled: legacyNetwork?.network_isolation_enabled ?? network.isolationEnabled ?? null,
    internetAccessEnabled:
      legacyNetwork?.internet_access_enabled ?? network.internetAccessEnabled ?? null,
    mdnsEnabled: legacyNetwork?.mdns_enabled ?? null,
    mdnsForwardingEnabled: network.mdnsForwardingEnabled ?? null,
    ssids: wifiBroadcasts.map((broadcast) => broadcast.name),
    wifiBroadcasts,
    clients,
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
    const resolved = await resolveNetworkHost(cloudSites.data ?? [], siteConfig, apiKey)

    if (!resolved) {
      return Response.json(
        { error: `No online UniFi Network console was found for ${organizationName}` },
        { status: 502 },
      )
    }

    const { cloudSite, localSite } = resolved
    const base = connectorBase(cloudSite.hostId)
    const sitePath = `${base}/sites/${encodeURIComponent(localSite.id)}`
    const [networkPage, zonePage, wifiPage, legacy] = await Promise.all([
      unifiFetch<Page<Network>>(`${sitePath}/networks?offset=0&limit=200`, apiKey),
      unifiFetch<Page<FirewallZone>>(`${sitePath}/firewall/zones?offset=0&limit=200`, apiKey),
      unifiFetch<Page<WifiBroadcast>>(`${sitePath}/wifi/broadcasts?offset=0&limit=200`, apiKey),
      loadLegacyData(cloudSite.hostId, localSite, apiKey),
    ])

    const networkSummaries = networkPage.data ?? []
    const networks = await Promise.all(
      networkSummaries.map((network) =>
        unifiFetch<Network>(
          `${sitePath}/networks/${encodeURIComponent(network.id)}`,
          apiKey,
        ),
      ),
    )
    const firewallZones = zonePage.data ?? []
    const wifi = wifiPage.data ?? []
    const knownNetworkIds = new Set<string>()

    const zones = firewallZones.map((zone) => {
      const zoneNetworks = networks.filter(
        (network) => network.zoneId === zone.id || zone.networkIds?.includes(network.id),
      )
      for (const network of zoneNetworks) knownNetworkIds.add(network.id)

      return {
        id: zone.id,
        name: zone.name,
        networks: zoneNetworks.map((network) => mapNetwork(network, wifi, legacy)),
      }
    })

    const unassignedNetworks = networks.filter((network) => !knownNetworkIds.has(network.id))
    if (unassignedNetworks.length > 0) {
      zones.push({
        id: "unassigned",
        name: "Unassigned",
        networks: unassignedNetworks.map((network) => mapNetwork(network, wifi, legacy)),
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
