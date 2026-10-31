# Design system

Direction: calm, precise finance software in the style of payments startups such as Stripe, Mercury and Ramp. Warm-neutral canvas, white cards with hairline borders, a dark sidebar, one indigo accent, tabular numbers, dense but readable tables. Colour carries meaning (status), not decoration.

Tokens live in [`src/styles.css`](../src/styles.css) as Tailwind 4 `@theme` variables. **Never hard-code colours in screens**; use the token utilities below.

## Tokens

| Token | Utility | Use |
| --- | --- | --- |
| `canvas` #fafaf9 | `bg-canvas` | Page background |
| `surface` #ffffff | `bg-surface` | Cards, inputs, dialogs |
| `subtle` / `hover` | `bg-subtle`, `hover:bg-hover` | Table hover, footers, skeletons |
| `line` / `line-strong` | `border-line` | Hairline borders, dividers |
| `ink` | `text-ink` | Headings, primary text, primary button |
| `body` / `muted` / `faint` | `text-body` … | Body copy, secondary text, placeholders |
| `primary` (indigo 600) | `text-primary`, `bg-primary-soft` | Links, focus rings, selected state. One primary colour only |
| `sidebar` (zinc 900) | `bg-sidebar` | App sidebar and auth panel |
| `draft` grey | `StatusBadge` | Draft, closed, low |
| `pending` amber | `StatusBadge` | Quotation, paused, open, medium |
| `success` green | `StatusBadge` | Active, paid, resolved |
| `danger` red | `StatusBadge` | Overdue, cancelled, critical/high |

Typography: Inter Variable, self-hosted via `@fontsource-variable/inter` (works offline). Base 14px; table and helper text 12–13px; page titles 20px semibold with tight tracking. Use the `tabular` utility (or right-aligned table cells, which apply it) for every amount.

Spacing: 8px scale (Tailwind 2 = 8px). Page gutter 24px desktop, 16px mobile (`<Page>`). Radius: 6/8/12px. Shadows: `shadow-card` (hairline) and `shadow-pop` (menus, dialogs, toasts).

Breakpoints: 360px phone, 768px (`md`) tablet — sidebar becomes a drawer and tables become stacked cards — 1280px desktop.

## Components (`src/components/ui`)

| Component | Notes |
| --- | --- |
| `Page`, `PageHeader` | Every screen starts with these. Actions go in `PageHeader.actions`. |
| `Button` | `primary` (ink), `secondary`, `ghost`, `danger`; `size="sm"`; `loading` |
| `Field` + `Input` / `Textarea` / `Select` / `Switch` | `Field` shows label, hint and inline error. Set `aria-invalid` on the control. |
| `Card`, `CardHeader`, `Stat` | `Stat` for dashboard headline numbers |
| `Badge`, `StatusBadge` | Map every status to a tone in `badge.tsx`, never in a screen |
| `DataTable` + `useListParams` | Server pagination/sort/search in the URL; mobile cards; loading, empty and error states built in |
| `Dialog`, `ConfirmDialog` | Native `<dialog>`; confirm every destructive or irreversible action |
| `useToast` | `toast.success()` / `toast.error()` after mutations |
| `EmptyState`, `ErrorState`, `Skeleton`, `Spinner`, `Alert` | Feedback states |

Layout: `AppShell` (sidebar, top bar with page title, global search and user menu) for both the staff app and the customer portal; `AuthLayout` for sign-in screens. Navigation comes from `src/app/navigation.ts` and is filtered by role.

## Patterns

- **Forms:** `useZodForm(sharedSchema)` + `Field`. Errors appear on blur; server `fields` are applied with `applyServerErrors`. Submit buttons show `loading`.
- **Lists:** see `src/modules/staff/staff-page.tsx` as the reference implementation.
- **Money:** display with `money("2560.00")` from `src/lib/utils.ts`; never parse floats for calculations.
- **Simulated actions:** label demo-only effects (emails, usage data) with a `pending` badge "Simulated".
- **Print:** add `no-print` to chrome; invoices print from a dedicated print route.
- **Copy:** sentence case, short, specific. Buttons say what happens ("Record payment", not "Submit").
