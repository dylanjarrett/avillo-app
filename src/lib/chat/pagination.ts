//lib/chat/pagination
export function clampInt(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function getSearchParams(req: Request) {
  return new URL(req.url).searchParams;
}
