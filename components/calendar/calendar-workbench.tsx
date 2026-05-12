"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type CalendarWire = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  description: string | null;
  location: string | null;
  source: "INTERNAL" | "OUTLOOK";
  outlookEventId: string | null;
  outlookWebLink: string | null;
  notifyWebex: boolean;
  webexDelivery: "NONE" | "SKIPPED" | "SENT" | "FAILED";
  webexHttpStatus: number | null;
  allDay: boolean;
  teamId: string | null;
  seriesId: string | null;
  team: { id: string; name: string; slug: string } | null;
  series: {
    id: string;
    recurrence: string;
    recurrenceEndsAt: string | null;
    active: boolean;
  } | null;
};

type TeamWire = { id: string; name: string; slug: string; createdAt: string };

type EventsResponse = {
  window: { from: string; to: string };
  events: CalendarWire[];
};

type TeamsResponse = { teams: TeamWire[] };

type StatusResponse = {
  outlook: {
    connected: boolean;
    userPrincipalName: string | null;
    tenantId: string | null;
    scopes: string | null;
  };
  webex: { configured: boolean };
};

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function CalendarWorkbench() {
  const search = useSearchParams();
  const outlookSignal = search.get("outlook");
  const outlookReason = search.get("reason");

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [events, setEvents] = useState<CalendarWire[]>([]);
  const [teams, setTeams] = useState<TeamWire[]>([]);
  const [teamFilterId, setTeamFilterId] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    [],
  );

  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    startsAt: "",
    endsAt: "",
    timeZone: defaultTimeZone,
    notifyWebex: false,
    teamId: "",
    recurrence: "",
    recurrenceEndsAt: "",
    quickAdd: "",
  });

  useEffect(() => {
    setForm((prev) => ({ ...prev, timeZone: defaultTimeZone }));
  }, [defaultTimeZone]);

  useEffect(() => {
    setForm((prev) => {
      if (prev.teamId || teams.length === 0) return prev;
      return { ...prev, teamId: teams[0]?.id ?? "" };
    });
  }, [teams]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const eventsUrl =
        teamFilterId ?
          `/api/v1/calendar/events?teamId=${encodeURIComponent(teamFilterId)}`
        : "/api/v1/calendar/events";

      const [statusRes, eventsRes, teamsRes] = await Promise.all([
        fetch("/api/v1/integrations/status", { cache: "no-store" }),
        fetch(eventsUrl, { cache: "no-store" }),
        fetch("/api/v1/teams", { cache: "no-store" }),
      ]);

      const statusJson = await parseJson(statusRes);
      const eventsJson = await parseJson(eventsRes);
      const teamsJson = await parseJson(teamsRes);

      if (!statusRes.ok || !statusJson?.ok) {
        throw new Error(statusJson?.error?.message ?? "Unable to load integration status.");
      }
      if (!eventsRes.ok || !eventsJson?.ok) {
        throw new Error(eventsJson?.error?.message ?? "Unable to load calendar events.");
      }
      if (!teamsRes.ok || !teamsJson?.ok) {
        throw new Error(teamsJson?.error?.message ?? "Unable to load teams.");
      }

      setStatus(statusJson.data as StatusResponse);
      setEvents((eventsJson.data as EventsResponse).events);
      setTeams((teamsJson.data as TeamsResponse).teams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [teamFilterId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBanner(null);

    const qa = form.quickAdd.trim();

    if (!form.teamId) {
      setError("Select a team / org.");
      return;
    }

    if (!qa) {
      if (!form.title.trim()) {
        setError('Enter a title or describe the meeting in "Plain-language schedule".');
        return;
      }
      if (!form.startsAt || !form.endsAt) {
        setError("Choose start/end times or add Plain-language scheduling text.");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      timeZone: form.timeZone,
      teamId: form.teamId,
      notifyWebex: form.notifyWebex,
    };

    if (qa) payload.quickAdd = qa;
    if (form.title.trim()) payload.title = form.title.trim();
    if (!(qa.length > 0) && form.startsAt && form.endsAt) {
      payload.startsAt = new Date(form.startsAt).toISOString();
      payload.endsAt = new Date(form.endsAt).toISOString();
    }
    if (form.description.trim()) payload.description = form.description;
    else payload.description = null;
    if (form.location.trim()) payload.location = form.location;
    else payload.location = null;

    if (form.recurrence) {
      payload.recurrence = form.recurrence;
      if (form.recurrenceEndsAt) {
        payload.recurrenceEndsAt = new Date(form.recurrenceEndsAt).toISOString();
      }
    }

    const res = await fetch("/api/v1/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await parseJson(res);
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message ?? "Create failed.");
      return;
    }
    const data = json.data as {
      event?: CalendarWire;
      series?: { id: string; recurrence: string };
      occurrencesMaterialized?: number;
      materializedUntilUtc?: string;
    };
    if (data.series) {
      setBanner(
        `Recurring series saved (${data.series.recurrence}). Materialized ${data.occurrencesMaterialized ?? 0} occurrence(s) through ${data.materializedUntilUtc ?? "the configured horizon"}. Schedule POST /api/v1/calendar/recurrence/tick with Authorization: Bearer and OPS_CRON_SECRET to roll new dates forward.`,
      );
    }
    setForm((prev) => ({
      ...prev,
      title: "",
      description: "",
      location: "",
      quickAdd: "",
      notifyWebex: false,
      recurrence: "",
      recurrenceEndsAt: "",
    }));
    await refreshAll();
  }

  async function handleSyncOutlook() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/calendar/sync-outlook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays: 180 }),
      });
      const json = await parseJson(res);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? "Outlook sync failed.");
      }
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Outlook sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this OpsPilot-hosted event?")) return;
    setError(null);
    const res = await fetch(`/api/v1/calendar/events/${id}`, {
      method: "DELETE",
    });
    const json = await parseJson(res);
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message ?? "Delete failed.");
      return;
    }
    await refreshAll();
  }

  const formatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  return (
    <div className="space-y-8">
      {outlookSignal === "connected" ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-4 text-emerald-200">
          Microsoft 365 authorization completed. Pull the latest Outlook schedule to hydrate OpsPilot.
        </div>
      ) : null}
      {outlookSignal === "error" ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-4 text-red-200">
          Outlook connection failed
          {outlookReason ? `: ${decodeURIComponent(outlookReason)}` : "."}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}
      {banner ? (
        <div className="rounded-lg border border-sky-500/40 bg-sky-950/30 p-3 text-sm text-sky-100">
          {banner}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Connections (Outlook · Webex)</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              OpsPilot stores a working calendar locally, mirrors Outlook via Microsoft Graph, and can notify Cisco Webex using a Bot token.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/v1/integrations/microsoft/authorize";
              }}
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow hover:bg-slate-100"
            >
              Connect Outlook
            </button>
            <button
              type="button"
              disabled={syncing || !status?.outlook.connected}
              onClick={() => void handleSyncOutlook()}
              className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {syncing ? "Syncing…" : "Pull from Outlook"}
            </button>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
            >
              Refresh view
            </button>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-slate-950/55 p-4 ring-1 ring-slate-800">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outlook · Microsoft 365</dt>
            <dd className="mt-2 text-sm text-slate-100">
              {loading && !status ? (
                "Checking…"
              ) : status?.outlook.connected ? (
                <>
                  Connected
                  <div className="mt-2 text-xs text-slate-400">
                    {status.outlook.userPrincipalName ?? status.outlook.tenantId ?? "principal pending"}
                  </div>
                </>
              ) : (
                "Not connected"
              )}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-950/55 p-4 ring-1 ring-slate-800">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Webex bot</dt>
            <dd className="mt-2 text-sm text-slate-100">
              {loading && !status ? "Checking…" : status?.webex.configured ? "Ready to post" : "Configure bot + room"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-950/55 p-4 ring-1 ring-slate-800">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Events loaded</dt>
            <dd className="mt-3 text-2xl font-semibold text-white">{loading ? "—" : events.length}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/35 p-6">
        <h3 className="text-lg font-semibold text-white">Create OpsPilot event</h3>
        <p className="mt-1 text-sm text-slate-400">
          Pick a team, optional Webex ping, and a repeat cadence (materialized rows). One-off rows skip frequency.
          Recurring reminders only post Webex once (first occurrence).
          Describe the slot below; when that box has text we take <strong className="text-slate-200">start/end time from those words only</strong> — the picker fields above are ignored for that submission.
        </p>
        <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={handleCreate}>
          <label className="flex flex-col gap-2 text-sm text-slate-300 lg:col-span-2">
            Plain-language shortcut — schedule time is read only from this text when it is filled (start/end fields above are skipped). Optional.
            <textarea
              rows={3}
              value={form.quickAdd}
              onChange={(e) => setForm((p) => ({ ...p, quickAdd: e.target.value }))}
              placeholder='Example: “Weekly Release Management CAB tomorrow at 09:30 for 45 minutes, webex, until December 31”'
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Team / org
            <select
              required
              value={form.teamId}
              onChange={(e) => setForm((p) => ({ ...p, teamId: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="" disabled>
                {teams.length ? "Select a team" : "Loading teams…"}
              </option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Repeat (frequency)
            <select
              value={form.recurrence}
              onChange={(e) => setForm((p) => ({ ...p, recurrence: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="">One-time event</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Every two weeks</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </label>
          {form.recurrence ? (
            <label className="flex flex-col gap-2 text-sm text-slate-300 lg:col-span-2">
              Series ends (optional, local)
              <input
                type="datetime-local"
                value={form.recurrenceEndsAt}
                onChange={(e) => setForm((p) => ({ ...p, recurrenceEndsAt: e.target.value }))}
                className="max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-[11px] text-slate-500">
                Leave blank to follow the rolling horizon (OPS_RECURRENCE_HORIZON_DAYS) plus scheduled ticks.
              </span>
            </label>
          ) : null}
          <label className="flex flex-col gap-2 text-sm text-slate-300 lg:col-span-2">
            Title
            <input
              required
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Location
            <input
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300 lg:col-span-2">
            Description
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Starts (local)
            <input
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            Ends (local)
            <input
              type="datetime-local"
              required
              value={form.endsAt}
              onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-300">
            IANA timezone label
            <input
              required
              value={form.timeZone}
              onChange={(e) => setForm((p) => ({ ...p, timeZone: e.target.value }))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-200 lg:col-span-2">
            <input
              type="checkbox"
              checked={form.notifyWebex}
              onChange={(e) => setForm((p) => ({ ...p, notifyWebex: e.target.checked }))}
            />
            Notify Webex after creation
          </label>
          <div className="lg:col-span-2">
            <button type="submit" className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400">
              Save event
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/25 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">Timeline</h3>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Team filter
              <select
                value={teamFilterId}
                onChange={(e) => setTeamFilterId(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
              >
                <option value="">All teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {loading ? <span className="text-xs uppercase tracking-wide text-slate-500">Loading…</span> : null}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Series</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Webex</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {events.map((evt) => {
                const mutable = evt.source === "INTERNAL" && !evt.outlookEventId;
                return (
                  <tr key={evt.id} className="text-slate-200">
                    <td className="py-3 pr-4 align-top text-xs text-slate-400">
                      <div>{formatter.format(new Date(evt.startsAt))}</div>
                      <div className="text-[11px] text-slate-600">→ {formatter.format(new Date(evt.endsAt))}</div>
                    </td>
                    <td className="py-3 pr-4 align-top">
                      <div className="font-medium text-white">{evt.title}</div>
                      {evt.location ? <div className="text-xs text-slate-500">{evt.location}</div> : null}
                    </td>
                    <td className="py-3 pr-4 align-top text-xs text-slate-400">
                      {evt.team?.name ?? "—"}
                    </td>
                    <td className="py-3 pr-4 align-top text-[11px] text-slate-500">
                      {evt.series ?
                        <>
                          <div className="uppercase tracking-wide">{evt.series.recurrence}</div>
                          <div className="text-slate-600">{evt.series.active ? "active" : "stopped"}</div>
                        </>
                      : "—"}
                    </td>
                    <td className="py-3 pr-4 align-top text-xs uppercase tracking-wide text-slate-500">{evt.source}</td>
                    <td className="py-3 pr-4 align-top text-xs text-slate-400">
                      {evt.webexDelivery}
                      {typeof evt.webexHttpStatus === "number" ? ` · HTTP ${evt.webexHttpStatus}` : null}
                    </td>
                    <td className="py-3 pr-0 text-right align-top">
                      {evt.outlookWebLink ? (
                        <a className="text-xs text-sky-400 underline" href={evt.outlookWebLink} target="_blank" rel="noreferrer">
                          Open in Outlook
                        </a>
                      ) : null}
                      {mutable ? (
                        <button type="button" className="ml-3 text-xs text-rose-300 hover:text-rose-200" onClick={() => void handleDelete(evt.id)}>
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && events.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No events in the default window. Connect Outlook and pull, or create a new OpsPilot event.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
