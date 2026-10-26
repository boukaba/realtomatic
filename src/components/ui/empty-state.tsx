import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <Icon className="h-7 w-7 text-zinc-500" />
      </div>
      <h3 className="text-base font-semibold text-zinc-200">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-zinc-500">{description}</p>
      )}
      {action && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-5"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
