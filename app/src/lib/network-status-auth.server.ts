type NetworkStatusAccessResponse = {
  allowed?: boolean
}

type JwtHeader = {
  alg?: string
  kid?: string
}

type JwtPayload = {
  sub?: string
  iss?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  scope?: string
}

type JwksResponse = {
  keys?: JsonWebKey[]
}

type VerifiedNetworkStatusToken = {
  payload: JwtPayload
  authBaseUrl: string
  resourceAudience: boolean
}

function getAuthBaseUrl(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase()

  if (
    hostname === "mccarthysirishpub.com" ||
    hostname.endsWith(".mccarthysirishpub.com")
  ) {
    return "https://console.mccarthysirishpub.com"
  }

  if (hostname === "niteowl.dev" || hostname.endsWith(".niteowl.dev")) {
    return "https://console.niteowl.dev"
  }

  const configured = process.env.AUTH_BASE_URL ?? process.env.VITE_AUTH_BASE_URL

  if (configured) {
    return configured.replace(/\/$/, "")
  }

  return "https://console.niteowl.dev"
}

function getNetworkStatusResourceUrl(request: Request) {
  const url = new URL(request.url)
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase()
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
  const protocol = forwardedProto === "https" ? "https:" : url.protocol
  const host = forwardedHost || url.host

  return `${protocol}//${host}`
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim()

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null
  }

  const token = authorization.slice(7).trim()
  return token.length > 0 ? token : null
}

function decodeBase64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T
}

function audienceIncludes(audience: string | string[] | undefined, expected: string) {
  return Array.isArray(audience) ? audience.includes(expected) : audience === expected
}

function scopeIncludes(scope: string | undefined, required: string) {
  return scope?.split(/\s+/).includes(required) ?? false
}

function rejectJwt(reason: string, details: Record<string, unknown> = {}) {
  console.warn("[network-status-auth] JWT rejected", { reason, ...details })
  return null
}

async function verifyJwt(
  request: Request,
): Promise<VerifiedNetworkStatusToken | null> {
  const token = bearerToken(request)

  if (!token) {
    return rejectJwt("missing_bearer_token")
  }

  const parts = token.split(".")

  if (parts.length !== 3) {
    return rejectJwt("not_jwt", { partCount: parts.length })
  }

  let header: JwtHeader
  let payload: JwtPayload

  try {
    header = decodeBase64UrlJson<JwtHeader>(parts[0])
    payload = decodeBase64UrlJson<JwtPayload>(parts[1])
  } catch {
    return rejectJwt("decode_failed")
  }

  if (header.alg !== "EdDSA" || !header.kid) {
    return rejectJwt("unsupported_header", {
      alg: header.alg,
      hasKid: Boolean(header.kid),
    })
  }

  const authBaseUrl = getAuthBaseUrl(request)
  const oauthIssuer = `${authBaseUrl}/api/auth`
  const resourceUrl = getNetworkStatusResourceUrl(request)
  const browserAudience = audienceIncludes(payload.aud, authBaseUrl)
  const resourceAudience = audienceIncludes(payload.aud, resourceUrl)
  const validIssuer = payload.iss === authBaseUrl || payload.iss === oauthIssuer

  if (!validIssuer) {
    return rejectJwt("issuer_mismatch", {
      issuer: payload.iss,
      expectedIssuers: [authBaseUrl, oauthIssuer],
    })
  }

  if (!browserAudience && !resourceAudience) {
    return rejectJwt("audience_mismatch", {
      audience: payload.aud,
      expectedAudiences: [authBaseUrl, resourceUrl],
    })
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return rejectJwt("missing_subject")
  }

  const now = Math.floor(Date.now() / 1000)

  if (typeof payload.exp === "number" && payload.exp <= now) {
    return rejectJwt("expired", { exp: payload.exp, now })
  }

  if (typeof payload.nbf === "number" && payload.nbf > now) {
    return rejectJwt("not_yet_valid", { nbf: payload.nbf, now })
  }

  const jwksResponse = await fetch(`${authBaseUrl}/api/auth/jwks`)

  if (!jwksResponse.ok) {
    return rejectJwt("jwks_fetch_failed", { status: jwksResponse.status })
  }

  const jwks = (await jwksResponse.json()) as JwksResponse
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid)

  if (!jwk) {
    return rejectJwt("signing_key_not_found", {
      kid: header.kid,
      availableKids: jwks.keys?.map((candidate) => candidate.kid) ?? [],
    })
  }

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "Ed25519" },
      false,
      ["verify"],
    )
    const verified = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      Buffer.from(parts[2], "base64url"),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )

    if (!verified) {
      return rejectJwt("signature_invalid", { kid: header.kid })
    }

    return { payload, authBaseUrl, resourceAudience }
  } catch (error) {
    return rejectJwt("signature_verification_failed", {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function getAuthenticatedNetworkStatusUserId(request: Request) {
  const verified = await verifyJwt(request)
  return verified?.payload.sub ?? null
}

export async function hasNetworkStatusScope(request: Request, requiredScope: string) {
  const verified = await verifyJwt(request)

  if (!verified) return false
  if (!verified.resourceAudience) return true

  return scopeIncludes(verified.payload.scope, requiredScope)
}

function getInternalSecret() {
  const secret = process.env.NETWORK_STATUS_INTERNAL_SECRET?.trim()

  if (!secret) {
    throw new Error("NETWORK_STATUS_INTERNAL_SECRET is not configured.")
  }

  return secret
}

export async function getNetworkStatusOrganizationAccess(
  request: Request,
  organizationId: string,
) {
  const userId = await getAuthenticatedNetworkStatusUserId(request)

  if (!userId) return null

  const url = new URL(
    `${getAuthBaseUrl(request)}/api/auth/network-status/access/internal`,
  )
  url.searchParams.set("organizationId", organizationId)
  url.searchParams.set("userId", userId)

  const response = await fetch(url, {
    headers: {
      "x-network-status-internal-secret": getInternalSecret(),
    },
  })

  if (!response.ok) return null

  const result = (await response.json()) as NetworkStatusAccessResponse
  return { allowed: result.allowed === true }
}
