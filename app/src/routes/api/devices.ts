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

const ARTWORK_SOURCES: Record<string, string> = {
  "uxg-fiber": "https://cdn.ecomm.ui.com/products/7310b331-fede-4e5f-9392-b6661ffce39f/cc4c2f12-1c52-4fbd-99b8-da3eb6422800.png",
  "usw-lite-16-poe": "https://cdn.ecomm.ui.com/products/e726eace-a772-4f12-bfad-c68baf20e51f/9ecfc657-5e31-4135-89b5-46b3537b35fc.png",
  "usw-lite-8-poe": "https://cdn.ecomm.ui.com/products/75c44878-4e73-446e-8e86-f207db6b2b7c/53b8b06b-69c7-424f-bb81-2f8405356c65.png",
  "usw-ultra-60w": "https://cdn.ecomm.ui.com/products/d1af5d9b-b74c-4881-99af-033b71ed1590/f80567f8-ba09-4a75-982d-6fd636623492.png",
  "usw-flex-2-5g-5": "https://cdn.ecomm.ui.com/products/50830d51-4d7e-47ea-92f4-11043d3d664f/c956d05e-4351-46ba-b71e-afaafa3f1144.png",
  "u-lte-backup-pro": "https://cdn.ecomm.ui.com/products/9ad9a106-7d80-49e5-81ff-80ba28fc86ad/cfd46b1c-be7c-4cda-97d5-ce25f26c320a.png",
  "u7-pro": "https://cdn.ecomm.ui.com/products/fa8dd4e4-36c8-4c79-a928-22c7bff2ce29/ab5bc8a4-6135-402e-a695-e3ea5e16d3e6.png",
  "u6-pro": "https://cdn.ecomm.ui.com/products/8e88b222-7a55-4cf0-8677-ae9b6347fe84/e16aa122-b5e5-4ffb-9f1a-27ee14d9ab3d.png",
  "u6-mesh": "https://cdn.ecomm.ui.com/products/7b8f8da5-d684-4170-be1f-71b53af8d7f9/fdce5345-80e9-4edd-bf5b-93cf9141649e.png",
  "uap-nanohd": "https://cdn.ecomm.ui.com/products/920b705b-9e11-46a4-8fa4-783e62147b1a/bd6b1ce9-a160-4504-a1ca-9d458fe488e9.png",
  "ups-tower": "https://cdn.ecomm.ui.com/products/79ba566f-afed-4047-96d5-efdaf848add3/0374750d-d450-4268-9a23-784b29c70d91.png",
  "ups-2u": "https://cdn.ecomm.ui.com/products/1674b854-0811-4d7a-a213-daa25326d903/de548757-5709-4f8f-9b0e-58846a113f99.png",
  "ucg-ultra": "https://cdn.ecomm.ui.com/products/8d2d9e4b-89f3-49a1-9c17-5d774c0067b4/2e179331-f85a-4bc9-bf3e-d00192522732.png",
  "usw-pro-24": "https://cdn.ecomm.ui.com/products/2315330e-7a37-4c6b-87df-0743d04e87ca/5281dd32-ad14-40c5-a8d0-2df56a340bae.png",
}

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
  if (device.model === "ULTEPUS" || identity.includes("lte pro") || identity.includes("lte backup pro")) return "u-lte-backup-pro"
  if (identity.includes("uxg") && identity.includes("fiber")) return "uxg-fiber"
  if (identity.includes("lite 16") || identity.includes("usw-lite-16")) return "usw-lite-16-poe"
  if (identity.includes("lite 8") || identity.includes("usw-lite-8")) return "usw-lite-8-poe"
  if (identity.includes("ultra 60w") || identity.includes("switch ultra") || device.model === "USM8P60") return "usw-ultra-60w"
  if (identity.includes("flex 2.5g") || identity.includes("flex mini 2.5g")) return "usw-flex-2-5g-5"
  if (device.model === "U7PRO" || cloudDevice?.model === "U7 Pro" || identity.includes("u7 pro")) return "u7-pro"
  if (identity.includes("u6 pro")) return "u6-pro"
  if (identity.includes("u6 mesh")) return "u6-mesh"
  if (identity.includes("nanohd")) return "uap-nanohd"
  if (identity.includes("ups tower")) return "ups-tower"
  if (identity.includes("ups 2u")) return "ups-2u"
  if (identity.includes("ucg ultra") || identity.includes("udrult") || device.model === "UDRULT") return "ucg-ultra"
  if (identity.includes("pro 24") || identity.includes("us24pro") || device.model === "US24PRO2") return "usw-pro-24"
  return null
}

function artworkUrl(device: LegacyDevice, cloudDevice?: SiteManagerDevice) {
  const key = artworkKey(device, cloudDevice)
  return key ? ARTWORK_SOURCES[key] ?? null : null
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
