import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Premium className combiner
 * Uses clsx + tailwind-merge to intelligently merge Tailwind classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a string to a clean URL slug
 */
export function slugify(str: string): string {
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format large numbers for dashboards (1.2k, 4.5M)
 */
export function formatNumber(value: number): string {
  if (value >= 1_000_000)
    return (value / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (value >= 1_000)
    return (value / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return value.toString();
}

/**
 * Sentence-case a string politely
 */
export function sentenceCase(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Format dates like a CRM should (Nov 20, 2025)
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Lightweight debounce for text inputs + AI text areas
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay = 400
) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

/**
 * Capitalize every word — good for names, markets, etc.
 */
export function titleCase(str: string): string {
  return str
    .split(" ")
    .map((w) => sentenceCase(w))
    .join(" ");
}

/**
 * Sleep utility (async delays)
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}