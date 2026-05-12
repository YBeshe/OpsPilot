export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div>
        <p className="text-sm uppercase tracking-wide text-slate-400">
          DevOps &amp; Platform Automation Hub
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-white">OpsPilot</h1>
        <p className="mt-4 text-lg text-slate-300">
          Greenfield scaffold. Architecture and delivery phases are documented under{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-sm">
            docs/ARCHITECTURE.md
          </code>{" "}
          and{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-sm">
            docs/PHASING.md
          </code>
          .
        </p>
      </div>

      <ul className="list-inside list-disc space-y-2 text-slate-400">
        <li>
          Run locally:{" "}
          <code className="text-slate-200">cd OpsPilot && npm install && npm run dev</code>{" "}
          — default port <code className="text-slate-200">3010</code>
        </li>
        <li>
          NPM package name is <code className="text-slate-200">opspilot</code> (npm
          naming rules); the product name is OpsPilot.
        </li>
      </ul>
    </main>
  );
}
