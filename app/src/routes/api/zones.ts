import { createFileRoute } from "@tanstack/react-router"

async function handleZones(request: Request) {
  const url = new URL(request.url)
  const organizationId = url.searchParams.get("organizationId")

  if (!organizationId) {
    return Response.json({ error: "organizationId is required" }, { status: 400 })
  }

  // The existing status endpoint only uses the Site Manager summary API. Zone/network
  // detail will be populated here from the UniFi Fabric API once the organization-to-site
  // mapping and the exact Fabric network endpoints are wired in. Keep this endpoint empty
  // rather than inventing VLAN, subnet, DHCP, DNS, or SSID configuration.
  return Response.json({ organizationId, zones: [] })
}

export const Route = createFileRoute("/api/zones")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleZones(request),
    },
  },
})
