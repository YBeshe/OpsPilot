import { NextResponse } from "next/server";

type OkBody<T> = { ok: true; data: T; correlationId: string };
type ErrBody = {
  ok: false;
  error: { code: string; message: string };
  correlationId: string;
};

export function jsonOk<T>(data: T, correlationId: string, init?: ResponseInit) {
  const body: OkBody<T> = { ok: true, data, correlationId };
  return NextResponse.json(body, {
    ...init,
    headers: enforceCorrelationHeader(init?.headers, correlationId),
  });
}

export function jsonErr(
  code: string,
  message: string,
  correlationId: string,
  status: number,
  init?: ResponseInit,
) {
  const body: ErrBody = {
    ok: false,
    error: { code, message },
    correlationId,
  };
  return NextResponse.json(body, {
    status,
    ...init,
    headers: enforceCorrelationHeader(init?.headers, correlationId),
  });
}

function enforceCorrelationHeader(
  headersInit: HeadersInit | undefined,
  correlationId: string,
): Headers {
  const headers = new Headers(headersInit);
  headers.set("x-correlation-id", correlationId);
  headers.set("Cache-Control", "no-store");
  return headers;
}
