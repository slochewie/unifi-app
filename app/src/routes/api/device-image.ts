import { createFileRoute } from "@tanstack/react-router"

const ARTWORK_SOURCES: Record<string, string> = {
  "uxg-fiber": "https://cdn.ecomm.ui.com/products/7310b331-fede-4e5f-9392-b6661ffce39f/cc4c2f12-1c52-4fbd-99b8-da3eb6422800.png",
  "usw-lite-16-poe": "https://cdn.ecomm.ui.com/products/e726eace-a772-4f12-bfad-c68baf20e51f/9ecfc657-5e31-4135-89b5-46b3537b35fc.png",
  "usw-lite-8-poe": "https://cdn.ecomm.ui.com/products/75c44878-4e73-446e-8e86-f207db6b2b7c/53b8b06b-69c7-424f-bb81-2f8405356c65.png",
  "usw-ultra-60w": "https://cdn.ecomm.ui.com/products/d1af5d9b-b74c-4881-99af-033b71ed1590/f80567f8-ba09-4a75-982d-6fd636623492.png",
  "usw-flex-2-5g-5": "https://cdn.ecomm.ui.com/products/50830d51-4d7e-47ea-92f4-11043d3d664f/c956d05e-4351-46ba-b71e-afaafa3f1144.png",
  "u7-pro": "https://cdn.ecomm.ui.com/products/fa8dd4e4-36c8-4c79-a928-22c7bff2ce29/ab5bc8a4-6135-402e-a695-e3ea5e16d3e6.png",
  "u6-pro": "https://cdn.ecomm.ui.com/products/8e88b222-7a55-4cf0-8677-ae9b6347fe84/e16aa122-b5e5-4ffb-9f1a-27ee14d9ab3d.png",
  "u6-mesh": "https://cdn.ecomm.ui.com/products/7b8f8da5-d684-4170-be1f-71b53af8d7f9/fdce5345-80e9-4edd-bf5b-93cf9141649e.png",
  "uap-nanohd": "https://cdn.ecomm.ui.com/products/920b705b-9e11-46a4-8fa4-783e62147b1a/bd6b1ce9-a160-4504-a1ca-9d458fe488e9.png",
  "ups-tower": "https://cdn.ecomm.ui.com/products/79ba566f-afed-4047-96d5-efdaf848add3/0374750d-d450-4268-9a23-784b29c70d91.png",
  "ups-2u": "https://cdn.ecomm.ui.com/products/1674b854-0811-4d7a-a213-daa25326d903/de548757-5709-4f8f-9b0e-58846a113f99.png",
  "ucg-ultra": "https://cdn.ecomm.ui.com/products/8d2d9e4b-89f3-49a1-9c17-5d774c0067b4/2e179331-f85a-4bc9-bf3e-d00192522732.png",
  "usw-pro-24": "https://cdn.ecomm.ui.com/products/2315330e-7a37-4c6b-87df-0743d04e87ca/5281dd32-ad14-40c5-a8d0-2df56a340bae.png",
}

async function handleImage(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? ""
  const source = ARTWORK_SOURCES[key]
  if (!source) return new Response(null, { status: 404 })

  try {
    const response = await fetch(source, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: "https://techspecs.ui.com/",
        "User-Agent": "Mozilla/5.0",
      },
    })
    if (!response.ok || !response.body) {
      console.warn("UniFi artwork fetch failed", key, response.status)
      return new Response(null, { status: 502 })
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    })
  } catch (error) {
    console.warn("Unable to proxy UniFi artwork", key, error)
    return new Response(null, { status: 502 })
  }
}

export const Route = createFileRoute("/api/device-image")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleImage(request),
    },
  },
})
