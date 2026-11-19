import { useCallback, useState } from "react";
import { ApiError, api } from "../lib/api";
import { piAuthenticate, piDiagnostics, setPiSandbox } from "../lib/pi";

const KEY = "vc:user";

function readUser(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Message utile pour l'utilisateur ET assez précis pour qu'une capture d'écran permette de diagnostiquer. */
export function explainLoginError(e: unknown): string {
  if (e instanceof ApiError) return `${e.message} (code ${e.code}${e.status ? `, ${e.status}` : ""})`;
  if (e instanceof Error && e.message === "PI_UNAVAILABLE") {
    return "Le SDK Pi n'est pas disponible. Ouvrez ValueConvert dans Pi Browser.";
  }
  const name = e instanceof Error && e.name !== "Error" ? `${e.name} : ` : "";
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e ?? "");
  const detail = `${name}${(msg ?? "").slice(0, 160)}`.trim();
  return `La connexion Pi a échoué${detail ? ` — ${detail}` : ""}. [${piDiagnostics()}]`;
}

/**
 * Connexion Pi : le navigateur ne transmet que le jeton d'accès, que le serveur vérifie auprès de la Platform API.
 * Seul le nom d'utilisateur (non secret) est gardé pour la durée de la session de l'onglet.
 */
export function useAuth() {
  const [user, setUser] = useState<string | null>(readUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const cfg = await api.config().catch(() => null);
      setPiSandbox(cfg?.piSandbox === true);
      const token = await piAuthenticate();
      const r = await api.piVerify(token);
      const name = r.username ?? "Pionnier";
      try {
        window.sessionStorage.setItem(KEY, name);
      } catch {
        /* stockage indisponible : la session ne survivra pas au rechargement */
      }
      setUser(name);
    } catch (e) {
      setError(explainLoginError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  return { user, busy, error, login, logout };
}
