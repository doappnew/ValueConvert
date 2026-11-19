import type { Mode, SourceInfo, StatusResponse } from "../types";

export type Health = "loading" | "live" | "stale" | "down" | "offline";

/** Résume l'état des sources utilisées par le mode courant. */
export function healthOf(
  mode: Mode,
  status: StatusResponse | null,
  loading: boolean,
  online: boolean,
): Health {
  if (!online) return "offline";
  if (loading && !status) return "loading";
  if (!status) return "down";
  const sources: SourceInfo[] = mode === "gcv" ? [status.fx] : [status.price, status.fx];
  if (sources.some((s) => s.state === "unavailable")) return "down";
  if (sources.some((s) => s.state === "stale")) return "stale";
  return "live";
}

const LABELS: Record<Health, string> = {
  loading: "Connexion…",
  live: "Données à jour",
  stale: "Données périmées",
  down: "Données indisponibles",
  offline: "Hors ligne",
};

export function StatusPill({ health, mode }: { health: Health; mode: Mode }) {
  const gcvNote = mode === "gcv" && health === "live";
  return (
    <span className={`status-pill ${gcvNote ? "gcv" : health}`} role="status">
      <i aria-hidden="true" />
      {gcvNote ? "Référence hypothétique" : LABELS[health]}
    </span>
  );
}

export function StateChip({ state }: { state: SourceInfo["state"] }) {
  const text = state === "live" ? "À jour" : state === "stale" ? "Périmé" : "Indisponible";
  return <span className={`chip-state ${state}`}>{text}</span>;
}
