import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/store";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export function parsePagination(
  pageRaw: unknown,
  limitRaw: unknown,
  defaultLimit = DEFAULT_PAGE_SIZE,
): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Math.floor(Number(pageRaw)) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(limitRaw)) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escapa el texto del buscador para usarlo dentro de un RegExp de Mongo. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
