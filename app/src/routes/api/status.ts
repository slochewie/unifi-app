import { readFile } from "node:fs/promises"
import { createFileRoute } from "@tanstack/react-router"

type UnifiSite = {
  siteId?: string
  hostId?: string
  statistics?: {
    counts?: Record<string, number>
    gateway?: {
      shortname?: string
    }
    internetIssues?: unknown[]
    percentages?: {
      wanUptime?: number
    }
  }
}

type SiteConfig = {
  siteId: string
  name: string
  publicIp: string
  lteFailover: "Ready" | "Unavailable"
}

const SITE_CONFIG: SiteConfig[] = [
  {
    siteId: "60b95da3e03dd800f8e1ab9a",
    name: "McCarthy's",
    publicIp: "47.47.80.3",
    lteFailover: "Ready",
  },
  {
    siteId: "6550b431b117fd5af385cd74",
    name: "Frog",
    publicIp: "47.47.78.130",
    lteFailover: "Unavailable",
  },
  {
    siteId: "66dee07febec17067adefdd1",
    name: "Bull's",
    publicIp: "71.92.253.26",
    lteFailover: "Ready",
  },
  {
    siteId: "66dc10313c42855ad7837628",
    name: "Library",
    publicIp: "24.205.238.106",
    lteFailover: "Ready",
  },
  {
    siteId: "65e19814c653b505cd7183f3",
    name: "Milestone",
    publicIp: "71.92.253.180",
    lteFailover: "Unavailable",
  },
]

const MODEL_NAMES: Record<string, string> = {
  UXGA6AA: "Cloud Gateway Fiber",
  UDRULT: "UDR Ultra",
  UCKP: "CloudKey+",
}

async function getApiKey() {
  if (process.env.UNIFI_API_KEY?.trim()) {
    return process.env.UNIFI_API_KEY.trim()
  }

  const keyFile = process.env.UNIFI_API_KEY_FILE
  if (!keyFile) return null

  try {
    return (await readFile(keyFile, "utf8")).trim()
  } catch {
    return null
  }
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function percentageValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null

  const percentage = value <= 1 ? value * 100 : value
  return Math.min(100, Math.max(0, percentage))
}

function mapSite(config: SiteConfig, site: UnifiSite | undefined) {
  const counts = site?.statistics?.counts ?? {}
  const internetIssues = site?.statistics?.internetIssues ?? []
  const gatewayShortname = site?.statistics?.gateway?.shortname
  const wanUptime = site?.statistics?.percentages?.wanUptime

  return {
    id: config.siteId,
    name: config.name,
    siteMagic: site ? "Healthy" : "Unavailable",
    internet:
      site && (wanUptime === undefined || wanUptime > 0) ? "Healthy" : "Unavailable",
    wanUptime: percentageValue(wanUptime),
    lteFailover: config.lteFailover,
    gateway: gatewayShortname
      ? MODEL_NAMES[gatewayShortname] ?? gatewayShortname
      : "—",
    publicIp: config.publicIp,
    gatewayDevices: numberValue(counts.gatewayDevice),
    clients:
      numberValue(counts.wifiClient) +
      numberValue(counts.wiredClient) +
      numberValue(counts.guestClient),
    wifiAps: numberValue(counts.wifiDevice),
    switches: numberValue(counts.wiredDevice),
    internetIssues: Array.isArray(internetIssues) ? internetIssues.length : 0,
    criticalAlerts: numberValue(counts.criticalNotification),
    offlineDevices: numberValue(counts.offlineDevice),
  }
}

async function handleStatus() {
  const apiKey = await getApiKey()

  if (!apiKey) {
    return Response.json(
      {
        error: "UNIFI_API_KEY or UNIFI_API_KEY_FILE is not configured",
      },
      { status: 503 },
    )
  }

  try {
    const response = await fetch("https://api.ui.com/v1/sites?pageSize=100", {
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
    })

    if (!response.ok) {
      const body = await response.text()
      console.error("UniFi Site Manager API error", response.status, body.slice(0, 500))

      return Response.json(
        {
          error: `UniFi Site Manager API returned ${response.status}`,
        },
        { status: 502 },
      )
    }

    const payload = (await response.json()) as { data?: UnifiSite[] }
    const upstreamSites = Array.isArray(payload.data) ? payload.data : []

    const sites = SITE_CONFIG.map((config) =>
      mapSite(
        config,
        upstreamSites.find((site) => site.siteId === config.siteId),
      ),
    )

    return Response.json({
      updatedAt: new Date().toISOString(),
      sites,
    })
  } catch (error) {
    console.error("Failed to load UniFi status", error)

    return Response.json(
      {
        error: "Unable to reach UniFi Site Manager API",
      },
      { status: 502 },
    )
  }
}

export const Route = createFileRoute("/api/status")({
  server: {
    handlers: {
      GET: async () => await handleStatus(),
    },
  },
})
