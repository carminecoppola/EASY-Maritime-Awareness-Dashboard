// Adapted from https://www.beautifului.dev/r/shimmer.json.
// EASY tokens replace the registry's global foundation and theme reset.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('easy-shimmer', className)}>{children}</span>
}
