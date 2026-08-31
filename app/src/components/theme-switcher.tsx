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

function getStoredTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system"
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  root.classList.toggle("dark", dark)
  root.style.colorScheme = dark ? "dark" : "light"
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const initialTheme = getStoredTheme()
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

  function changeTheme(value: Theme) {
    setTheme(value)
    window.localStorage.setItem(STORAGE_KEY, value)
    applyTheme(value)
  }

  return { theme, changeTheme }
}

export function ThemeInitializer() {
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  return null
}

export function ThemeMenuControl() {
  const { theme, changeTheme } = useTheme()

  const options: Array<{ value: Theme; label: string; icon: typeof MonitorIcon }> = [
    { value: "system", label: "System", icon: MonitorIcon },
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
  ]

  return (
    <div className="flex items-center justify-between gap-4 px-2 py-1.5 text-sm">
      <span>Theme</span>
      <div className="flex items-center rounded-md bg-muted p-0.5">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={label}
            className={`flex size-7 items-center justify-center rounded-sm transition-colors ${
              theme === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              changeTheme(value)
            }}
          >
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function ThemeSwitcher({ inline = false }: { inline?: boolean }) {
  const { theme, changeTheme } = useTheme()
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
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => {
              if (value === "system" || value === "light" || value === "dark") {
                changeTheme(value)
              }
            }}
          >
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
