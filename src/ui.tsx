import type { ReactNode } from "react";
import { Loader2, ChevronRight } from "./icons";
import { cn } from "@/lib/utils";

/** The one switch implementation used across settings rows. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition disabled:opacity-40 ${
        checked ? "bg-neutral-950" : "bg-neutral-200"
      }`}
    >
      <span className={`size-5 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

/** An icon + title + description row with an optional right-side control inside a clean Settings card. */
export function SettingsRow({
  icon,
  title,
  description,
  value,
  right,
  onClick,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      {icon && (
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-neutral-950/[0.045] text-neutral-700">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[14px] font-semibold leading-5 text-neutral-950">{title}</p>
          {value && <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500">{value}</span>}
        </div>
        {description && <p className="mt-0.5 text-[11.5px] leading-4 text-neutral-500">{description}</p>}
        {children}
      </div>
      {right && <div className="shrink-0 self-center">{right}</div>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="tap-scale flex w-full items-start gap-3 py-3.5 text-left transition active:opacity-80">
        {body}
      </button>
    );
  }
  return <div className="flex items-start gap-3 py-3.5">{body}</div>;
}

/** A clean elevated card group matching Home's soft-white floating surface aesthetic. */
export function SettingsGroup({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-5 first:mt-0", className)}>
      <div className="mb-2 flex items-end justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold tracking-tight text-neutral-950">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] leading-4 text-neutral-500">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="divide-y divide-neutral-950/[0.06] rounded-[1.35rem] bg-white/85 px-4 shadow-[0_10px_28px_rgba(47,55,76,0.06)] ring-1 ring-neutral-950/[0.05] backdrop-blur-sm">
        {children}
      </div>
    </section>
  );
}

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
    <header className="mt-1 flex items-center justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold text-rose-500">{eyebrow}</p>}
        <h1 className={cn("truncate text-[1.7rem] font-bold leading-tight tracking-tight text-neutral-950", eyebrow && "mt-0.5")}>{title}</h1>
        {description && <div className="mt-0.5 text-xs leading-5 text-neutral-500">{description}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[1.35rem] bg-white/85 p-4 shadow-[0_10px_28px_rgba(47,55,76,0.06)] ring-1 ring-neutral-950/[0.05] backdrop-blur-sm", className)}>
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
          <p className="text-xs font-bold text-rose-500">{eyebrow}</p>
        )}
        <h2 className={cn("truncate text-[1.15rem] font-bold tracking-tight text-neutral-950", eyebrow && "mt-0.5")}>{title}</h2>
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
    <div className="min-w-0 rounded-[1.1rem] bg-white/80 p-3 shadow-[0_8px_22px_rgba(47,55,76,0.06)] ring-1 ring-neutral-950/[0.05]">
      <p className="text-[11px] font-medium text-neutral-500">{label}</p>
      <p className={cn("mt-1 truncate text-lg font-bold tabular-nums tracking-tight", accent)}>{value}</p>
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
    <div className="flex flex-col items-center justify-center rounded-[1.35rem] bg-white/65 px-5 py-9 text-center ring-1 ring-neutral-950/[0.04]">
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-neutral-950/[0.05] text-neutral-500">{icon}</div>}
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
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
    <p role="alert" className="rounded-[1rem] border border-rose-200/70 bg-rose-50/90 px-3.5 py-2.5 text-xs leading-5 text-rose-700">
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
      <div className="aria-rise">
        <button
          type="button"
          onClick={onBack}
          className="tap-scale mb-4 inline-flex items-center gap-1 rounded-full bg-white/75 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-[0_4px_14px_rgba(47,55,76,0.08)] ring-1 ring-neutral-950/[0.05]"
        >
          <ChevronRight className="size-3.5 rotate-180" />
          {backLabel}
        </button>
        <div className="flex items-start gap-4">
          {visual}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs font-bold text-rose-500">{label}</p>
            <h1 className="mt-1 line-clamp-2 text-[1.55rem] font-bold leading-tight tracking-tight text-neutral-950">{title}</h1>
            <div className="mt-1.5 text-xs leading-5 text-neutral-500">{meta}</div>
            {actions && <div className="mt-3.5 flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
