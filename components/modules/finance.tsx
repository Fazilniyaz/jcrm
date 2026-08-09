import { Wallet, CreditCard } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";

/*
 * Salary and Payments.
 *
 * Both were static demo views — hard-coded payslips and invoices that looked
 * like data and were not. That mock file is gone, and there is no payroll or
 * billing endpoint on the API yet, so these say so plainly rather than showing
 * numbers nobody entered.
 *
 * When the endpoints land, these are the two places to wire them.
 */

export function Salary() {
  return (
    <Card>
      <EmptyState
        icon={Wallet}
        title="Payroll isn't connected yet"
        desc="Payslips, deductions and payroll runs will appear here once the salary service is wired up."
      />
    </Card>
  );
}

export function Payments() {
  return (
    <Card>
      <EmptyState
        icon={CreditCard}
        title="No invoices yet"
        desc="Invoices raised against client accounts will appear here once billing is wired up."
      />
    </Card>
  );
}
