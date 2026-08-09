import { Building2 } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";

/*
 * Companies, on a STAFF portal.
 *
 * The master portal has a real, API-backed Companies module — see
 * master-companies.tsx, which the registry renders instead of this one. This is
 * what a staff portal sees, and it was a static list of invented group
 * entities. There is no tenant-facing companies endpoint, so it says nothing
 * rather than something untrue.
 */

export function Companies() {
  return (
    <Card>
      <EmptyState
        icon={Building2}
        title="No group companies"
        desc="Legal entities operating under this group will appear here. Tenant administration lives on the master portal."
      />
    </Card>
  );
}
