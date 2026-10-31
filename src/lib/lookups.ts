/**
 * Shared option lists for selects (plans, products, taxes, templates). Lives in lib so
 * modules never import each other's pages. Owner: Person 1.
 */
import { useQuery } from "@tanstack/react-query";
import type { Plan, Product, ProductVariant, Tax } from "@shared/types";
import { api } from "./api";

const LOOKUP = { page: 1, pageSize: 100 };

export function usePlans(opts: { activeOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ["lookup", "plans", opts.activeOnly],
    queryFn: () => api.list<Plan>("/plans", { ...LOOKUP, status: opts.activeOnly ? "active" : undefined }),
    select: (r) => r.data,
    staleTime: 60_000,
  });
}

export function useProducts(opts: { activeOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ["lookup", "products", opts.activeOnly],
    queryFn: () => api.list<Product>("/products", { ...LOOKUP, active: opts.activeOnly ? "true" : undefined }),
    select: (r) => r.data,
    staleTime: 60_000,
  });
}

/** Product with its variants (for line editors). */
export function useProductDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => api.get<{ data: Product & { variants: ProductVariant[] } }>(`/products/${id}`).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useTaxes() {
  return useQuery({ queryKey: ["lookup", "taxes"], queryFn: () => api.list<Tax>("/taxes", LOOKUP), select: (r) => r.data, staleTime: 60_000 });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["lookup", "templates"],
    queryFn: () => api.list<{ id: string; name: string; planName: string; validityDays: number; lineCount: number }>("/quotation-templates", LOOKUP),
    select: (r) => r.data,
    staleTime: 60_000,
  });
}
