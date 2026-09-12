import { cn } from '@/lib/utils'

// Approved Super Agent placeholder mark until the final artwork is supplied (BUILD-PLAN.md BP-18/BP-19D).
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center rounded-[25%] bg-[#E65719] font-sans text-[0.7em] font-extrabold tracking-tight text-[#FEFBF8]',
        className
      )}
      {...props}
    >
      <span aria-hidden="true">SA</span>
    </span>
  )
}
