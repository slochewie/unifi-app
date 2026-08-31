import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"

import { AppChrome } from "#/components/app-chrome.tsx"

import appCss from "../styles.css?url"

import type { QueryClient } from "@tanstack/react-query"

interface MyRouterContext {
  queryClient: QueryClient
}

const themeInitScript = `
(() => {
  try {
    const stored = localStorage.getItem('unifi-app-theme')
    const theme = stored === 'light' || stored === 'dark' || stored === 'system'
      ? stored
      : 'system'
    const dark = theme === 'dark' ||
      (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  } catch {}
})()
`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "NiteOwl.dev UniFi Network Status",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        <AppChrome>{children}</AppChrome>
        <Scripts />
      </body>
    </html>
  )
}
