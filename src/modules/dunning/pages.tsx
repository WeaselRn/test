/** Smart Dunning: schedule, reminder history and recovery. Owner: Person 4. */
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, Input, Page, PageHeader, Select, Stat, StatusBadge, useListParams } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useAction } from "@/lib/hooks";
import { dateTime, money } from "@/lib/utils";

interface Step { step: string; offsetDays: number; action: "remind" | "remind_and_notify_staff" | "escalate" }
interface Stats { remindedInvoices: number; recoveredInvoices: number; recoveryRate: number; recoveredAmount: string; outstandingAfterReminders: string; overdueWithoutReminder: number }
interface Reminder { id: string; step: string; sentAt: string; invoiceId: string; invoiceNumber: string; invoiceStatus: string; balance: string; customerName: string; subject: string | null }

const ACTIONS = { remind: "Send reminder", remind_and_notify_staff: "Reminder + notify staff", escalate: "Escalate to finance" } as const;

export function DunningPage() {
  const list = useListParams();
  const canEdit = useCan("settings:write");
  const canRun = useCan("invoice:write");
  const schedule = useQuery({ queryKey: ["dunning", "schedule"], queryFn: () => api.get<{ data: Step[] }>("/dunning/schedule").then((r) => r.data) });
  const stats = useQuery({ queryKey: ["dunning", "stats"], queryFn: () => api.get<Stats>("/dunning/stats") });
  const reminders = useQuery({ queryKey: ["dunning", "reminders", list.page], queryFn: () => api.list<Reminder>("/dunning/reminders", { page: list.page }) });
  const [steps, setSteps] = useState<Step[]>([]);
  useEffect(() => schedule.data && setSteps(schedule.data), [schedule.data]);
  const save = useAction(() => api.put<{ data: Step[] }>("/dunning/schedule", steps), { success: "Schedule saved", invalidate: [["dunning"]] });
  const run = useAction(() => api.post<{ data: { sent: number; escalated: number } }>("/dunning/run"), {
    success: (r) => `${r.data.sent} reminder(s) prepared, ${r.data.escalated} escalated`,
    invalidate: [["dunning"]],
  });

  return (
    <Page>
      <PageHeader
        title="Dunning"
        description="Automatic payment reminders for unpaid invoices. Reminders stop as soon as an invoice is paid."
        actions={canRun && <Button onClick={() => run.mutate(undefined)} loading={run.isPending}><BellRing /> Run reminders now</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Recovery rate" value={stats.data ? `${stats.data.recoveryRate}%` : "—"} detail={stats.data && `${stats.data.recoveredInvoices} of ${stats.data.remindedInvoices} reminded invoices paid`} tone="success" />
        <Stat label="Recovered" value={stats.data ? money(stats.data.recoveredAmount) : "—"} />
        <Stat label="Still outstanding" value={stats.data ? money(stats.data.outstandingAfterReminders) : "—"} />
        <Stat label="Overdue, not yet reminded" value={stats.data?.overdueWithoutReminder ?? "—"} tone={stats.data?.overdueWithoutReminder ? "danger" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="self-start">
          <CardHeader title="Reminder schedule" description="Days relative to the due date (negative = before)." />
          <div className="space-y-2 p-4">
            {steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[70px_1fr_auto] items-center gap-2">
                <Input aria-label="Offset days" type="number" value={s.offsetDays} disabled={!canEdit} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, offsetDays: Number(e.target.value) } : x)))} />
                <Select aria-label="Action" value={s.action} disabled={!canEdit} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, action: e.target.value as Step["action"] } : x)))}>
                  {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                {canEdit && <Button size="sm" variant="ghost" aria-label="Remove step" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 /></Button>}
              </div>
            ))}
            {canEdit && (
              <div className="flex justify-between pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={steps.length >= 8}
                  onClick={() => {
                    const offset = (steps.at(-1)?.offsetDays ?? 0) + 7;
                    setSteps([...steps, { step: `overdue_${offset}`, offsetDays: offset, action: "remind" }]);
                  }}
                >
                  <Plus /> Add step
                </Button>
                <Button size="sm" onClick={() => save.mutate(undefined)} loading={save.isPending}>Save schedule</Button>
              </div>
            )}
            {!canEdit && <p className="pt-2 text-[12px] text-muted">Only admins can change the schedule.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Reminder history" description={<>Emails are <Badge tone="accent">simulated</Badge> in demo mode and stored in the outbox.</>} />
          <DataTable
            columns={[
              { key: "sent", header: "Sent", cell: (r) => dateTime(r.sentAt) },
              { key: "inv", header: "Invoice", cell: (r) => <Link className="font-medium text-primary hover:underline" to={`/invoices/${r.invoiceId}`}>{r.invoiceNumber}</Link> },
              { key: "cust", header: "Customer", cell: (r) => r.customerName },
              { key: "step", header: "Step", hideOnMobile: true, cell: (r) => <Badge>{r.step}</Badge> },
              { key: "bal", header: "Balance", align: "right", cell: (r) => money(r.balance) },
              { key: "status", header: "Invoice", cell: (r) => <StatusBadge status={r.invoiceStatus} /> },
            ]}
            result={reminders.data}
            isLoading={reminders.isLoading}
            error={reminders.error}
            onPage={(page) => list.set({ page }, false)}
            empty={<EmptyState icon={<BellRing />} title="No reminders yet" description="Reminders go out daily for confirmed invoices near or past their due date." />}
          />
        </Card>
      </div>
    </Page>
  );
}
