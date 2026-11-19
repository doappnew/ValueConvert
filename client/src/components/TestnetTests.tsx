import { useEffect, useState } from "react";
import { ApiError, api, type TestStatus } from "../lib/api";
import { piAuthenticateWith, piCreatePayment, type IncompletePayment } from "../lib/pi";

/** Version affichée pour savoir quelle page est réellement chargée dans Pi Browser. */
export const BUILD_ID = "1.4.0-testnet · entrée sans connexion, reprise des envois";

export function useTestStatus(): TestStatus | null {
  const [s, setS] = useState<TestStatus | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api.testStatus(c.signal).then(setS).catch(() => setS(null)); // 404 en Mainnet : aucun bouton
    return () => c.abort();
  }, []);
  return s;
}

type Phase = { s: "idle" } | { s: "busy"; step: string } | { s: "done"; text: string } | { s: "error"; text: string };

function explain(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message === "PI_UNAVAILABLE") return "Ouvrez ValueConvert dans Pi Browser pour effectuer ce test.";
  return "Test annulé ou impossible. Réessayez.";
}

function Box({ title, text, phase, children }: { title: string; text: string; phase: Phase; children: React.ReactNode }) {
  return (
    <section className="card test-card" aria-label={title}>
      <div className="row between">
        <h2>{title}</h2>
        <span className="env-badge testnet">Test Testnet</span>
      </div>
      <p className="hint">{text}</p>
      {children}
      {phase.s === "busy" && <p className="notice warn-notice" role="status">{phase.step}</p>}
      {phase.s === "done" && <p className="notice ok-notice" role="status">{phase.text}</p>}
      {phase.s === "error" && <p className="notice error-notice" role="alert">{phase.text}</p>}
    </section>
  );
}

/** Test d'envoi (A2U) : l'application envoie des Pi de test au compte connecté. Une fois par compte. */
export function SendTest({ status }: { status: TestStatus | null }) {
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  if (!status?.send.enabled) return null;

  async function run() {
    setPhase({ s: "busy", step: "Autorisation Pi en cours…" });
    try {
      // Trois autorisations pour l'envoi A2U, demandées au clic.
      const token = await piAuthenticateWith(["username", "payments", "wallet_address"], () => undefined);
      setPhase({ s: "busy", step: "Envoi en cours… patientez quelques secondes." });
      const r = await api.testSend(token);
      setPhase({ s: "done", text: `Envoi réussi : ${r.amount} Pi de test reçus sur votre portefeuille Testnet.` });
    } catch (e) {
      setPhase({ s: "error", text: explain(e) });
    }
  }

  return (
    <Box
      title="Test d'envoi"
      phase={phase}
      text={`L'application vous envoie ${status.send.amount} Pi de test (Testnet, aucune valeur réelle). Une seule fois par compte.`}
    >
      <button type="button" className="btn" onClick={() => void run()} disabled={phase.s === "busy" || phase.s === "done"}>
        Lancer le test d'envoi
      </button>
    </Box>
  );
}

/** Test de réception (U2A) : le compte connecté envoie des Pi de test à l'application. */
export function ReceiveTest({ status }: { status: TestStatus | null }) {
  const [phase, setPhase] = useState<Phase>({ s: "idle" });
  if (!status?.receive.enabled) return null;

  async function run() {
    setPhase({ s: "busy", step: "Autorisation Pi en cours…" });
    try {
      let token = "";
      const onIncomplete = (p: IncompletePayment) => {
        // Reprise d'un paiement resté en suspens : on le termine côté serveur s'il a déjà une transaction.
        if (p.identifier && p.transaction?.txid && token) void api.receiveComplete(token, p.identifier, p.transaction.txid).catch(() => undefined);
      };
      token = await piAuthenticateWith(["username", "payments"], onIncomplete);
      setPhase({ s: "busy", step: "Validez le paiement dans la fenêtre Pi…" });
      piCreatePayment(
        { amount: status!.receive.amount, memo: "ValueConvert — test Testnet (réception)", metadata: { purpose: "testnet-u2a" } },
        {
          approve: async (id) => {
            await api.receiveApprove(token, id);
          },
          complete: async (id, txid) => {
            await api.receiveComplete(token, id, txid);
            setPhase({ s: "done", text: "Réception réussie : l'application a bien reçu votre paiement de test." });
          },
          cancel: () => setPhase({ s: "error", text: "Paiement annulé." }),
          error: (e) => setPhase({ s: "error", text: e instanceof ApiError ? e.message : "Le paiement a échoué. Réessayez." }),
        },
      );
    } catch (e) {
      setPhase({ s: "error", text: explain(e) });
    }
  }

  return (
    <Box
      title="Test de réception"
      phase={phase}
      text={`Vous envoyez ${status.receive.amount} Pi de test (Testnet, aucune valeur réelle) à l'application, pour vérifier la réception.`}
    >
      <button type="button" className="btn ghost" onClick={() => void run()} disabled={phase.s === "busy" || phase.s === "done"}>
        Lancer le test de réception
      </button>
    </Box>
  );
}
