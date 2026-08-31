import { useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  ActivityIcon,
  CableIcon,
  CloudCogIcon,
  EthernetPortIcon,
  GaugeIcon,
  RadioTowerIcon,
  RouterIcon,
  ShieldAlertIcon,
  WifiIcon,
} from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import { Separator } from "#/components/ui/separator.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import { authBaseURL, authClient } from "#/lib/auth-client.ts"

export const Route = createFileRoute("/")({ component: NetworkStatusPage })

type SiteConfig = {
  name: string
  lteFailover: "Ready" | "Unavailable"
}

const sites: SiteConfig[] = [
  { name: "McCarthy's", lteFailover: "Ready" },
  { name: "Frog", lteFailover: "Unavailable" },
  { name: "Bull's", lteFailover: "Ready" },
  { name: "Library", lteFailover: "Ready" },
  { name: "Milestone", lteFailover: "Unavailable" },
]

const metrics = [
  { label: "Gateway Devices", icon: RouterIcon },
  { label: "Clients", icon: ActivityIcon },
  { label: "WiFi APs", icon: WifiIcon },
  { label: "Switches", icon: EthernetPortIcon },
  { label: "Internet Issues", icon: ShieldAlertIcon },
  { label: "Offline Devices", icon: CableIcon },
]

function SessionSkeleton() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-80 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  )
}

function StatusRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof GaugeIcon
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function SiteCard({ site }: { site: SiteConfig }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-lg">{site.name}</CardTitle>
            <CardDescription>UniFi Network</CardDescription>
          </div>
          <Badge variant="secondary">Awaiting API</Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-0.5">
          <StatusRow label="Site Magic" value="—" icon={CloudCogIcon} />
          <StatusRow label="Internet" value="—" icon={RadioTowerIcon} />
          <StatusRow label="LTE Failover" value={site.lteFailover} icon={GaugeIcon} />
          <StatusRow label="Gateway" value="—" icon={RouterIcon} />
          <StatusRow label="Public IP" value="—" icon={CableIcon} />
        </div>

        <Separator className="my-3" />

        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          {metrics.map(({ label, icon: Icon }) => (
            <div key={label} className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">—</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function NetworkStatusPage() {
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (isPending || session) return

    const redirectTo = window.location.href
    const signInURL = new URL("/auth/sign-in", authBaseURL)
    signInURL.searchParams.set("redirectTo", redirectTo)
    window.location.assign(signInURL.toString())
  }, [isPending, session])

  if (isPending) {
    return <SessionSkeleton />
  }

  if (!session) {
    return null
  }

  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Network Status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              UniFi health and device status for the consoles you are authorized to view.
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            <CloudCogIcon />
            UniFi plugin authorization next
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <SiteCard key={site.name} site={site} />
          ))}
        </div>
      </div>
    </main>
  )
}
