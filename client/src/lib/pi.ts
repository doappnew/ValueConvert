/**
 * Intégration minimale du SDK officiel Pi (https://sdk.minepi.com/pi-sdk.js).
 * - Pi.init({ version: "2.0" }) : version prescrite par la documentation.
 * - Le réseau (Testnet / Mainnet) est choisi dans le Pi Developer Portal, pas dans le code.
 * - Aucune connexion n'est imposée : le calculateur fonctionne sans le SDK.
 * - Aucun paiement dans cette version.
 */
interface PiAuthResult {
  accessToken: string;
  user: { uid: string; username?: string };
}

interface PiSdk {
  init(options: { version: string; sandbox?: boolean }): void;
  authenticate(scopes: string[], onIncompletePaymentFound: (payment: unknown) => void): Promise<PiAuthResult>;
}

declare global {
  interface Window {
    Pi?: PiSdk;
  }
}

let initialized = false;

export function getPi(): PiSdk | null {
  if (typeof window === "undefined" || !window.Pi) return null;
  if (!initialized) {
    try {
      window.Pi.init({ version: "2.0" });
      initialized = true;
    } catch {
      return null;
    }
  }
  return window.Pi;
}

export function isPiBrowser(): boolean {
  return getPi() !== null || /PiBrowser/i.test(navigator.userAgent);
}

/**
 * Demande l'authentification Pi avec la seule permission « username » et renvoie le jeton d'accès,
 * à transmettre UNIQUEMENT au serveur (qui le vérifie auprès de la Platform API).
 */
export async function piAuthenticate(): Promise<string> {
  const pi = getPi();
  if (!pi) throw new Error("PI_UNAVAILABLE");
  // Pas de paiements dans cette version : rien à reprendre si un paiement incomplet est signalé.
  const auth = await pi.authenticate(["username"], () => undefined);
  return auth.accessToken;
}
