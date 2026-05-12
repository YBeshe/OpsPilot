import Link from "next/link";

export default function DashboardHomePage() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/35 p-6">
        <h2 className="text-xl font-semibold text-white">
          Operational snapshot
        </h2>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          KPI tiles and charts will bind to Postgres once release and Copado /
          Jira entities exist. Until then use the health probe to validate the
          API shell.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          <li className="rounded-lg bg-slate-950/55 p-4 ring-1 ring-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Releases
            </p>
            <p className="mt-3 text-2xl font-semibold text-slate-300">—</p>
          </li>
          <li className="rounded-lg bg-slate-950/55 p-4 ring-1 ring-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Active validations
            </p>
            <p className="mt-3 text-2xl font-semibold text-slate-300">—</p>
          </li>
          <li className="rounded-lg bg-slate-950/55 p-4 ring-1 ring-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Pending approvals
            </p>
            <p className="mt-3 text-2xl font-semibold text-slate-300">—</p>
          </li>
          <li className="rounded-lg bg-slate-950/55 p-4 ring-1 ring-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Support SLA
            </p>
            <p className="mt-3 text-2xl font-semibold text-slate-300">—</p>
          </li>
        </ul>
        <p className="mt-5 text-xs text-slate-600">
          API:{" "}
          <Link
            className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
            href="/api/v1/health"
          >
            /api/v1/health
          </Link>
        </p>
      </div>
    </div>
  );
}
