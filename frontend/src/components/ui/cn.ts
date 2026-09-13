import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Klasslarni birlashtiradi va ziddiyatlarni hal qiladi.
 * cn('px-4', cond && 'px-6') → 'px-6'
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
