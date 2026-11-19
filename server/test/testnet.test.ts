import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { CachedSource } from "../src/cache.js";
import { loadConfig } from "../src/config.js";
import { createMarketService } from "../src/market.js";
import { TestStore, testFlags, type A2uClient, type PaymentDTO } from "../src/testnet.js";

const TOKEN = "token-token-token";
const ENV = {
  CLIENT_DIST: "/nonexistent",
  PI_API_KEY: "KEY-FAKE",
  PI_WALLET_SEED: "SFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAK",
  TESTNET_PAYOUT: "1",
  TESTNET_RECEIVE: "1",
};

function pay(over: Partial<PaymentDTO> = {}): PaymentDTO {
  return {
    identifier: "PAYMENTID123456", user_uid: "u1", amount: 0.1, direction: "user_to_app", network: "Pi Testnet",
    metadata: { purpose: "testnet-u2a" },
    status: { developer_approved: false, transaction_verified: false, developer_completed: false, cancelled: false, user_cancelled: false },
    transaction: null, ...over,
  };
}

function build(env: Record<string, string> = {}, opts: { network?: string; uid?: string; platform?: (url: string, init?: RequestInit) => unknown } = {}) {
  const config = loadConfig({ ...ENV, APP_ENV: "testnet", ...env });
  const calls: string[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u}`);
    if (u.endsWith("/v2/me")) {
      return Response.json(init?.headers && JSON.stringify(init.headers).includes(TOKEN) ? { uid: opts.uid ?? "u1", username: "alice" } : {}, { status: JSON.stringify(init?.headers).includes(TOKEN) ? 200 : 401 });
    }
    const r = opts.platform?.(u, init);
    return Response.json(r ?? {});
  }) as unknown as typeof fetch;
  const a2u: A2uClient & { created: unknown[] } = {
    created: [],
    async createPayment(a) { this.created.push(a); return "A2UPAYMENT123456"; },
    async getPayment() { return pay({ identifier: "A2UPAYMENT123456", direction: "app_to_user", network: opts.network ?? "Pi Testnet" }); },
    async submitPayment() { return "TX1234567890ABCDEF"; },
    async completePayment() { return pay(); },
    async cancelPayment() { return pay(); },
  };
  const price = new CachedSource({ name: "CoinGecko", ttlMs: 1, maxStaleMs: 1, sourceMaxAgeMs: 1, fetcher: async () => ({ value: { priceUsd: "1" }, sourceTime: null }) });
  const fx = new CachedSource({ name: "fx", ttlMs: 1, maxStaleMs: 1, sourceMaxAgeMs: 1, fetcher: async () => ({ value: { rates: { USD: "1" } }, sourceTime: null }) });
  const store = new TestStore(null);
  const app = createApp({ config, market: createMarketService({ price, fx, envName: config.APP_ENV }), fetchFn, makeA2u: async () => a2u, testStore: store });
  return { app, a2u, calls, store, config };
}
const auth = { Authorization: `Bearer ${TOKEN}` };

describe("tests Testnet : drapeaux", () => {
  it("fermés par défaut", async () => {
    const { app } = build({ TESTNET_PAYOUT: "0", TESTNET_RECEIVE: "0" });
    const r = await request(app).get("/api/test/status");
    expect(r.body.send.enabled).toBe(false);
    expect(r.body.receive.enabled).toBe(false);
    expect((await request(app).post("/api/test/send").set(auth)).status).toBe(404);
  });
  it("absents en Mainnet", async () => {
    const { app } = build({ APP_ENV: "mainnet" });
    expect((await request(app).get("/api/test/status")).status).toBe(404);
    expect((await request(app).post("/api/test/send").set(auth)).status).toBe(404);
  });
  it("sans clé secrète, l'envoi reste fermé", () => {
    const c = loadConfig({ ...ENV, APP_ENV: "testnet", PI_WALLET_SEED: "" });
    expect(testFlags(c).send).toBe(false);
    expect(testFlags(c).receive).toBe(true);
  });
  it("refuse un plafond ou un montant au-dessus de 20", () => {
    expect(() => loadConfig({ ...ENV, TEST_MAX_AMOUNT: "50" })).toThrow();
    expect(testFlags(loadConfig({ ...ENV, TEST_SEND_AMOUNT: "25" })).send).toBe(false);
  });
});

describe("test d'envoi A2U", () => {
  it("envoie le montant fixé par le serveur, une seule fois par compte", async () => {
    const { app, a2u } = build();
    const r = await request(app).post("/api/test/send").set(auth).send({ amount: 9999 });
    expect(r.status).toBe(200);
    expect(r.body.amount).toBe(0.1);
    expect(a2u.created).toEqual([{ amount: 0.1, memo: expect.any(String), metadata: { purpose: "testnet-a2u" }, uid: "u1" }]);
    const again = await request(app).post("/api/test/send").set(auth);
    expect(again.status).toBe(409);
    expect(a2u.created).toHaveLength(1);
  });
  it("exige une connexion valide", async () => {
    const { app } = build();
    expect((await request(app).post("/api/test/send")).status).toBe(401);
    expect((await request(app).post("/api/test/send").set({ Authorization: "Bearer mauvais-jeton-xx" })).status).toBe(401);
  });
  it("s'arrête au nombre maximal de comptes", async () => {
    const { app, store } = build({ TEST_SEND_MAX_ACCOUNTS: "1" });
    store.set("send", "autre", { paymentId: "x", status: "done", at: "" });
    expect((await request(app).post("/api/test/send").set(auth)).status).toBe(409);
  });
  it("refuse et annule si le réseau n'est pas Pi Testnet", async () => {
    const { app, store } = build({}, { network: "Pi Network" });
    const r = await request(app).post("/api/test/send").set(auth);
    expect(r.status).toBe(409);
    expect(store.get("send", "u1")).toBeUndefined();
  });
  it("ne fuit aucune clé dans la réponse", async () => {
    const { app } = build();
    const r = await request(app).post("/api/test/send").set(auth);
    expect(JSON.stringify(r.body)).not.toMatch(/KEY-FAKE|SFAKE/);
  });
});

describe("test de réception U2A", () => {
  const id = "PAYMENTID123456";
  it("approuve un paiement conforme", async () => {
    const { app, calls } = build({}, { platform: () => pay() });
    const r = await request(app).post("/api/test/receive/approve").set(auth).send({ paymentId: id });
    expect(r.status).toBe(200);
    expect(calls.some((c) => c.startsWith("POST") && c.endsWith(`/v2/payments/${id}/approve`))).toBe(true);
  });
  it.each([
    ["montant différent", pay({ amount: 5 })],
    ["autre utilisateur", pay({ user_uid: "autre" })],
    ["mauvais réseau", pay({ network: "Pi Network" })],
    ["mauvais objet", pay({ metadata: { purpose: "autre" } })],
    ["mauvais sens", pay({ direction: "app_to_user" })],
  ])("refuse : %s", async (_n, p) => {
    const { app, calls } = build({}, { platform: () => p });
    const r = await request(app).post("/api/test/receive/approve").set(auth).send({ paymentId: id });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(calls.some((c) => c.endsWith("/approve"))).toBe(false);
  });
  it("termine seulement si la transaction correspond", async () => {
    const tx = "TX1234567890ABCDEF";
    const ok = build({}, { platform: () => pay({ transaction: { txid: tx, verified: true } }) });
    expect((await request(ok.app).post("/api/test/receive/complete").set(auth).send({ paymentId: id, txid: tx })).status).toBe(200);
    expect(ok.store.get("receive", "u1")?.status).toBe("done");
    const bad = build({}, { platform: () => pay({ transaction: { txid: "AUTRETX1234567890", verified: true } }) });
    expect((await request(bad.app).post("/api/test/receive/complete").set(auth).send({ paymentId: id, txid: tx })).status).toBe(400);
  });
  it("valide les identifiants reçus", async () => {
    const { app } = build({}, { platform: () => pay() });
    expect((await request(app).post("/api/test/receive/approve").set(auth).send({ paymentId: "../x" })).status).toBe(400);
  });
});
