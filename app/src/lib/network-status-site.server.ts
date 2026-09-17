import { getNetworkStatusOrganizationAccess } from "#/lib/network-status-auth.server.ts"

export type NetworkStatusSite = {
  siteId: string
  name: string
  aliases: string[]
  fabricId: string
}

const PRIMARY_FABRIC_ID = "niteowl-locations"

const NETWORK_STATUS_SITES: NetworkStatusSite[] = [
  {
    siteId: "60b95da3e03dd800f8e1ab9a",
    name: "McCarthy's",
    aliases: ["McCarthy's", "McCarthy's Irish Pub"],
    fabricId: PRIMARY_FABRIC_ID,
  },
  {
    siteId: "6550b431b117fd5af385cd74",
    name: "Frog",
    aliases: ["Frog", "Frog and Peach", "Frog & Peach"],
    fabricId: PRIMARY_FABRIC_ID,
  },
  {
    siteId: "66dee07febec17067adefdd1",
    name: "Bull's",
    aliases: ["Bull's", "Bull's Tavern"],
    fabricId: PRIMARY_FABRIC_ID,
  },
  {
    siteId: "66dc10313c42855ad7837628",
    name: "Library",
    aliases: ["Library", "The Library"],
    fabricId: PRIMARY_FABRIC_ID,
  },
  {
    siteId: "65e19814c653b505cd7183f3",
    name: "Milestone",
    aliases: ["Milestone", "Milestone Tavern"],
    fabricId: PRIMARY_FABRIC_ID,
  },
]

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function getNetworkStatusSiteByOrganizationName(organizationName: string) {
  const normalized = normalizeName(organizationName)
  return NETWORK_STATUS_SITES.find((site) =>
    site.aliases.some((alias) => normalizeName(alias) === normalized),
  ) ?? null
}

export function getNetworkStatusFabricSites(site: NetworkStatusSite) {
  return NETWORK_STATUS_SITES.filter((candidate) => candidate.fabricId === site.fabricId)
}

async function authorizeOriginOrganization(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId")

  if (!organizationId) {
    return {
      response: Response.json(
        { error: "organizationId is required" },
        { status: 400 },
      ),
    } as const
  }

  const access = await getNetworkStatusOrganizationAccess(request, organizationId)

  if (!access) {
    return {
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    } as const
  }

  if (!access.allowed) {
    return {
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    } as const
  }

  if (!access.organizationName) {
    return {
      response: Response.json(
        { error: "Organization could not be resolved" },
        { status: 404 },
      ),
    } as const
  }

  const site = getNetworkStatusSiteByOrganizationName(access.organizationName)

  if (!site) {
    return {
      response: Response.json(
        { error: `No UniFi site mapping exists for ${access.organizationName}` },
        { status: 404 },
      ),
    } as const
  }

  return {
    organizationId,
    organizationName: access.organizationName,
    site,
    access,
  } as const
}

export async function authorizeNetworkStatusSite(request: Request) {
  const authorization = await authorizeOriginOrganization(request)
  if ("response" in authorization) return authorization

  return {
    organizationId: authorization.organizationId,
    organizationName: authorization.organizationName,
    site: authorization.site,
  } as const
}

export async function authorizeNetworkStatusOverview(request: Request) {
  const authorization = await authorizeOriginOrganization(request)
  if ("response" in authorization) return authorization

  return {
    organizationId: authorization.organizationId,
    organizationName: authorization.organizationName,
    site: authorization.site,
    sites: authorization.access.fabricOverviewEnabled
      ? getNetworkStatusFabricSites(authorization.site)
      : [authorization.site],
    fabricOverviewEnabled: authorization.access.fabricOverviewEnabled,
  } as const
}
