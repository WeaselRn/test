/**
 * AUTH-4: admin-only staff management. Owner: Person 1.
 * Also the reference implementation of the list + form + dialog pattern for other modules.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";
import { createStaffSchema } from "@shared/schemas";
import type { StaffMember } from "@shared/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Input,
  Page,
  PageHeader,
  Select,
  StatusBadge,
  useListParams,
  useToast,
  type Column,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { date, initials, titleCase } from "@/lib/utils";
import { PasswordChecklist } from "@/modules/auth/pages";

export function StaffPage() {
  const list = useListParams({ sort: "-createdAt" });
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<StaffMember | null>(null);
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();

  const staff = useQuery({ queryKey: ["staff", list.query], queryFn: () => api.list<StaffMember>("/staff", list.query) });

  const toggle = useMutation({
    mutationFn: (m: StaffMember) => api.patch<{ data: StaffMember }>(`/staff/${m.id}`, { isActive: !m.isActive }),
    onSuccess: ({ data }) => {
      toast.success(`${data.name} ${data.isActive ? "enabled" : "disabled"}`);
      qc.invalidateQueries({ queryKey: ["staff"] });
      setToggling(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const columns: Column<StaffMember>[] = [
    {
      key: "name",
      header: "Name",
      sortKey: "name",
      cell: (m) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-subtle text-[11px] font-semibold text-body">{initials(m.name)}</span>
          <div>
            <div className="font-medium text-ink">{m.name}</div>
            <div className="text-[12px] text-muted md:hidden">{m.email}</div>
          </div>
        </div>
      ),
    },
    { key: "email", header: "Email", sortKey: "email", cell: (m) => m.email, hideOnMobile: true },
    { key: "role", header: "Role", cell: (m) => <Badge tone={m.role === "admin" ? "primary" : "draft"}>{titleCase(m.role)}</Badge> },
    { key: "status", header: "Status", cell: (m) => <StatusBadge status={m.isActive ? "enabled" : "disabled"} /> },
    { key: "createdAt", header: "Added", sortKey: "createdAt", cell: (m) => date(m.createdAt), hideOnMobile: true },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (m) =>
        m.id === user?.id ? (
          <span className="text-[12px] text-faint">You</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setToggling(m)}>
            {m.isActive ? "Disable" : "Enable"}
          </Button>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Staff"
        description="Only admins can add, disable or change staff accounts. Disabled members are signed out immediately."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Add staff member
          </Button>
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <Input
            placeholder="Search by name or email"
            defaultValue={list.q}
            onChange={(e) => list.set({ q: e.target.value })}
            className="max-w-xs"
          />
        </div>
        <DataTable
          columns={columns}
          result={staff.data}
          isLoading={staff.isLoading}
          error={staff.error}
          onRetry={() => staff.refetch()}
          sort={list.sort}
          onSort={(sort) => list.set({ sort })}
          onPage={(page) => list.set({ page }, false)}
          empty={<EmptyState icon={<ShieldCheck />} title="No staff members found" description="Add a teammate to share the workload." />}
        />
      </Card>

      <CreateStaffDialog open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        onConfirm={() => toggling && toggle.mutate(toggling)}
        loading={toggle.isPending}
        tone={toggling?.isActive ? "danger" : "primary"}
        title={toggling?.isActive ? `Disable ${toggling.name}?` : `Enable ${toggling?.name}?`}
        description={
          toggling?.isActive
            ? "They will be signed out everywhere and cannot sign in until enabled again."
            : "They will be able to sign in again with their existing password."
        }
        confirmLabel={toggling?.isActive ? "Disable" : "Enable"}
      />
    </Page>
  );
}

function CreateStaffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useZodForm(createStaffSchema, { defaultValues: { name: "", email: "", password: "", role: "staff" } });
  const { errors, isSubmitting } = form.formState;
  const close = () => {
    form.reset();
    onClose();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api.post("/staff", values);
      toast.success(`${values.name} added`);
      qc.invalidateQueries({ queryKey: ["staff"] });
      close();
    } catch (err) {
      const message = applyServerErrors(form, err);
      if (!Object.keys(form.formState.errors).length) toast.error(message);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add staff member"
      description="Share the temporary password with them securely; they can reset it from the sign-in page."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="create-staff" loading={isSubmitting}>
            Add member
          </Button>
        </>
      }
    >
      <form id="create-staff" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="s-name" error={errors.name?.message}>
            <Input id="s-name" aria-invalid={!!errors.name} {...form.register("name")} />
          </Field>
          <Field label="Role" htmlFor="s-role" error={errors.role?.message}>
            <Select id="s-role" {...form.register("role")}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </div>
        <Field label="Email" htmlFor="s-email" error={errors.email?.message}>
          <Input id="s-email" type="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field label="Temporary password" htmlFor="s-password" error={errors.password?.message}>
          <Input id="s-password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
          <PasswordChecklist value={form.watch("password") ?? ""} />
        </Field>
      </form>
    </Dialog>
  );
}
