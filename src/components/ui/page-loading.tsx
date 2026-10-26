import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface PageLoadingProps {
  message?: string;
  className?: string;
}

export function PageLoading({
  message = "Loading...",
  className,
}: PageLoadingProps) {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      <p className="text-sm font-medium text-zinc-400">{message}</p>
    </div>
  );
}

export default PageLoading;
