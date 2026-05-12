import { Suspense } from "react";

import { CalendarWorkbench } from "@/components/calendar/calendar-workbench";

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-400">
          Sprint focus · Calendar tooling
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Unified Outlook + OpsPilot rhythm
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Microsoft Graph keeps the Outlook calendar authoritative. OpsPilot
          maintains an operational working copy Webex bots can amplify for
          platform teams — no Salesforce automation in this lane yet.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-10 text-sm text-slate-500">
            Preparing calendar…
          </div>
        }
      >
        <CalendarWorkbench />
      </Suspense>
    </div>
  );
}
