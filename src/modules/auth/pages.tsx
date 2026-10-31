/** AUTH-1, AUTH-2 screens. Owner: Person 1. */
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { Check, Circle, MailCheck } from "lucide-react";
import {
  forgotPasswordSchema,
  loginSchema,
  PASSWORD_RULES,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@shared/schemas";
import { AuthLayout } from "@/components/layout/app-shell";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { homePathFor, useAuthActions } from "@/lib/auth";
import { applyServerErrors, useZodForm } from "@/lib/forms";
import { cn } from "@/lib/utils";

function Heading({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[13px] text-muted">{subtitle}</p>
    </div>
  );
}

function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginPage() {
  const { login } = useAuthActions();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(loginSchema, { defaultValues: { email: "", password: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const { user } = await login.mutateAsync(values);
      navigate(safeNext(params.get("next")) ?? homePathFor(user.role), { replace: true });
    } catch (err) {
      setError(applyServerErrors(form, err));
    }
  });

  return (
    <AuthLayout>
      <Heading
        title="Sign in"
        subtitle={
          <>
            New customer?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        }
      />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          aside={
            <Link to="/forgot-password" className="text-[12px] text-muted hover:text-ink">
              Forgot password?
            </Link>
          }
        >
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
        </Field>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.id} className={cn("flex items-center gap-1.5 text-[12px]", ok ? "text-success" : "text-muted")}>
            {ok ? <Check className="size-3.5" /> : <Circle className="size-3" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}

export function SignupPage() {
  const { signup } = useAuthActions();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(signupSchema, { defaultValues: { name: "", email: "", password: "", companyName: "" } });
  const { errors } = form.formState;
  const password = form.watch("password") ?? "";

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await signup.mutateAsync(values);
      navigate("/portal", { replace: true });
    } catch (err) {
      setError(applyServerErrors(form, err));
    }
  });

  return (
    <AuthLayout>
      <Heading
        title="Create your account"
        subtitle={
          <>
            Already have one?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register("name")} />
        </Field>
        <Field label="Company" htmlFor="companyName" hint="Optional" error={errors.companyName?.message}>
          <Input id="companyName" autoComplete="organization" {...form.register("companyName")} />
        </Field>
        <Field label="Work email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
          <PasswordChecklist value={password} />
        </Field>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: "" } });
  const send = useMutation({ mutationFn: (v: ForgotPasswordInput) => api.post<{ message: string }>("/auth/forgot-password", v) });
  const { errors } = form.formState;

  return (
    <AuthLayout>
      {send.isSuccess ? (
        <div>
          <div className="mb-4 grid size-10 place-items-center rounded-lg bg-success-soft text-success">
            <MailCheck className="size-5" />
          </div>
          <Heading title="Check your email" subtitle={send.data.message} />
          <p className="text-[12px] text-muted">
            Demo mode: emails are simulated and stored in the outbox; the reset link is also printed in the worker console.
          </p>
          <Link to="/login" className="mt-6 inline-block text-[13px] font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <Heading title="Reset your password" subtitle="Enter your email and we will send a single-use reset link valid for 30 minutes." />
          <form onSubmit={form.handleSubmit((v) => send.mutate(v))} className="space-y-4" noValidate>
            {send.error && <Alert>{send.error.message}</Alert>}
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...form.register("email")} />
            </Field>
            <Button type="submit" className="w-full" loading={send.isPending}>
              Send reset link
            </Button>
            <Link to="/login" className="block text-center text-[13px] text-muted hover:text-ink">
              Back to sign in
            </Link>
          </form>
        </>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const form = useZodForm(resetPasswordSchema, { defaultValues: { token: params.get("token") ?? "", password: "" } });
  const reset = useMutation({ mutationFn: (v: ResetPasswordInput) => api.post<{ message: string }>("/auth/reset-password", v) });
  const { errors } = form.formState;
  const password = form.watch("password") ?? "";

  return (
    <AuthLayout>
      <Heading title="Choose a new password" subtitle="Signing in again will be required on every device." />
      {reset.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="success">{reset.data.message}</Alert>
          <Button className="w-full" onClick={() => navigate("/login")}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit((v) => reset.mutate(v))} className="space-y-4" noValidate>
          {(reset.error || errors.token) && <Alert>{reset.error?.message ?? "This reset link is invalid. Request a new one."}</Alert>}
          <Field label="New password" htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" autoFocus aria-invalid={!!errors.password} {...form.register("password")} />
            <PasswordChecklist value={password} />
          </Field>
          <Button type="submit" className="w-full" loading={reset.isPending}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
