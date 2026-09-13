import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // `skeleton-shimmer` ships a directional gradient sweep (defined in
      // globals.css) — more "human-designed" than a flat opacity pulse and
      // reads as motion toward the content rather than a flicker.
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
