import type { ReactNode } from "react";
import { Loader2, ChevronRight } from "./icons";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">{eyebrow}</p>
        )}
        <h1 className={cn("truncate text-xl font-semibold tracking-tight", eyebrow && "mt-1")}>{title}</h1>
        {description && <div className="mt-1 text-xs leading-5 text-neutral-500">{description}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[1.2rem] border border-white/75 bg-white/62 p-4 shadow-sm backdrop-blur", className)}>
      {children}
    </section>
  );
}

export function SectionHeading({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 mt-6 flex items-end justify-between gap-3 first:mt-1">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">{eyebrow}</p>
        )}
        <h2 className={cn("truncate text-base font-semibold", eyebrow && "mt-0.5")}>{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent = "text-neutral-950",
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="min-w-0 rounded-[1rem] border border-white/70 bg-white/62 p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400">{label}</p>
      <p className={cn("mt-1 truncate text-lg font-semibold tabular-nums tracking-tight", accent)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-neutral-400">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[1.1rem] border border-dashed border-neutral-950/10 bg-white/45 px-5 py-8 text-center">
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-white text-neutral-400 shadow-sm">{icon}</div>}
      <p className="text-sm font-medium text-neutral-800">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs leading-5 text-neutral-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "加载中…" }: { label?: string }) {
  return (
    <p role="status" className="flex items-center justify-center gap-2 py-8 text-xs text-neutral-400">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </p>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-[0.85rem] border border-rose-200/70 bg-rose-50/80 px-3 py-2.5 text-xs leading-5 text-rose-700">
      {message}
    </p>
  );
}

export function DetailHeader({
  backLabel,
  onBack,
  label,
  title,
  meta,
  visual,
  actions,
}: {
  backLabel: string;
  onBack: () => void;
  label: string;
  title: string;
  meta: ReactNode;
  visual: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pb-4">
      <button type="button" onClick={onBack} className="tap-scale mb-3 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        <ChevronRight className="size-4 rotate-180" />
        {backLabel}
      </button>
      <div className="flex items-center gap-4 rounded-[1.35rem] border border-white/75 bg-white/62 p-4 shadow-sm">
        {visual}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-400">{label}</p>
          <h1 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug">{title}</h1>
          <div className="mt-1 text-xs text-neutral-500">{meta}</div>
          {actions && <div className="mt-3 flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
