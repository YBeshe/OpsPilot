/** Rolling window end for materializing recurring series (UTC calendar days from now). */
export function materializationHorizonUtc() {
  const raw = Number(process.env.OPS_RECURRENCE_HORIZON_DAYS ?? "180");
  const days = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 180;
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);
  return until;
}
