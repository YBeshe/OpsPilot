import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-wide text-slate-400">
          DevOps &amp; Platform Automation Hub
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-white">OpsPilot</h1>
        <p className="mt-4 text-lg text-slate-300">
          Architecture and delivery phases are documented under{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-sm">
            docs/ARCHITECTURE.md
          </code>{" "}
          and{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-sm">
            docs/PHASING.md
          </code>
          . Product UI now includes a scaffolded dashboard and versioned REST
          health checks.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        >
          Open dashboard
        </Link>
        <Link
          href="/api/v1/health"
          prefetch={false}
          className="inline-flex rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-sky-400/60 hover:text-white"
        >
          Health JSON
        </Link>
      </div>

      <ul className="list-inside list-disc space-y-2 text-slate-400">
        <li>
          Run locally:{" "}
          <code className="text-slate-200">
            npm install && npm run docker:db && npm run db:migrate && npm run db:seed &&
            npm run dev
          </code>{" "}
          — app on <code className="text-slate-200">http://localhost:3010</code>
        </li>
        <li>
          Package name{" "}
          <code className="text-slate-200">opspilot</code> satisfies npm casing
          rules; the branded product name stays OpsPilot.
        </li>
      </ul>
    </main>
  );
}
