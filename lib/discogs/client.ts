import type { AuthStrategy } from "./auth";

const API_BASE = "https://api.discogs.com";

/**
 * Discogs rejects requests without a descriptive User-Agent — a plain `curl`
 * with no UA gets a non-JSON error page back. Browsers forbid setting this
 * header from JS, which is one of the reasons every call is proxied through
 * our own routes rather than made from the client.
 */
const DEFAULT_USER_AGENT = "DiscogsCoverFlow/1.0 +https://github.com/discogs";

const MAX_ATTEMPTS = 3;

export class DiscogsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DiscogsApiError";
  }
}

/** Rate limit state from the most recent response, for the caller to pace on. */
export interface RateLimit {
  limit: number | null;
  remaining: number | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function userAgent(): string {
  return process.env.DISCOGS_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function buildUrl(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function readRateLimit(response: Response): RateLimit {
  const toNumber = (raw: string | null) =>
    raw === null || raw === "" ? null : Number(raw);
  return {
    limit: toNumber(response.headers.get("x-discogs-ratelimit")),
    remaining: toNumber(response.headers.get("x-discogs-ratelimit-remaining")),
  };
}

/** How long to wait before retrying a 429, honouring Retry-After when given. */
function backoffMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 10_000);
  }
  // Exponential with jitter, so parallel callers don't retry in lockstep.
  return Math.min(2 ** attempt * 500, 8_000) + Math.random() * 250;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) return body.message;
  } catch {
    // Non-JSON error page; fall through to the status text.
  }
  return response.statusText || `Discogs request failed (${response.status})`;
}

export interface DiscogsResult<T> {
  data: T;
  rateLimit: RateLimit;
}

/**
 * Single entry point for every Discogs call. Attaches the User-Agent and the
 * strategy's credential, retries rate-limited requests, and normalizes errors
 * into `DiscogsApiError` so route handlers can map status codes directly.
 */
export async function discogsFetch<T>(
  path: string,
  auth: AuthStrategy,
  options: {
    method?: string;
    searchParams?: Record<string, string | number | undefined>;
  } = {},
): Promise<DiscogsResult<T>> {
  const method = options.method ?? "GET";
  const url = buildUrl(path, options.searchParams);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent(),
        Authorization: await auth.authHeader(method, url),
      },
      cache: "no-store",
    });

    if (response.status === 429 && attempt < MAX_ATTEMPTS - 1) {
      await sleep(backoffMs(response, attempt));
      continue;
    }

    if (!response.ok) {
      throw new DiscogsApiError(await errorMessage(response), response.status);
    }

    return {
      data: (await response.json()) as T,
      rateLimit: readRateLimit(response),
    };
  }

  throw new DiscogsApiError(
    "Discogs is rate limiting this app. Wait a minute and try again.",
    429,
  );
}
