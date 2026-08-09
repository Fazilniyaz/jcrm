import { TrendingUp } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";

/*
 * Performance.
 *
 * The employee directory moved to employee-management.tsx when it became a
 * store-backed CRUD module; what was left here was invented throughput and
 * per-person ratings from the mock file.
 *
 * The API has no metrics behind these: delivered/reopened counts, on-time rate
 * and reviewer ratings are not recorded anywhere. KRA is — but it is already on
 * every row in Employees, and duplicating it here under a different name would
 * imply a second measurement that does not exist.
 */

export function Performance() {
  return (
    <Card>
      <EmptyState
        icon={TrendingUp}
        title="No performance data"
        desc="Throughput, on-time rate and review scores need a metrics service. KRA scores are on each person's row in Employees."
      />
    </Card>
  );
}
