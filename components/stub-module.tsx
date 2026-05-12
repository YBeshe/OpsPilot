import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle: string;
  children?: ReactNode;
};

export function StubModule({ title, subtitle, children }: Props) {
  return (
    <section className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-prose text-slate-400">{subtitle}</p>
      {children ? (
        <div className="mt-4 text-sm text-slate-500">{children}</div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          Connectors are deferred; this slice will wire into Prisma-backed
          entities in later phases (see docs/PHASING.md).
        </p>
      )}
    </section>
  );
}
