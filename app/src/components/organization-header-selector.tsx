import { useEffect } from "react"
import { OrganizationSelector } from "@niteowl/ui"

import { authClient } from "#/lib/auth-client.ts"

export function OrganizationHeaderSelector() {
  const { data: session } = authClient.useSession()
  const { data: organizations, isPending: areOrganizationsPending } =
    authClient.useListOrganizations()
  const { data: activeOrganization, isPending: isActiveOrganizationPending } =
    authClient.useActiveOrganization()

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

    void authClient.organization.setActive({
      organizationId: organizations[0].id,
    })
  }, [
    activeOrganization,
    areOrganizationsPending,
    isActiveOrganizationPending,
    organizations,
    session,
  ])

  if (!session) {
    return null
  }

  return (
    <OrganizationSelector
      variant="compact"
      organizations={organizations ?? []}
      value={activeOrganization?.id}
      loading={areOrganizationsPending || isActiveOrganizationPending}
      className="w-28 min-w-0 sm:w-48 lg:w-56"
      onValueChange={(organizationId) => {
        void authClient.organization.setActive({ organizationId })
      }}
    />
  )
}
