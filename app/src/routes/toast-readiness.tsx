import { createFileRoute } from "@tanstack/react-router"
import { CheckCircle2Icon, CircleHelpIcon, ShieldCheckIcon, XCircleIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card.tsx"

export const Route = createFileRoute("/toast-readiness")({ component: ToastReadinessPage })

const requirements = [
  ["Dedicated Toast VLAN", "UniFi", "unknown"],
  ["Non-Toast devices excluded from Toast VLAN", "UniFi clients", "unknown"],
  ["Physical Ethernet ports mapped to Toast VLAN", "UniFi switching", "unknown"],
  ["Bonjour / mDNS enabled", "UniFi", "unknown"],
  ["Client isolation disabled", "UniFi", "unknown"],
  ["Toast SSID mapped to Toast VLAN", "UniFi WiFi", "unknown"],
  ["5 GHz wireless", "UniFi WiFi", "unknown"],
  ["WPA2/AES Personal encryption", "UniFi WiFi", "unknown"],
  ["Wireless signal remains at or above -65 dBm", "UniFi clients", "unknown"],
  ["ICMP echo replies unrestricted", "UniFi policy", "unknown"],
  ["Toast firewall destinations and ports allowed", "Firewall policy", "unknown"],
  ["QoS provides sufficient Toast bandwidth", "UniFi traffic policy", "unknown"],
  ["Cat5e or better cabling / T568B termination", "Physical verification", "verify"],
  ["Toast Ethernet ports clearly labeled", "Physical verification", "verify"],
] as const

function ToastReadinessPage() {
  return (
    <main className="flex-1 p-4 md:p-6">
      <div className="w-full space-y-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm"><ShieldCheckIcon className="size-5" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Toast Network Readiness</h1>
            <p className="mt-1 text-sm text-muted-foreground">Checks the selected UniFi network against Toast's self-managed network requirements.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
            <CardDescription>Checks remain unknown until the Fabric API exposes enough configuration to prove pass or fail. Physical requirements stay manual.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {requirements.map(([label, source, status]) => {
              const Icon = status === "verify" ? CircleHelpIcon : status === "pass" ? CheckCircle2Icon : status === "fail" ? XCircleIcon : CircleHelpIcon
              return (
                <div key={label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><p className="font-medium">{label}</p><p className="text-sm text-muted-foreground">{source}</p></div>
                  <span className="text-sm text-muted-foreground">{status === "verify" ? "Verify" : "Unknown"}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
