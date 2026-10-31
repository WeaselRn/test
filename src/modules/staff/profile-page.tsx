/** Profile and role permissions overview (Settings → Roles). Owner: Person 1. */
import { Check, Minus } from "lucide-react";
import { PERMISSIONS, ROLES, type Permission } from "@shared/permissions";
import { Card, CardHeader, DescriptionList, Page, PageHeader } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { titleCase } from "@/lib/utils";

const LABELS: Partial<Record<Permission, string>> = {
  "staff:manage": "Manage staff",
  "catalog:write": "Create and edit products and plans",
  "catalog:read": "View products and plans",
  "tax:write": "Manage tax rules",
  "discount:write": "Manage discount rules",
  "template:write": "Create quotation templates",
  "customer:write": "Create and edit customers",
  "subscription:write": "Create subscriptions and move them through the lifecycle",
  "invoice:write": "Confirm, cancel and send invoices",
  "billing:run": "Run billing",
  "payment:write": "Record payments",
  "report:read": "View dashboard and reports",
  "finding:write": "Review leakage and anomaly findings",
  "settings:write": "Change system settings (dunning schedule)",
  "portal:access": "Use the customer portal (own data only)",
};

export function ProfilePage() {
  const { user } = useSession();
  return (
    <Page>
      <PageHeader title="Roles & profile" description="Who you are signed in as, and what each role may do. The server enforces these rules on every request." />
      <Card className="mb-6 p-5">
        <DescriptionList items={[{ label: "Name", value: user?.name }, { label: "Email", value: user?.email }, { label: "Role", value: titleCase(user?.role ?? "") }]} />
      </Card>
      <Card>
        <CardHeader title="Role permissions" />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-muted">
                <th className="px-5 py-2 font-medium">Capability</th>
                {ROLES.map((r) => <th key={r} className="px-5 py-2 text-center font-medium">{titleCase(r)}</th>)}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(LABELS) as Permission[]).map((p) => (
                <tr key={p} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 text-ink">{LABELS[p]}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-5 py-2.5 text-center">
                      {(PERMISSIONS[p] as readonly string[]).includes(r) ? <Check className="mx-auto size-4 text-success" /> : <Minus className="mx-auto size-4 text-faint" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Page>
  );
}
