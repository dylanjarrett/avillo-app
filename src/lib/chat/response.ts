//lib/chat/response
import { NextResponse } from "next/server";

export function ok(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standardizes returning results from your lib/chat functions:
 * - if !ok: return error payload with correct status
 * - if ok: return whole payload (minus status/error) with status 200/201
 */
export function fromLib(result: any, successStatus = 200) {
  if (!result?.ok) {
    const status = result?.status ?? 400;
    const payload = result?.error ?? { error: "Request failed" };
    return NextResponse.json(payload, { status });
  }

  // remove internal routing fields if you want — but safe to return as-is
  return NextResponse.json(result, { status: successStatus });
}
