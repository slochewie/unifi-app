import { authBaseURL } from "#/lib/auth-client.ts"

export type NetworkStatusAssignment = {
  memberId: string
  userId: string
  name: string
  email: string
  systemAdmin: boolean
  accessEnabled: boolean
  assignmentManagerEnabled: boolean
  fabricOverviewEnabled: boolean
  canUpdateAccess: boolean
  canUpdateManager: boolean
  canUpdateFabricOverview: boolean
}

type AssignmentsResponse = {
  assignments?: NetworkStatusAssignment[]
  error?: string
}

type AssignmentUpdateResponse = {
  assignment?: NetworkStatusAssignment
  error?: string
}

type AccessResponse = {
  allowed?: boolean
  error?: string
}

type ManagementAccessResponse = {
  allowed?: boolean
  canManageManagers?: boolean
  error?: string
}

function authEndpoint(path: string) {
  return `${authBaseURL.replace(/\/$/, "")}${path}`
}

export async function listNetworkStatusAssignments(organizationId: string) {
  const url = new URL(authEndpoint("/api/auth/network-status/assignments"))
  url.searchParams.set("organizationId", organizationId)
  const response = await fetch(url, { credentials: "include" })
  const result = (await response.json()) as AssignmentsResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to load Network Status assignments.",
    )
  }

  return Array.isArray(result.assignments) ? result.assignments : []
}

async function updateFlag(
  path: string,
  organizationId: string,
  userId: string,
  enabled: boolean,
  fallbackError: string,
) {
  const response = await fetch(authEndpoint(path), {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId, userId, enabled }),
  })
  const result = (await response.json()) as AssignmentUpdateResponse

  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : fallbackError)
  }
  if (!result.assignment) {
    throw new Error("Assignment update completed without an assignment.")
  }

  return result.assignment
}

export function updateNetworkStatusAccess(
  organizationId: string,
  userId: string,
  enabled: boolean,
) {
  return updateFlag(
    "/api/auth/network-status/access",
    organizationId,
    userId,
    enabled,
    "Unable to update Network Status access.",
  )
}

export function updateNetworkStatusManager(
  organizationId: string,
  userId: string,
  enabled: boolean,
) {
  return updateFlag(
    "/api/auth/network-status/manager",
    organizationId,
    userId,
    enabled,
    "Unable to update Network Status manager.",
  )
}

export function updateNetworkStatusFabricOverview(
  organizationId: string,
  userId: string,
  enabled: boolean,
) {
  return updateFlag(
    "/api/auth/network-status/fabric-overview",
    organizationId,
    userId,
    enabled,
    "Unable to update Fabric overview access.",
  )
}

export async function getNetworkStatusAccess(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/network-status/access"))
  url.searchParams.set("organizationId", organizationId)
  const response = await fetch(url, { credentials: "include", signal })
  const result = (await response.json()) as AccessResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to verify Network Status access.",
    )
  }

  return result.allowed === true
}

export async function getNetworkStatusManagementAccess(
  organizationId: string,
  signal?: AbortSignal,
) {
  const url = new URL(authEndpoint("/api/auth/network-status/management-access"))
  url.searchParams.set("organizationId", organizationId)
  const response = await fetch(url, { credentials: "include", signal })
  const result = (await response.json()) as ManagementAccessResponse

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Unable to verify Network Status management access.",
    )
  }

  return {
    allowed: result.allowed === true,
    canManageManagers: result.canManageManagers === true,
  }
}
