import {
  jwtClient,
  multiSessionClient,
  organizationClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

function getAuthBaseURL() {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase()

    if (
      hostname === "mccarthysirishpub.com" ||
      hostname.endsWith(".mccarthysirishpub.com")
    ) {
      return "https://console.mccarthysirishpub.com"
    }

    if (hostname === "niteowl.dev" || hostname.endsWith(".niteowl.dev")) {
      return "https://console.niteowl.dev"
    }
  }

  return import.meta.env.VITE_AUTH_BASE_URL ?? "https://console.niteowl.dev"
}

export const authBaseURL = getAuthBaseURL()

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [
    jwtClient(),
    multiSessionClient(),
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
  ],
})

export async function networkStatusApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const { data, error } = await authClient.token()

  if (error || !data?.token) {
    throw new Error("Unable to obtain Network Status authentication token.")
  }

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${data.token}`)

  return fetch(input, {
    ...init,
    headers,
  })
}
