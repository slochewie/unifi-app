import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import {
  appDefinitionsById,
  buildNavigation,
  getDefaultAppUrls,
  getDeploymentBrand,
} from "@niteowl/app-config"
import {
  AppSidebarIdentity,
  NiteOwlNavigationIcon,
  useCurrentHostname,
} from "@niteowl/ui"
import {
  Building2Icon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "lucide-react"

import { AccountSwitcherSubmenu } from "#/components/account-switcher-submenu.tsx"
import { OrganizationHeaderSelector } from "#/components/organization-header-selector.tsx"
import { ThemeMenuControl } from "#/components/theme-switcher.tsx"
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "#/components/ui/sidebar.tsx"
import { TooltipProvider } from "#/components/ui/tooltip.tsx"
import { authClient } from "#/lib/auth-client.ts"
import { getNetworkStatusManagementAccess } from "#/lib/network-status-access.ts"

const NETWORK_STATUS_APP = appDefinitionsById["network-status"]

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?"
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function getSidebarDefaultOpen() {
  if (typeof document === "undefined") return true
  const sidebarState = document.cookie.split("; ").find((cookie) => cookie.startsWith("sidebar_state="))?.split("=")[1]
  return sidebarState !== "false"
}

function SidebarIdentityToggle({ href, brand }: { href: string; brand: string }) {
  const { toggleSidebar } = useSidebar()
  return <AppSidebarIdentity href={href} brand={brand} appName={NETWORK_STATUS_APP.label} onToggle={toggleSidebar} />
}

export function AppChrome({ children }: { children: ReactNode }) {
  const location = useLocation()
  const hostname = useCurrentHostname()
  const { data: session } = authClient.useSession()
  const { data: activeOrganization } = authClient.useActiveOrganization()
  const [hasDelegatedManagement, setHasDelegatedManagement] = useState(false)
  const isGlobalAdmin = (session?.user as { role?: string } | undefined)?.role === "admin"

  useEffect(() => {
    if (!session || !activeOrganization?.id || isGlobalAdmin) {
      setHasDelegatedManagement(false)
      return
    }
    const controller = new AbortController()
    void getNetworkStatusManagementAccess(activeOrganization.id, controller.signal)
      .then((result) => setHasDelegatedManagement(result.allowed))
      .catch(() => setHasDelegatedManagement(false))
    return () => controller.abort()
  }, [activeOrganization?.id, isGlobalAdmin, session])

  if (!session) return children

  const canManageAssignments = isGlobalAdmin || hasDelegatedManagement
  const appLinks = hostname ? getDefaultAppUrls(hostname) : null
  const brand = hostname ? getDeploymentBrand(hostname) : null
  const displayName = session.user.name || session.user.email
  const avatarLabel = getInitials(displayName)
  const consoleBaseURL = appLinks?.console.replace(/\/$/, "") ?? null
  const sidebarDefaultOpen = getSidebarDefaultOpen()
  const navigation = appLinks
    ? buildNavigation({
        currentApp: "network-status",
        currentPath: location.pathname,
        urls: appLinks,
        canAccess: ({ key }) => key === "network-status:manage-assignments" ? canManageAssignments : true,
      })
    : null
  const primarySection = navigation?.primary[0]
  const appsSection = navigation?.apps[0]
  const currentHref = appLinks ? `${appLinks["network-status"].replace(/\/$/, "")}${location.pathname}` : null

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarDefaultOpen}>
        <Sidebar collapsible="icon">
          <SidebarHeader>{currentHref && brand ? <SidebarIdentityToggle href={currentHref} brand={brand} /> : <div className="h-12" aria-hidden="true" />}</SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            {primarySection ? <SidebarGroup><SidebarGroupContent><SidebarMenu>{primarySection.items.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={item.active} tooltip={item.label} onClick={() => window.location.assign(item.href)}><NiteOwlNavigationIcon icon={item.icon} /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup> : null}
            <SidebarSeparator />
            {appsSection ? <SidebarGroup><SidebarGroupLabel className="text-sm">{appsSection.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{appsSection.items.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton tooltip={item.label} onClick={() => window.location.assign(item.href)}><NiteOwlNavigationIcon icon={item.icon} /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup> : null}
            <SidebarSeparator />
            {consoleBaseURL ? <SidebarGroup><SidebarGroupLabel className="text-sm">Settings</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
              <SidebarMenuItem><SidebarMenuButton tooltip="Account" onClick={() => window.location.assign(`${consoleBaseURL}/settings/account`)}><UserCircleIcon /><span>Account</span></SidebarMenuButton></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuButton tooltip="Security" onClick={() => window.location.assign(`${consoleBaseURL}/settings/security`)}><ShieldCheckIcon /><span>Security</span></SidebarMenuButton></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuButton tooltip="Organizations" onClick={() => window.location.assign(`${consoleBaseURL}/settings/organizations`)}><Building2Icon /><span>Organizations</span></SidebarMenuButton></SidebarMenuItem>
            </SidebarMenu></SidebarGroupContent></SidebarGroup> : null}
          </SidebarContent>
        </Sidebar>
        <SidebarInset className="bg-transparent">
          <header className="flex min-h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
            <SidebarTrigger />
            <div className="min-w-0 shrink-0"><p className="truncate text-sm font-semibold">{NETWORK_STATUS_APP.label}</p>{brand ? <p className="hidden truncate text-xs text-muted-foreground sm:block">{brand}</p> : null}</div>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <OrganizationHeaderSelector />
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open account menu for ${displayName}`}><Avatar>{session.user.image ? <AvatarImage src={session.user.image} alt="" /> : null}<AvatarFallback>{avatarLabel}</AvatarFallback></Avatar></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuGroup><DropdownMenuLabel className="font-normal"><div className="flex items-center gap-3"><Avatar>{session.user.image ? <AvatarImage src={session.user.image} alt="" /> : null}<AvatarFallback>{avatarLabel}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-medium">{displayName}</p>{session.user.email ? <p className="truncate text-xs text-muted-foreground">{session.user.email}</p> : null}</div></div></DropdownMenuLabel></DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  {consoleBaseURL ? <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => window.location.assign(`${consoleBaseURL}/settings/account`)}><SettingsIcon className="text-muted-foreground" />Settings</DropdownMenuItem>
                    <div className="relative"><PaletteIcon className="pointer-events-none absolute left-2 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" /><div className="pl-6"><ThemeMenuControl /></div></div>
                    <AccountSwitcherSubmenu currentUserId={session.user.id} consoleBaseURL={consoleBaseURL} />
                  </DropdownMenuGroup> : null}
                  <DropdownMenuSeparator />
                  {consoleBaseURL ? <DropdownMenuGroup><DropdownMenuItem onClick={() => window.location.assign(`${consoleBaseURL}/auth/sign-out`)}><LogOutIcon className="text-muted-foreground" />Sign Out</DropdownMenuItem></DropdownMenuGroup> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <div className="flex flex-1 flex-col [&>header:first-child]:hidden">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
