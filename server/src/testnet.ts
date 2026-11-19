import express, { type Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Config } from "./config.js";
import { AppError } from "./errors.js";

/**
 * Tests Testnet exigés par la core team :
 *  - A2U « test d'envoi » : l'application envoie un petit montant de Pi de test à l'utilisateur ;
 *  - U2A « test de réception » : l'utilisateur envoie un petit montant de Pi de test à l'application.
 * Tout est fermé par défaut, absent en Mainnet, avec montants fixés par le serveur.
 */

export type PaymentDTO = {
  identifier: string;
  user_uid: string;
  amount: number;
  memo?: string;
  metadata?: { purpose?: string } & Record<string, unknown>;
  direction: "user_to_app" | "app_to_user";
  network?: string;
  status: { developer_approved: boolean; transaction_verified: boolean; developer_completed: boolean; cancelled: boolean; user_cancelled: boolean };
  transaction: { txid: string; verified: boolean } | null;
};

/** Envoi A2U (pi-backend) : interface minimale pour pouvoir la simuler dans les tests. */
export interface A2uClient {
  createPayment(a: { amount: number; memo: string; metadata: object; uid: string }): Promise<string>;
  submitPayment(id: string): Promise<string>;
  completePayment(id: string, txid: string): Promise<PaymentDTO>;
  getPayment(id: string): Promise<PaymentDTO>;
  cancelPayment(id: string): Promise<PaymentDTO>;
}

export type Kind = "send" | "receive";
type Rec = { paymentId: string | null; status: "pending" | "done" | "incomplete"; at: string };
type State = Record<Kind, Record<string, Rec>>;

export class TestStore {
  private state: State = { send: {}, receive: {} };
  constructor(private readonly file: string | null) {
    if (file) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as State;
        if (raw && typeof raw === "object") this.state = { send: raw.send ?? {}, receive: raw.receive ?? {} };
      } catch {
        /* première exécution */
      }
    }
  }
  get(kind: Kind, uid: string): Rec | undefined {
    return this.state[kind][uid];
  }
  count(kind: Kind): number {
    return Object.keys(this.state[kind]).length;
  }
  set(kind: Kind, uid: string, rec: Rec): void {
    this.state[kind][uid] = rec;
    this.save();
  }
  delete(kind: Kind, uid: string): void {
    delete this.state[kind][uid];
    this.save();
  }
  private save(): void {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.state));
    } catch {
      console.warn("[test] état non enregistré (disque en lecture seule ?)");
    }
  }
}

export interface TestnetDeps {
  config: Config;
  fetchFn: typeof fetch;
  store: TestStore;
  /** Fabrique du client A2U, appelée seulement au moment d'un envoi (la clé secrète n'est pas gardée en mémoire ailleurs). */
  makeA2u?: (apiKey: string, seed: string) => Promise<A2uClient>;
  limiter: express.RequestHandler;
}

const TESTNET_NETWORK = "Pi Testnet";
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{6,128}$/);
const approveBody = z.object({ paymentId: idSchema });
const completeBody = z.object({ paymentId: idSchema, txid: z.string().regex(/^[A-Za-z0-9]{16,128}$/) });

export interface TestFlags {
  send: boolean;
  receive: boolean;
  sendAmount: number;
  receiveAmount: number;
}

/** Résolution des drapeaux : un test n'est offert que si Testnet + drapeau + clés nécessaires. */
export function testFlags(c: Config): TestFlags {
  const testnet = c.APP_ENV === "testnet";
  const cap = Math.min(c.TEST_MAX_AMOUNT, 20);
  return {
    send: testnet && c.TESTNET_PAYOUT === "1" && !!c.PI_API_KEY && !!c.PI_WALLET_SEED && c.TEST_SEND_AMOUNT <= cap,
    receive: testnet && c.TESTNET_RECEIVE === "1" && !!c.PI_API_KEY && c.TEST_RECEIVE_AMOUNT <= cap,
    sendAmount: c.TEST_SEND_AMOUNT,
    receiveAmount: c.TEST_RECEIVE_AMOUNT,
  };
}

export function createTestnetRouter(deps: TestnetDeps): Router {
  const { config, fetchFn, store, makeA2u } = deps;
  const base = config.PI_API_BASE.replace(/\/+$/, "");
  const r = express.Router();
  const flags = testFlags(config);

  if (config.APP_ENV !== "testnet") {
    r.use((_q, _s, next) => next(new AppError("NOT_FOUND", "Route introuvable.", 404)));
    return r;
  }

  r.get("/status", (_req, res) => {
    res.json({ send: { enabled: flags.send, amount: flags.sendAmount }, receive: { enabled: flags.receive, amount: flags.receiveAmount } });
  });

  async function platform<T>(method: "GET" | "POST", p: string, body?: unknown): Promise<T> {
    let resp: globalThis.Response;
    try {
      resp = await fetchFn(`${base}${p}`, {
        method,
        headers: { Authorization: `Key ${config.PI_API_KEY ?? ""}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Service Pi injoignable pour le moment.", 502);
    }
    if (!resp.ok) {
      // On journalise seulement le statut et le code d'erreur Pi, jamais la clé.
      const j = (await resp.json().catch(() => null)) as { error?: string } | null;
      console.warn(`[test] API Pi ${method} ${p.replace(/[A-Za-z0-9_-]{12,}/g, "{id}")} ${resp.status} ${typeof j?.error === "string" ? j.error.slice(0, 60) : ""}`);
      throw new AppError("UPSTREAM_ERROR", "Le service Pi a refusé l'opération.", 502);
    }
    return (await resp.json()) as T;
  }

  async function authUser(req: express.Request): Promise<{ uid: string }> {
    const h = req.headers.authorization ?? "";
    const m = /^Bearer\s+(\S{10,4096})$/.exec(h);
    if (!m) throw new AppError("UNAUTHORIZED", "Connexion Pi requise.", 401);
    let resp: globalThis.Response;
    try {
      resp = await fetchFn(`${base}/v2/me`, { headers: { Authorization: `Bearer ${m[1]}`, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    } catch {
      throw new AppError("UPSTREAM_ERROR", "Vérification Pi impossible pour le moment.", 502);
    }
    if (resp.status === 401 || resp.status === 403) throw new AppError("UNAUTHORIZED", "Jeton Pi refusé : reconnectez-vous.", 401);
    if (!resp.ok) throw new AppError("UPSTREAM_ERROR", "Vérification Pi impossible pour le moment.", 502);
    const me = z.object({ uid: z.string().min(1) }).safeParse(await resp.json().catch(() => null));
    if (!me.success) throw new AppError("UPSTREAM_ERROR", "Réponse Pi inattendue.", 502);
    return { uid: me.data.uid };
  }

  const need = (ok: boolean) => {
    if (!ok) throw new AppError("NOT_FOUND", "Ce test n'est pas disponible.", 404);
  };

  /** Test d'envoi A2U : montant fixé par le serveur, une seule fois par compte, réseau Testnet vérifié. */
  r.post("/send", deps.limiter, async (req, res, next) => {
    let uid = "";
    let reserved = false;
    try {
      need(flags.send && !!makeA2u);
      uid = (await authUser(req)).uid;
      if (store.get("send", uid)) throw new AppError("INVALID_INPUT", "Ce compte a déjà reçu son paiement de test.", 409);
      if (store.count("send") >= config.TEST_SEND_MAX_ACCOUNTS) {
        throw new AppError("INVALID_INPUT", "Le nombre maximal de comptes de test est atteint.", 409);
      }
      store.set("send", uid, { paymentId: null, status: "pending", at: new Date().toISOString() }); // réservation anti-doublon
      reserved = true;

      const a2u = await makeA2u!(config.PI_API_KEY!, config.PI_WALLET_SEED!);
      const paymentId = await a2u.createPayment({ amount: flags.sendAmount, memo: "ValueConvert — test Testnet (envoi)", metadata: { purpose: "testnet-a2u" }, uid });
      store.set("send", uid, { paymentId, status: "pending", at: new Date().toISOString() });

      const created = await a2u.getPayment(paymentId);
      if (created.network !== TESTNET_NETWORK || created.direction !== "app_to_user") {
        await a2u.cancelPayment(paymentId).catch(() => undefined);
        store.delete("send", uid);
        console.warn("[payout] refusé : le paiement n'est pas sur Pi Testnet");
        throw new AppError("INVALID_INPUT", "Cette application n'est pas configurée sur Pi Testnet.", 409);
      }

      const txid = await a2u.submitPayment(paymentId);
      store.set("send", uid, { paymentId, status: "incomplete", at: new Date().toISOString() });
      await a2u.completePayment(paymentId, txid);
      store.set("send", uid, { paymentId, status: "done", at: new Date().toISOString() });
      console.log("[payout] terminé");
      res.json({ ok: true, amount: flags.sendAmount, txid });
    } catch (e) {
      const rec = uid ? store.get("send", uid) : undefined;
      if (reserved && rec && rec.paymentId === null) store.delete("send", uid); // rien n'est parti : on libère
      if (e instanceof AppError) return next(e);
      console.warn("[payout] échec :", e instanceof Error ? e.message.slice(0, 120) : "inconnu");
      next(new AppError("UPSTREAM_ERROR", "L'envoi de test a échoué. Consultez les journaux du serveur.", 502));
    }
  });

  /** Vérifie qu'un paiement U2A correspond bien à ce que le serveur attend. */
  async function checkReceive(paymentId: string, uid: string): Promise<PaymentDTO> {
    const p = await platform<PaymentDTO>("GET", `/v2/payments/${paymentId}`);
    if (p.identifier !== paymentId || p.user_uid !== uid) throw new AppError("UNAUTHORIZED", "Ce paiement n'appartient pas à ce compte.", 403);
    if (p.direction !== "user_to_app") throw new AppError("INVALID_INPUT", "Sens de paiement inattendu.", 400);
    if (p.network !== TESTNET_NETWORK) throw new AppError("INVALID_INPUT", "Ce paiement n'est pas sur Pi Testnet.", 400);
    if (p.metadata?.purpose !== "testnet-u2a") throw new AppError("INVALID_INPUT", "Paiement non reconnu.", 400);
    if (Math.abs(p.amount - flags.receiveAmount) > 1e-9) throw new AppError("INVALID_INPUT", "Montant inattendu.", 400);
    if (p.status.cancelled || p.status.user_cancelled) throw new AppError("INVALID_INPUT", "Paiement annulé.", 409);
    return p;
  }

  r.post("/receive/approve", deps.limiter, express.json({ limit: "4kb" }), async (req, res, next) => {
    try {
      need(flags.receive);
      const uid = (await authUser(req)).uid;
      const b = approveBody.safeParse(req.body);
      if (!b.success) throw new AppError("INVALID_INPUT", "Identifiant de paiement invalide.", 400);
      const prior = store.get("receive", uid);
      if (prior?.status === "done") throw new AppError("INVALID_INPUT", "Ce compte a déjà effectué son test de réception.", 409);
      const p = await checkReceive(b.data.paymentId, uid);
      if (!p.status.developer_approved) await platform("POST", `/v2/payments/${b.data.paymentId}/approve`);
      store.set("receive", uid, { paymentId: b.data.paymentId, status: "pending", at: new Date().toISOString() });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post("/receive/complete", deps.limiter, express.json({ limit: "4kb" }), async (req, res, next) => {
    try {
      need(flags.receive);
      const uid = (await authUser(req)).uid;
      const b = completeBody.safeParse(req.body);
      if (!b.success) throw new AppError("INVALID_INPUT", "Données de paiement invalides.", 400);
      const p = await checkReceive(b.data.paymentId, uid);
      if (!p.transaction || p.transaction.txid !== b.data.txid) throw new AppError("INVALID_INPUT", "Transaction non concordante.", 400);
      if (!p.status.developer_completed) await platform("POST", `/v2/payments/${b.data.paymentId}/complete`, { txid: b.data.txid });
      store.set("receive", uid, { paymentId: b.data.paymentId, status: "done", at: new Date().toISOString() });
      console.log("[receive] terminé");
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  /** État du compte courant : permet d'afficher « test terminé » côté client. */
  r.get("/me", deps.limiter, async (req, res, next) => {
    try {
      const uid = (await authUser(req)).uid;
      res.json({ sendDone: store.get("send", uid)?.status === "done", receiveDone: store.get("receive", uid)?.status === "done" });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

/** Charge pi-backend à la demande (import CommonJS). */
export async function makePiBackendA2u(apiKey: string, seed: string): Promise<A2uClient> {
  const mod = (await import("pi-backend")) as unknown as { default: unknown };
  const d = mod.default as { default?: unknown };
  const Ctor = ((d && d.default) ?? mod.default) as new (k: string, s: string) => A2uClient;
  return new Ctor(apiKey, seed);
}
