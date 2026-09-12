import { getApiConnection, setApiConnection, type ApiConnection } from "@/lib/api";

export type PairingPayload = {
  app: "aria";
  version: number;
  urls: string[];
  token: string;
};

// The desktop settings card renders a QR code containing this JSON. Phone
// cameras / in-app scanners hand us the raw text.
export function parsePairingPayload(text: string): PairingPayload | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<PairingPayload>;
    if (parsed.app !== "aria" || !Array.isArray(parsed.urls) || !parsed.urls.length) return null;
    const urls = parsed.urls
      .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url))
      .slice(0, 4);
    if (!urls.length) return null;
    return {
      app: "aria",
      version: Number(parsed.version) || 1,
      urls,
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return null;
  }
}

export function readConnection(): ApiConnection {
  return getApiConnection();
}

export function saveConnection(serverUrl: string, token: string): ApiConnection {
  return setApiConnection({ serverUrl, token });
}

export function clearConnection(): void {
  setApiConnection(null);
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "unreachable" | "unauthorized" };

export async function verifyConnection(serverUrl: string, token: string, timeoutMs = 5000): Promise<VerifyResult> {
  const base = serverUrl.trim().replace(/\/+$/, "");
  const url = /^https?:\/\//i.test(base) ? base : `http://${base}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/api/remote-access?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    });
    if (response.status === 401) return { ok: false, reason: "unauthorized" };
    if (!response.ok) return { ok: false, reason: "unreachable" };
    const body = (await response.json()) as { enabled?: boolean };
    if (body.enabled === false) return { ok: false, reason: "unreachable" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    window.clearTimeout(timer);
  }
}
