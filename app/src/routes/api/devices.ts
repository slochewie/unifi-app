import { readFile } from "node:fs/promises"
import { createFileRoute } from "@tanstack/react-router"

type UidbInfo = { guid?: string | null; images?: { default?: string; nopadding?: string; topology?: string } }
type SiteManagerSite = { siteId?: string; hostId?: string }
type SiteManagerDevice = { mac?: string; name?: string; model?: string; productLine?: string; uidb?: UidbInfo }
type SiteManagerDeviceGroup = { hostId?: string; devices?: SiteManagerDevice[] }
type LegacyDevice = {
  _id?: string; mac?: string; name?: string; model?: string; type?: string; sysid?: number; ip?: string; lan_ip?: string
  version?: string; displayable_version?: string; state?: number; upgradable?: boolean; adopted?: boolean
  uplink?: { uplink_device_name?: string; uplink_device_mac?: string; uplink_remote_port?: number }
}
type LegacyResponse<T> = { data?: T[] }
type Page<T> = { data?: T[] }
type HostResponse = { data?: { id?: string; reportedState?: { state?: string; ip?: string; mac?: string; version?: string; deviceState?: string; firmwareUpdate?: { latestAvailableVersion?: string | null }; hardware?: { name?: string; shortname?: string; firmwareVersion?: string; mac?: string }; uidb?: UidbInfo } } }
type SiteConfig = { siteId: string; name: string; cloudKeyHostId?: string }

const SITE_CONFIG: SiteConfig[] = [
  { siteId: "60b95da3e03dd800f8e1ab9a", name: "McCarthy's", cloudKeyHostId: "28704E3574670000000008290C09000000000897CA3900000000668829EF:2118761067" },
  { siteId: "6550b431b117fd5af385cd74", name: "Frog", cloudKeyHostId: "28704E3576A7000000000826EF6A00000000089596090000000066827DCA:1369073404" },
  { siteId: "66dee07febec17067adefdd1", name: "Bull's", cloudKeyHostId: "0CEA14F51A6B0000000008AF2495000000000926042100000000678CE75D:429262519" },
  { siteId: "66dc10313c42855ad7837628", name: "Library", cloudKeyHostId: "28704E3564FD0000000008284BAC0000000008975D5D0000000066876953:2082695613" },
  { siteId: "65e19814c653b505cd7183f3", name: "Milestone" },
]

const MODEL_NAMES: Record<string, string> = { UXGA6AA: "Cloud Gateway Fiber", UDRULT: "UDR Ultra", UCKP: "CloudKey+" }

async function getApiKey() {
  if (process.env.UNIFI_API_KEY?.trim()) return process.env.UNIFI_API_KEY.trim()
  const keyFile = process.env.UNIFI_API_KEY_FILE
  if (!keyFile) return null
  try { return (await readFile(keyFile, "utf8")).trim() } catch { return null }
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

function connectorNetworkBase(hostId: string) {
  return `https://api.ui.com/v1/connector/consoles/${encodeURIComponent(hostId)}/proxy/network`
}

function artworkKey(device: LegacyDevice, cloudDevice?: SiteManagerDevice) {
  const identity = [device.model, device.name, cloudDevice?.model, cloudDevice?.name].filter(Boolean).join(" ").toLowerCase()
  if (identity.includes("uxg") && identity.includes("fiber")) return "uxg-fiber"
  if (identity.includes("lite 16") || identity.includes("usw-lite-16")) return "usw-lite-16-poe"
  if (identity.includes("lite 8") || identity.includes("usw-lite-8")) return "usw-lite-8-poe"
  if (identity.includes("ultra 60w")) return "usw-ultra-60w"
  if (identity.includes("flex 2.5g") || identity.includes("flex mini 2.5g")) return "usw-flex-2-5g-5"
  if (identity.includes("u7 pro")) return "u7-pro"
  if (identity.includes("u6 pro")) return "u6-pro"
  if (identity.includes("u6 mesh")) return "u6-mesh"
  if (identity.includes("nanohd")) return "uap-nanohd"
  if (identity.includes("ups tower")) return "ups-tower"
  if (identity.includes("ups 2u")) return "ups-2u"
  if (identity.includes("ucg ultra") || identity.includes("udrult")) return "ucg-ultra"
  if (identity.includes("pro 24") || identity.includes("us24pro")) return "usw-pro-24"
  return null
}

function artworkUrl(device: LegacyDevice, cloudDevice?: SiteManagerDevice) {
  const key = artworkKey(device, cloudDevice)
  return key ? `/api/device-image?key=${encodeURIComponent(key)}` : null
}

function deviceCategory(type?: string, productLine?: string, model?: string) {
  if (model === "ULTEPUS") return "lte"
  if (model === "USWDA23" || model === "USWDA25") return "ups"
  const product = productLine?.toLowerCase() ?? ""
  if (product.includes("gateway")) return "gateway"
  if (product.includes("access point") || product.includes("wifi")) return "access-point"
  if (product.includes("switch")) return "switch"
  if (type === "ugw" || type === "uxg" || type === "udm") return "gateway"
  if (type === "uap") return "access-point"
  if (type === "usw") return "switch"
  return "other"
}

function mapDevice(device: LegacyDevice, cloudDevice?: SiteManagerDevice) {
  const category = deviceCategory(device.type, cloudDevice?.productLine, device.model)
  return {
    id: device._id ?? device.mac ?? `${device.model ?? "device"}-${device.ip ?? "unknown"}`,
    name: device.name?.trim() || MODEL_NAMES[device.model ?? ""] || device.model || "UniFi Device",
    model: MODEL_NAMES[device.model ?? ""] ?? device.model ?? "Unknown model",
    category,
    ipAddress: category === "gateway" ? device.lan_ip ?? device.ip ?? null : device.ip ?? device.lan_ip ?? null,
    macAddress: device.mac ?? null,
    firmwareVersion: device.displayable_version ?? device.version ?? null,
    firmwareStatus: device.upgradable === true ? "update-available" : device.upgradable === false ? "up-to-date" : "unknown",
    state: device.state ?? null,
    online: device.state === 1,
    adopted: device.adopted ?? null,
    uplink: device.uplink?.uplink_device_name ? { name: device.uplink.uplink_device_name, macAddress: device.uplink.uplink_device_mac ?? null, port: device.uplink.uplink_remote_port ?? null } : null,
    imageUrl: artworkUrl(device, cloudDevice),
  }
}

function mapCloudKey(host: NonNullable<HostResponse["data"]>, cloudDevice?: SiteManagerDevice) {
  const state = host.reportedState
  const hardware = state?.hardware
  const mac = hardware?.mac ?? state?.mac ?? cloudDevice?.mac ?? null
  const updateAvailable = state?.deviceState === "updateAvailable"
  return {
    id: `console-${host.id ?? mac ?? "cloudkey"}`, name: "UCK G2 Plus", model: "CloudKey+", category: "console" as const,
    ipAddress: state?.ip ?? null, macAddress: mac, firmwareVersion: hardware?.firmwareVersion ?? state?.version ?? null,
    firmwareStatus: updateAvailable ? ("update-available" as const) : state?.firmwareUpdate?.latestAvailableVersion ? ("up-to-date" as const) : ("unknown" as const),
    state: null, online: state?.state === "connected", adopted: null, uplink: null, imageUrl: null,
  }
}

function cloudDeviceFor(device: LegacyDevice, devices: SiteManagerDevice[]) {
  const mac = device.mac?.replace(/:/g, "").toLowerCase()
  if (mac) {
    const byMac = devices.find((candidate) => candidate.mac?.replace(/:/g, "").toLowerCase() === mac)
    if (byMac) return byMac
  }
  return devices.find((candidate) => candidate.model === device.model)
}

function consoleDeviceFor(devices: SiteManagerDevice[]) {
  return devices.find((device) => device.model?.toLowerCase().includes("uck"))
}

async function loadCloudKey(site: SiteConfig, cloudDevices: SiteManagerDevice[], apiKey: string) {
  if (!site.cloudKeyHostId) return null
  try {
    const response = await unifiFetch<HostResponse>(`https://api.ui.com/v1/hosts/${encodeURIComponent(site.cloudKeyHostId)}`, apiKey)
    return response.data ? mapCloudKey(response.data, consoleDeviceFor(cloudDevices)) : null
  } catch (error) {
    console.warn("Unable to load UniFi console inventory record", site.cloudKeyHostId, error)
    return null
  }
}

async function loadSiteDevices(site: SiteConfig, cloudSites: SiteManagerSite[], cloudDeviceGroups: SiteManagerDeviceGroup[], apiKey: string) {
  const candidates = cloudSites.filter((candidate): candidate is SiteManagerSite & { hostId: string } => candidate.siteId === site.siteId && Boolean(candidate.hostId))
  for (const candidate of candidates) {
    try {
      const cloudDevices = cloudDeviceGroups.find((group) => group.hostId === candidate.hostId)?.devices ?? []
      const [response, cloudKey] = await Promise.all([
        unifiFetch<LegacyResponse<LegacyDevice>>(`${connectorNetworkBase(candidate.hostId)}/api/s/default/stat/device`, apiKey),
        loadCloudKey(site, cloudDevices, apiKey),
      ])
      return { id: site.siteId, name: site.name, available: true, devices: [...(response.data ?? []).map((device) => mapDevice(device, cloudDeviceFor(device, cloudDevices))), ...(cloudKey ? [cloudKey] : [])] }
    } catch (error) { console.warn("Skipping unavailable UniFi console", candidate.hostId, error) }
  }
  return { id: site.siteId, name: site.name, available: false, devices: [] }
}

async function handleDevices() {
  const apiKey = await getApiKey()
  if (!apiKey) return Response.json({ error: "UNIFI_API_KEY or UNIFI_API_KEY_FILE is not configured" }, { status: 503 })
  try {
    const [cloudSites, cloudDevices] = await Promise.all([
      unifiFetch<Page<SiteManagerSite>>("https://api.ui.com/v1/sites?pageSize=100", apiKey),
      unifiFetch<Page<SiteManagerDeviceGroup>>("https://api.ui.com/v1/devices?pageSize=200", apiKey),
    ])
    const sites = await Promise.all(SITE_CONFIG.map((site) => loadSiteDevices(site, cloudSites.data ?? [], cloudDevices.data ?? [], apiKey)))
    return Response.json({ updatedAt: new Date().toISOString(), sites })
  } catch (error) {
    console.error("Failed to load UniFi devices", error)
    return Response.json({ error: error instanceof Error ? error.message : "Unable to reach UniFi Network API" }, { status: 502 })
  }
}

export const Route = createFileRoute("/api/devices")({ server: { handlers: { GET: async () => await handleDevices() } } })
