import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges conditional class names (clsx) and resolves Tailwind conflicts (twMerge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
