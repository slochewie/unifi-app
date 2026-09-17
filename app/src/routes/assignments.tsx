import { useEffect, useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { SearchIcon, UsersIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx"
import { Input } from "#/components/ui/input.tsx"
import { Skeleton } from "#/components/ui/skeleton.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx"
import { authBaseURL, authClient } from "#/lib/auth-client.ts"
import {
  getNetworkStatusManagementAccess,
  listNetworkStatusAssignments,
  type NetworkStatusAssignment,
  updateNetworkStatusAccess,
  updateNetworkStatusFabricOverview,
  updateNetworkStatusManager,
} from "#/lib/network-status-access.ts"

export const Route = createFileRoute("/assignments")({
  component: NetworkStatusAssignments,
})

function NetworkStatusAssignments() {
  const { data: session, isPending } = authClient.useSession()
  const { data: organizations, isPending: areOrganizationsPending } =
    authClient.useListOrganizations()
  const { data: activeOrganization, isPending: isActiveOrganizationPending } =
    authClient.useActiveOrganization()
  const [assignments, setAssignments] = useState<NetworkStatusAssignment[]>([])
  const [assignmentsPending, setAssignmentsPending] = useState(false)
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (isPending || session) return
    const redirectTo = encodeURIComponent(window.location.href)
    const signInURL = `${authBaseURL.replace(/\/$/, "")}/auth/sign-in?redirectTo=${redirectTo}`
    window.location.replace(signInURL)
  }, [isPending, session])

  useEffect(() => {
    if (
      !session ||
      areOrganizationsPending ||
      isActiveOrganizationPending ||
      activeOrganization ||
      organizations?.length !== 1
    ) {
      return
    }

    void authClient.organization.setActive({ organizationId: organizations[0].id })
  }, [
    activeOrganization,
    areOrganizationsPending,
    isActiveOrganizationPending,
    organizations,
    session,
  ])

  useEffect(() => {
    if (!session || !activeOrganization?.id) {
      setAssignments([])
      setAssignmentsError(null)
      setAssignmentsPending(false)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    async function loadAssignments() {
      setAssignmentsPending(true)
      setAssignmentsError(null)

      try {
        const management =
          session.user.role === "admin"
            ? { allowed: true, canManageManagers: true }
            : await getNetworkStatusManagementAccess(
                activeOrganization.id,
                controller.signal,
              )

        if (cancelled) return
        if (!management.allowed) {
          window.location.replace("/")
          return
        }

        const result = await listNetworkStatusAssignments(activeOrganization.id)
        if (!cancelled) {
          setAssignments(result)
          setAssignmentsPending(false)
        }
      } catch (error) {
        if (
          !cancelled &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setAssignments([])
          setAssignmentsError(
            error instanceof Error
              ? error.message
              : "Unable to load Network Status assignments.",
          )
          setAssignmentsPending(false)
        }
      }
    }

    void loadAssignments()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeOrganization?.id, session])

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return assignments
    return assignments.filter(
      (assignment) =>
        assignment.name.toLowerCase().includes(query) ||
        assignment.email.toLowerCase().includes(query),
    )
  }, [assignments, search])

  function mergeAssignment(updated: NetworkStatusAssignment) {
    setAssignments((current) =>
      current.map((item) =>
        item.userId === updated.userId ? { ...item, ...updated } : item,
      ),
    )
  }

  async function handleAccessToggle(assignment: NetworkStatusAssignment) {
    if (!activeOrganization?.id || updatingKey || !assignment.canUpdateAccess) return
    const key = `${assignment.userId}:access`
    setUpdatingKey(key)
    setAssignmentsError(null)
    try {
      mergeAssignment(
        await updateNetworkStatusAccess(
          activeOrganization.id,
          assignment.userId,
          !assignment.accessEnabled,
        ),
      )
    } catch (error) {
      setAssignmentsError(
        error instanceof Error
          ? error.message
          : "Unable to update Network Status access.",
      )
    } finally {
      setUpdatingKey(null)
    }
  }

  async function handleManagerToggle(assignment: NetworkStatusAssignment) {
    if (!activeOrganization?.id || updatingKey || !assignment.canUpdateManager) return
    const key = `${assignment.userId}:manager`
    setUpdatingKey(key)
    setAssignmentsError(null)
    try {
      mergeAssignment(
        await updateNetworkStatusManager(
          activeOrganization.id,
          assignment.userId,
          !assignment.assignmentManagerEnabled,
        ),
      )
    } catch (error) {
      setAssignmentsError(
        error instanceof Error
          ? error.message
          : "Unable to update Network Status manager.",
      )
    } finally {
      setUpdatingKey(null)
    }
  }

  async function handleFabricOverviewToggle(assignment: NetworkStatusAssignment) {
    if (
      !activeOrganization?.id ||
      updatingKey ||
      !assignment.canUpdateFabricOverview
    ) {
      return
    }
    const key = `${assignment.userId}:fabric`
    setUpdatingKey(key)
    setAssignmentsError(null)
    try {
      mergeAssignment(
        await updateNetworkStatusFabricOverview(
          activeOrganization.id,
          assignment.userId,
          !assignment.fabricOverviewEnabled,
        ),
      )
    } catch (error) {
      setAssignmentsError(
        error instanceof Error
          ? error.message
          : "Unable to update Fabric overview access.",
      )
    } finally {
      setUpdatingKey(null)
    }
  }

  if (isPending || !session) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6 lg:p-8">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm">
          <UsersIcon />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="text-sm text-muted-foreground">
            Manage Network Status access for active organization members.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network Status access</CardTitle>
          <CardDescription>
            Choose who can use Network Status, manage assignments, and view status for other locations in the same Fabric. Fabric overview is view-only and does not grant access to peer organizations, devices, zones, Toast Readiness, or assignments.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative sm:max-w-sm">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search members"
              className="pl-9"
            />
          </div>

          {assignmentsError ? (
            <p className="text-sm text-destructive">{assignmentsError}</p>
          ) : null}

          {assignmentsPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : null}

          {!assignmentsPending && activeOrganization && assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active organization members are available.
            </p>
          ) : null}

          {!assignmentsPending && assignments.length > 0 && filteredAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members match your search.</p>
          ) : null}

          {!assignmentsPending && filteredAssignments.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Fabric Overview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map((assignment) => {
                    const accessUpdating = updatingKey === `${assignment.userId}:access`
                    const managerUpdating = updatingKey === `${assignment.userId}:manager`
                    const fabricUpdating = updatingKey === `${assignment.userId}:fabric`
                    return (
                      <TableRow key={assignment.userId}>
                        <TableCell>
                          <div className="min-w-44">
                            <p className="font-medium">{assignment.name}</p>
                            <p className="text-xs text-muted-foreground">{assignment.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge asChild variant={assignment.accessEnabled ? "default" : "outline"}>
                            <button
                              type="button"
                              disabled={updatingKey !== null || !assignment.canUpdateAccess}
                              aria-pressed={assignment.accessEnabled}
                              onClick={() => void handleAccessToggle(assignment)}
                              className={
                                assignment.canUpdateAccess
                                  ? assignment.accessEnabled
                                    ? "cursor-pointer"
                                    : "cursor-pointer opacity-45"
                                  : "cursor-not-allowed opacity-45"
                              }
                            >
                              {accessUpdating ? "Saving…" : "Network Status"}
                            </button>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            asChild
                            variant={assignment.assignmentManagerEnabled ? "default" : "outline"}
                          >
                            <button
                              type="button"
                              disabled={updatingKey !== null || !assignment.canUpdateManager}
                              aria-pressed={assignment.assignmentManagerEnabled}
                              onClick={() => void handleManagerToggle(assignment)}
                              className={
                                assignment.canUpdateManager
                                  ? assignment.assignmentManagerEnabled
                                    ? "cursor-pointer"
                                    : "cursor-pointer opacity-45"
                                  : "cursor-not-allowed opacity-45"
                              }
                            >
                              {managerUpdating ? "Saving…" : "Manager"}
                            </button>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            asChild
                            variant={assignment.fabricOverviewEnabled ? "default" : "outline"}
                          >
                            <button
                              type="button"
                              disabled={
                                updatingKey !== null ||
                                !assignment.canUpdateFabricOverview
                              }
                              aria-pressed={assignment.fabricOverviewEnabled}
                              onClick={() => void handleFabricOverviewToggle(assignment)}
                              className={
                                assignment.canUpdateFabricOverview
                                  ? assignment.fabricOverviewEnabled
                                    ? "cursor-pointer"
                                    : "cursor-pointer opacity-45"
                                  : "cursor-not-allowed opacity-45"
                              }
                            >
                              {fabricUpdating ? "Saving…" : "Fabric"}
                            </button>
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
