import { readFile } from "node:fs/promises"
import { createFileRoute } from "@tanstack/react-router"

type SiteManagerSite = { siteId?: string; hostId?: string }
type LocalSite = { id: string; name: string; internalReference?: string }
type Page<T> = { data?: T[] }
type ListResponse<T> = Page<T> | T[]
type SiteConfig = { siteId: string; names: string[] }

type FirewallZone = { id: string; name: string; networkIds?: string[] }
type Network = {
  id: string
  zoneId?: string
  ipv4Configuration?: { hostIpAddress?: string; prefixLength?: number }
}
type TrafficFilter = {
  type?: string
  ipAddressFilter?: {
    type?: string
    matchOpposite?: boolean
    items?: Array<{ type?: string; value?: string }>
  }
}
type FirewallPolicy = {
  id: string
  name: string
  enabled?: boolean
  index?: number
  action?: { type?: string; allowReturnTraffic?: boolean }
  source?: { zoneId?: string; trafficFilter?: TrafficFilter }
  destination?: { zoneId?: string; trafficFilter?: TrafficFilter }
  ipProtocolScope?: { ipVersion?: string; protocolFilter?: unknown }
}
type LegacyNetwork = {
  name?: string
  purpose?: string
  wan_networkgroup?: string
  wan_load_balance_type?: string
  wan_failover_priority?: number
  wan_smartq_enabled?: boolean
  wan_provider_capabilities?: {
    upload_kilobits_per_second?: number
    download_kilobits_per_second?: number
  }
}
type TrafficRule = {
  _id?: string
  id?: string
  enabled?: boolean
  description?: string
  name?: string
  network_ids?: string[]
  matching_target?: string
  bandwidth_limit?: {
    download_limit_kbps?: number
    upload_limit_kbps?: number
  }
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
  return SITE_CONFIG.find((site) => site.names.some((name) => normalizeName(name) === normalized))
}

async function unifiFetch<T>(url: string, apiKey: string) {
  const response = await fetch(url, { headers: { Accept: "application/json", "X-API-Key": apiKey } })
  if (!response.ok) {
    const body = await response.text()
    console.error("UniFi API error", response.status, url, body.slice(0, 500))
    throw new Error(`UniFi API returned ${response.status}`)
  }
  return (await response.json()) as T
}

function listData<T>(response: ListResponse<T>) {
  return Array.isArray(response) ? response : response.data ?? []
}

function connectorRoot(hostId: string) {
  return `https://api.ui.com/v1/connector/consoles/${encodeURIComponent(hostId)}/proxy/network`
}
function connectorBase(hostId: string) {
  return `${connectorRoot(hostId)}/integration/v1`
}

async function resolveNetworkHost(sites: SiteManagerSite[], siteConfig: SiteConfig, apiKey: string) {
  const candidates = sites.filter(
    (site): site is SiteManagerSite & { hostId: string } => site.siteId === siteConfig.siteId && Boolean(site.hostId),
  )
  for (const candidate of candidates) {
    try {
      const localSites = await unifiFetch<Page<LocalSite>>(
        `${connectorBase(candidate.hostId)}/sites?offset=0&limit=100`,
        apiKey,
      )
      const localSite = localSites.data?.[0]
      if (localSite) return { hostId: candidate.hostId, localSite }
    } catch (error) {
      console.warn("Skipping unavailable UniFi console", candidate.hostId, error)
    }
  }
  return null
}

function ipv4NetworkCidr(address: string, prefixLength: number) {
  const octets = address.split(".").map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
  const value = (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
  const network = (value & mask) >>> 0
  const parts = [24, 16, 8, 0].map((shift) => (network >>> shift) & 0xff)
  return `${parts.join(".")}/${prefixLength}`
}

function sourceFilterApplies(filter: TrafficFilter | undefined, sourceCidrs: Set<string>) {
  if (!filter) return true
  const ipFilter = filter.ipAddressFilter
  if (!ipFilter?.items?.length) return true
  const listedSource = ipFilter.items.some((item) => item.type === "SUBNET" && item.value && sourceCidrs.has(item.value))
  return ipFilter.matchOpposite ? !listedSource : listedSource
}
function isInvalidTrafficPolicy(policy: FirewallPolicy) {
  return policy.name.toLowerCase() === "block invalid traffic"
}
function isPrimaryWan(network: LegacyNetwork) {
  if (network.purpose !== "wan" || network.wan_load_balance_type === "failover-only") return false
  return network.wan_networkgroup === "WAN" || network.wan_failover_priority === 1
}
function ruleTargetsSelectedNetwork(rule: TrafficRule, networkIds: Set<string>) {
  if (rule.enabled === false) return false
  return rule.network_ids?.some((networkId) => networkIds.has(networkId)) ?? false
}

async function handleToastPolicy(request: Request) {
  const url = new URL(request.url)
  const organizationName = url.searchParams.get("organizationName")
  const zoneId = url.searchParams.get("zoneId")
  if (!organizationName || !zoneId) return Response.json({ error: "organizationName and zoneId are required" }, { status: 400 })

  const apiKey = await getApiKey()
  if (!apiKey) return Response.json({ error: "UNIFI_API_KEY or UNIFI_API_KEY_FILE is not configured" }, { status: 503 })
  const siteConfig = getSiteConfig(organizationName)
  if (!siteConfig) return Response.json({ error: `No UniFi site mapping exists for ${organizationName}` }, { status: 404 })

  try {
    const cloudSites = await unifiFetch<Page<SiteManagerSite>>("https://api.ui.com/v1/sites?pageSize=100", apiKey)
    const resolved = await resolveNetworkHost(cloudSites.data ?? [], siteConfig, apiKey)
    if (!resolved) return Response.json({ error: `No online UniFi Network console was found for ${organizationName}` }, { status: 502 })

    const sitePath = `${connectorBase(resolved.hostId)}/sites/${encodeURIComponent(resolved.localSite.id)}`
    const [zonePage, policyPage, networkPage] = await Promise.all([
      unifiFetch<Page<FirewallZone>>(`${sitePath}/firewall/zones?offset=0&limit=200`, apiKey),
      unifiFetch<Page<FirewallPolicy>>(`${sitePath}/firewall/policies?offset=0&limit=500`, apiKey),
      unifiFetch<Page<Network>>(`${sitePath}/networks?offset=0&limit=200`, apiKey),
    ])

    const zones = zonePage.data ?? []
    const selectedZone = zones.find((zone) => zone.id === zoneId)
    const externalZone = zones.find((zone) => zone.name.toLowerCase() === "external")
    if (!selectedZone || !externalZone) return Response.json({ error: "Selected or External UniFi firewall zone was not found" }, { status: 404 })

    const networkIds = new Set(selectedZone.networkIds ?? [])
    for (const network of networkPage.data ?? []) if (network.zoneId === selectedZone.id) networkIds.add(network.id)
    const networkSummaries = (networkPage.data ?? []).filter((network) => networkIds.has(network.id))
    const networkDetails = await Promise.all(
      networkSummaries.map((network) => unifiFetch<Network>(`${sitePath}/networks/${encodeURIComponent(network.id)}`, apiKey)),
    )
    const sourceCidrs = new Set(networkDetails.flatMap((network) => {
      const ipv4 = network.ipv4Configuration
      if (!ipv4?.hostIpAddress || ipv4.prefixLength === undefined) return []
      const cidr = ipv4NetworkCidr(ipv4.hostIpAddress, ipv4.prefixLength)
      return cidr ? [cidr] : []
    }))

    const policies = (policyPage.data ?? []).filter((policy) => policy.enabled !== false)
    const outboundPolicies = policies.filter((policy) =>
      policy.source?.zoneId === selectedZone.id && policy.destination?.zoneId === externalZone.id &&
      sourceFilterApplies(policy.source.trafficFilter, sourceCidrs),
    ).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const returnPolicies = policies.filter((policy) =>
      policy.source?.zoneId === externalZone.id && policy.destination?.zoneId === selectedZone.id,
    ).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const restrictingOutboundPolicies = outboundPolicies.filter((policy) => policy.action?.type === "BLOCK" && !isInvalidTrafficPolicy(policy))
    const outboundAllowAll = outboundPolicies.some((policy) =>
      policy.action?.type === "ALLOW" && !policy.source?.trafficFilter && !policy.destination?.trafficFilter && !policy.ipProtocolScope?.protocolFilter,
    )
    const returnTrafficAllowed = returnPolicies.some((policy) => policy.action?.type === "ALLOW" && policy.action.allowReturnTraffic === true)
    const unrestrictedOutbound = outboundAllowAll && restrictingOutboundPolicies.length === 0
    const icmpEchoRepliesUnrestricted = unrestrictedOutbound && returnTrafficAllowed

    const localSite = encodeURIComponent(resolved.localSite.internalReference || "default")
    const localBase = connectorRoot(resolved.hostId)
    const [legacyNetworkResponse, trafficRuleResponse] = await Promise.all([
      unifiFetch<ListResponse<LegacyNetwork>>(`${localBase}/api/s/${localSite}/rest/networkconf`, apiKey),
      unifiFetch<ListResponse<TrafficRule>>(`${localBase}/v2/api/site/${localSite}/trafficrules`, apiKey),
    ])
    const legacyNetworks = listData(legacyNetworkResponse)
    const trafficRules = listData(trafficRuleResponse)
    const primaryWan = legacyNetworks.find(isPrimaryWan) ?? legacyNetworks.find((network) =>
      network.purpose === "wan" && network.wan_load_balance_type !== "failover-only",
    ) ?? null
    const activeTrafficRules = trafficRules.filter((rule) => rule.enabled !== false)
    const toastTrafficRules = activeTrafficRules.filter((rule) => ruleTargetsSelectedNetwork(rule, networkIds))
    const wanCapabilities = primaryWan?.wan_provider_capabilities
    const wanDownloadMbps = wanCapabilities?.download_kilobits_per_second !== undefined
      ? wanCapabilities.download_kilobits_per_second / 1000
      : null
    const wanUploadMbps = wanCapabilities?.upload_kilobits_per_second !== undefined
      ? wanCapabilities.upload_kilobits_per_second / 1000
      : null

    return Response.json({
      zoneId: selectedZone.id,
      zoneName: selectedZone.name,
      sourceCidrs: [...sourceCidrs],
      unrestrictedOutbound,
      returnTrafficAllowed,
      icmpEchoRepliesUnrestricted,
      toastFirewallAllowlistReachable: unrestrictedOutbound,
      qos: {
        configuredForToast: toastTrafficRules.length > 0,
        activeTrafficRuleCount: activeTrafficRules.length,
        toastTrafficRuleCount: toastTrafficRules.length,
        smartQueuesEnabled: primaryWan?.wan_smartq_enabled ?? null,
        wanName: primaryWan?.name ?? null,
        wanDownloadMbps,
        wanUploadMbps,
        recommendedDownloadMbps: 15,
        recommendedUploadMbps: 5,
      },
      evidence: {
        outboundPolicies: outboundPolicies.map((policy) => ({ name: policy.name, index: policy.index ?? null, action: policy.action?.type ?? null })),
        returnPolicies: returnPolicies.map((policy) => ({ name: policy.name, index: policy.index ?? null, action: policy.action?.type ?? null, allowReturnTraffic: policy.action?.allowReturnTraffic ?? false })),
        restrictingOutboundPolicies: restrictingOutboundPolicies.map((policy) => policy.name),
        toastTrafficRules: toastTrafficRules.map((rule) => ({
          id: rule._id ?? rule.id ?? null,
          name: rule.description ?? rule.name ?? "Traffic rule",
          bandwidthLimit: rule.bandwidth_limit ?? null,
        })),
      },
    })
  } catch (error) {
    console.error("Failed to evaluate Toast firewall and QoS policy", error)
    return Response.json({ error: error instanceof Error ? error.message : "Unable to reach UniFi Network API" }, { status: 502 })
  }
}

export const Route = createFileRoute("/api/toast-policy")({
  server: { handlers: { GET: async ({ request }) => await handleToastPolicy(request) } },
})
