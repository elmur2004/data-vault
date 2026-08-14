export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 pb-[18px]">
      <div className="min-w-0">
        <h1 className="display text-[18px] text-ink md:text-[22px]">{title}</h1>
        {subtitle ? <p className="mt-[7px] text-[13px] text-ink-60">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}
