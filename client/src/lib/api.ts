import type { AppConfig, ConvertParams, ConvertResponse, Currency, StatusResponse } from "../types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const TIMEOUT_MS = 12_000;

async function request<T>(path: string, init: RequestInit = {}, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onAbort = () => controller.abort();
  outer?.addEventListener("abort", onAbort);

  try {
    let res: Response;
    try {
      res = await fetch(path, {
        ...init,
        signal: controller.signal,
        headers: { accept: "application/json", ...(init.headers ?? {}) },
      });
    } catch (e) {
      if (outer?.aborted) throw e; // annulation volontaire : l'appelant l'ignore
      if (timedOut) throw new ApiError("TIMEOUT", "Le serveur met trop de temps à répondre.");
      throw new ApiError("NETWORK", "Pas de connexion au serveur. Vérifiez votre réseau.");
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(err?.code ?? "HTTP_ERROR", err?.message ?? `Erreur du serveur (${res.status}).`, res.status);
    }
    if (body === null) throw new ApiError("BAD_RESPONSE", "Réponse du serveur illisible.", res.status);
    return body as T;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

export const api = {
  config: (signal?: AbortSignal) => request<AppConfig>("/api/config", {}, signal),
  currencies: (signal?: AbortSignal) => request<{ currencies: Currency[] }>("/api/currencies", {}, signal),
  status: (signal?: AbortSignal) => request<StatusResponse>("/api/status", {}, signal),
  convert: (p: ConvertParams, signal?: AbortSignal) => {
    const qs = new URLSearchParams({
      mode: p.mode,
      direction: p.direction,
      amount: p.amount,
      currency: p.currency,
    });
    if (p.mode === "gcv" && p.gcvReference) qs.set("gcvReference", p.gcvReference);
    return request<ConvertResponse>(`/api/convert?${qs.toString()}`, {}, signal);
  },
  piVerify: (accessToken: string) =>
    request<{ username: string | null }>("/api/pi/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken }),
    }),
};
