import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  CORRELATION_HEADER,
  normalizeCorrelationId,
} from "@/lib/correlation";

export function middleware(request: NextRequest) {
  const correlationId = normalizeCorrelationId(
    request.headers.get(CORRELATION_HEADER),
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(CORRELATION_HEADER, correlationId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
