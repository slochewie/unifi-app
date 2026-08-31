"use client"

import { useEffect, useState } from "react"
import { ArrowRightLeftIcon, CheckIcon, PlusCircleIcon } from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "#/components/ui/avatar.tsx"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "#/components/ui/dropdown-menu.tsx"
import { authClient } from "#/lib/auth-client.ts"

type DeviceSession = {
  session: {
    token: string
  }
  user: {
    id: string
    name?: string | null
    email: string
    image?: string | null
  }
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function AccountSwitcherSubmenu({
  currentUserId,
  consoleBaseURL,
}: {
  currentUserId: string
  consoleBaseURL: string
}) {
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [switchingToken, setSwitchingToken] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void authClient.multiSession.listDeviceSessions().then(({ data }) => {
      if (cancelled) return
      setDeviceSessions((data ?? []) as DeviceSession[])
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function switchAccount(deviceSession: DeviceSession) {
    if (deviceSession.user.id === currentUserId || switchingToken) return

    setSwitchingToken(deviceSession.session.token)
    const { error } = await authClient.multiSession.setActive({
      sessionToken: deviceSession.session.token,
    })

    if (error) {
      setSwitchingToken(null)
      return
    }

    window.location.reload()
  }

  function addAccount() {
    const url = new URL(`${consoleBaseURL}/auth/sign-in`)
    url.searchParams.set("redirectTo", window.location.href)
    window.location.assign(url.toString())
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowRightLeftIcon className="text-muted-foreground" />
        Switch Account
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        {isLoading ? (
          <DropdownMenuItem disabled>Loading accounts…</DropdownMenuItem>
        ) : (
          deviceSessions.map((deviceSession) => {
            const label = deviceSession.user.name || deviceSession.user.email
            const isCurrent = deviceSession.user.id === currentUserId
            const isSwitching = switchingToken === deviceSession.session.token

            return (
              <DropdownMenuItem
                key={deviceSession.session.token}
                disabled={isCurrent || Boolean(switchingToken)}
                onClick={() => void switchAccount(deviceSession)}
                className="py-2"
              >
                <Avatar className="size-8">
                  {deviceSession.user.image ? (
                    <AvatarImage src={deviceSession.user.image} alt="" />
                  ) : null}
                  <AvatarFallback>{getInitials(label)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {deviceSession.user.email}
                  </p>
                </div>
                {isCurrent ? <CheckIcon className="ml-auto" /> : null}
                {isSwitching ? (
                  <span className="ml-auto text-xs text-muted-foreground">Switching…</span>
                ) : null}
              </DropdownMenuItem>
            )
          })
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={addAccount}>
          <PlusCircleIcon className="text-muted-foreground" />
          Add Account
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
