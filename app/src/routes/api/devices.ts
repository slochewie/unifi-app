import { readFile } from "node:fs/promises"
import { createFileRoute } from "@tanstack/react-router"

type SiteManagerSite = {
  siteId?: string
  hostId?: string
}

type LegacyDevice = {
  _id?: string
  mac?: string
  name?: string
  model?: string
  type?: string
  ip?: string
  lan_ip?: string
  version?: string
  displayable_version?: string
  state?: number
  upgradable?: boolean
  adopted?: boolean
  uplink?: {
    uplink_device_name?: string
    uplink_device_mac?: string
    uplink_remote_port?: number
  }
}

type LegacyResponse<T> = { data?: T[] }
type Page<T> = { data?: T[] }

type SiteConfig = {
  siteId: string
  name: string
}

const SITE_CONFIG: SiteConfig[] = [
  { siteId: "60b95da3e03dd800f8e1ab9a", name: "McCarthy's" },
  { siteId: "6550b431b117fd5af385cd74", name: "Frog" },
  { siteId: "66dee07febec17067adefdd1", name: "Bull's" },
  { siteId: "66dc10313c42855ad7837628", name: "Library" },
  { siteId: "65e19814c653b505cd7183f3", name: "Milestone" },
]

const MODEL_NAMES: Record<string, string> = {
  UXGA6AA: "Cloud Gateway Fiber",
  UDRULT: "UDR Ultra",
  UCKP: "CloudKey+",
}

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

function deviceCategory(type?: string) {
  if (type === "ugw" || type === "uxg" || type === "udm") return "gateway"
  if (type === "uap") return "access-point"
  if (type === "usw") return "switch"
  return "other"
}

function mapDevice(device: LegacyDevice) {
  const category = deviceCategory(device.type)

  return {
    id: device._id ?? device.mac ?? `${device.model ?? "device"}-${device.ip ?? "unknown"}`,
    name: device.name?.trim() || MODEL_NAMES[device.model ?? ""] || device.model || "UniFi Device",
    model: MODEL_NAMES[device.model ?? ""] ?? device.model ?? "Unknown model",
    category,
    ipAddress: category === "gateway" ? device.lan_ip ?? device.ip ?? null : device.ip ?? device.lan_ip ?? null,
    macAddress: device.mac ?? null,
    firmwareVersion: device.displayable_version ?? device.version ?? null,
    firmwareStatus:
      device.upgradable === true
        ? "update-available"
        : device.upgradable === false
          ? "up-to-date"
          : "unknown",
    state: device.state ?? null,
    online: device.state === 1,
    adopted: device.adopted ?? null,
    uplink: device.uplink?.uplink_device_name
      ? {
          name: device.uplink.uplink_device_name,
          macAddress: device.uplink.uplink_device_mac ?? null,
          port: device.uplink.uplink_remote_port ?? null,
        }
      : null,
  }
}

async function loadSiteDevices(site: SiteConfig, cloudSites: SiteManagerSite[], apiKey: string) {
  const candidates = cloudSites.filter(
    (candidate): candidate is SiteManagerSite & { hostId: string } =>
      candidate.siteId === site.siteId && Boolean(candidate.hostId),
  )

  for (const candidate of candidates) {
    try {
      const response = await unifiFetch<LegacyResponse<LegacyDevice>>(
        `${connectorNetworkBase(candidate.hostId)}/api/s/default/stat/device`,
        apiKey,
      )

      return {
        id: site.siteId,
        name: site.name,
        available: true,
        devices: (response.data ?? []).map(mapDevice),
      }
    } catch (error) {
      console.warn("Skipping unavailable UniFi console", candidate.hostId, error)
    }
  }

  return {
    id: site.siteId,
    name: site.name,
    available: false,
    devices: [],
  }
}

async function handleDevices() {
  const apiKey = await getApiKey()
  if (!apiKey) {
    return Response.json(
      { error: "UNIFI_API_KEY or UNIFI_API_KEY_FILE is not configured" },
      { status: 503 },
    )
  }

  try {
    const cloudSites = await unifiFetch<Page<SiteManagerSite>>(
      "https://api.ui.com/v1/sites?pageSize=100",
      apiKey,
    )

    const sites = await Promise.all(
      SITE_CONFIG.map((site) => loadSiteDevices(site, cloudSites.data ?? [], apiKey)),
    )

    return Response.json({ updatedAt: new Date().toISOString(), sites })
  } catch (error) {
    console.error("Failed to load UniFi devices", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to reach UniFi Network API" },
      { status: 502 },
    )
  }
}

export const Route = createFileRoute("/api/devices")({
  server: {
    handlers: {
      GET: async () => await handleDevices(),
    },
  },
})
