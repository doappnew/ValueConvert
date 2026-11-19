import { useState } from "react";
import { ReferenceEditor } from "../components/ReferenceEditor";
import { StateChip } from "../components/StatusPill";
import { useNow } from "../hooks/useMisc";
import { ApiError, api } from "../lib/api";
import { formatWhen } from "../lib/format";
import { isPiBrowser, piAuthenticate } from "../lib/pi";
import type { AppConfig, SourceInfo, StatusResponse } from "../types";

interface Props {
  config: AppConfig | null;
  status: StatusResponse | null;
  statusError: ApiError | null;
  statusLoading: boolean;
  onRefreshStatus: () => void;
  gcvRef: string;
  gcvDefault: string;
  onGcvRef: (v: string) => void;
}

function SourceCard({ title, info, now }: { title: string; info: SourceInfo; now: number }) {
  return (
    <div className="info-row">
      <dt>{title}</dt>
      <dd>
        <span className="row gap-s end">
          <strong>{info.name}</strong>
          <StateChip state={info.state} />
        </span>
        {info.state === "unavailable" ? (
          <span className="sub">Aucune donnée valide pour le moment.</span>
        ) : (
          <span className="sub">Mise à jour : {formatWhen(info.sourceUpdatedAt ?? info.fetchedAt, now)}</span>
        )}
        <a className="sub" href={info.attribution.url} target="_blank" rel="noopener noreferrer">
          {info.attribution.text}
        </a>
      </dd>
    </div>
  );
}

type PiState = { s: "idle" } | { s: "busy" } | { s: "ok"; username: string | null } | { s: "error"; message: string };

export function SettingsPage(p: Props) {
  const now = useNow();
  const [pi, setPi] = useState<PiState>({ s: "idle" });
  const inPi = isPiBrowser();

  async function login() {
    setPi({ s: "busy" });
    try {
      const token = await piAuthenticate();
      const r = await api.piVerify(token); // le serveur vérifie le jeton auprès de la Platform API
      setPi({ s: "ok", username: r.username });
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error && e.message === "PI_UNAVAILABLE"
            ? "Le SDK Pi n'est pas disponible. Ouvrez ValueConvert dans Pi Browser."
            : "Connexion Pi annulée ou impossible.";
      setPi({ s: "error", message });
    }
  }

  const testnet = p.config?.env === "testnet";

  return (
    <>
      {p.config && (
        <section className="card">
          <div className="row between">
            <h2>Environnement</h2>
            <span className={`env-badge ${p.config.env}`}>{testnet ? "Testnet" : "Mainnet"}</span>
          </div>
          <p className="hint">
            {testnet
              ? "Version de test : elle sert à vérifier l'application dans Pi Browser avant la mise en service sur Mainnet. Les prix de marché affichés restent des cotations réelles."
              : "Version de production sur Pi Mainnet."}
          </p>
        </section>
      )}

      <section className="card">
        <div className="row between">
          <h2>Sources de données</h2>
          <button type="button" className="btn small ghost" onClick={p.onRefreshStatus} disabled={p.statusLoading}>
            {p.statusLoading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
        {p.status ? (
          <dl>
            <SourceCard title="Prix du Pi" info={p.status.price} now={now} />
            <SourceCard title="Taux de change" info={p.status.fx} now={now} />
          </dl>
        ) : (
          <p className="hint error">{p.statusError?.message ?? "État des sources en cours de chargement…"}</p>
        )}
        <p className="hint">
          Les prix et taux sont récupérés par le serveur, mis en cache brièvement, puis actualisés automatiquement.
          Aucune valeur n'est inventée : sans donnée valide, aucun résultat de marché n'est affiché.
        </p>
      </section>

      <ReferenceEditor value={p.gcvRef} defaultValue={p.gcvDefault} onChange={p.onGcvRef} />

      <section className="card">
        <h2>Compte Pi (facultatif)</h2>
        <p className="hint">
          Le calculateur fonctionne sans connexion. La connexion Pi n'est qu'un test d'intégration : seul le nom
          d'utilisateur est demandé, jamais de phrase secrète, de clé privée, d'e-mail ni de téléphone.
        </p>
        {inPi ? (
          <button type="button" className="btn" onClick={() => void login()} disabled={pi.s === "busy"}>
            {pi.s === "busy" ? "Connexion…" : "Se connecter avec Pi"}
          </button>
        ) : (
          <p className="hint">Disponible uniquement dans Pi Browser.</p>
        )}
        {pi.s === "ok" && (
          <p className="notice ok-notice" role="status">
            Connecté{pi.username ? ` en tant que ${pi.username}` : ""} (identité vérifiée par le serveur).
          </p>
        )}
        {pi.s === "error" && (
          <p className="notice error-notice" role="alert">
            {pi.message}
          </p>
        )}
      </section>

      <section className="card">
        <h2>À propos</h2>
        <p className="hint">
          ValueConvert convertit des montants entre le Pi et des monnaies fiat. Ce n'est pas une plateforme d'achat, de
          vente ou de transfert de cryptomonnaies. Les résultats sont des estimations indicatives, jamais des
          garanties.
        </p>
        <p className="hint">
          Application indépendante, non affiliée à Pi Network et non approuvée par Pi Network. Pi Network is a trademark
          of PI Community Company.
        </p>
        <p className="hint">Version 1.0.0</p>
      </section>
    </>
  );
}
