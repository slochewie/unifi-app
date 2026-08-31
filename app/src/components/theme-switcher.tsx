"use client"

import { useEffect, useState } from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"

import { buttonVariants } from "#/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx"

type Theme = "system" | "light" | "dark"

const STORAGE_KEY = "unifi-app-theme"

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  root.classList.toggle("dark", dark)
  root.style.colorScheme = dark ? "dark" : "light"
}

export function ThemeSwitcher({ inline = false }: { inline?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const initialTheme: Theme =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system"

    setTheme(initialTheme)
    applyTheme(initialTheme)
  }, [])

  useEffect(() => {
    if (theme !== "system") return

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => applyTheme("system")

    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [theme])

  function changeTheme(value: string) {
    if (value !== "system" && value !== "light" && value !== "dark") return

    setTheme(value)
    window.localStorage.setItem(STORAGE_KEY, value)
    applyTheme(value)
  }

  const Icon =
    theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : MonitorIcon

  return (
    <div
      className={
        inline
          ? "shrink-0"
          : "fixed top-4 right-4 z-50 md:top-6 md:right-6 lg:top-8 lg:right-8"
      }
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          aria-label="Change color theme"
          title="Color theme"
          className={buttonVariants({
            variant: "outline",
            size: "icon",
            className: "bg-background/90 backdrop-blur",
          })}
        >
          <Icon />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuRadioGroup value={theme} onValueChange={changeTheme}>
            <DropdownMenuRadioItem value="system">
              <MonitorIcon />
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <SunIcon />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <MoonIcon />
              Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
