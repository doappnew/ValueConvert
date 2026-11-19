import { z } from "zod";

export type AppEnv = "testnet" | "mainnet";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.string().default("development"),
  /** Environnement Pi de CETTE instance. Le réseau réel se choisit dans le Developer Portal. */
  APP_ENV: z.enum(["testnet", "mainnet"]).default("testnet"),

  /**
   * La valeur du Pi n'est pas encore disponible : tant que ce drapeau est à 0 (défaut), l'application
   * affiche « à venir » et n'interroge aucune source de prix. Passer à 1 réactive les conversions de marché.
   */
  /** Mode « sandbox » du SDK Pi (adresse de développement du portail, sandbox.minepi.com). 0 par défaut. */
  PI_SANDBOX: z.enum(["0", "1"]).default("0"),
  PI_VALUE_AVAILABLE: z.enum(["0", "1"]).default("0"),

  COINGECKO_BASE_URL: z.string().url().default("https://api.coingecko.com/api/v3"),
  COINGECKO_API_KEY: z.string().min(1).optional(),
  /** Demo : x-cg-demo-api-key (api.coingecko.com) · Pro : x-cg-pro-api-key (pro-api.coingecko.com). */
  COINGECKO_KEY_HEADER: z.string().min(1).default("x-cg-demo-api-key"),
  COINGECKO_COIN_ID: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default("pi-network"),

  FX_URL: z.string().url().default("https://open.er-api.com/v6/latest/USD"),

  PRICE_TTL_SECONDS: z.coerce.number().int().min(10).default(60),
  PRICE_MAX_STALE_SECONDS: z.coerce.number().int().min(10).default(900),
  PRICE_SOURCE_MAX_AGE_SECONDS: z.coerce.number().int().min(60).default(1800),
  FX_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  FX_MAX_STALE_SECONDS: z.coerce.number().int().min(60).default(172800),
  FX_SOURCE_MAX_AGE_SECONDS: z.coerce.number().int().min(60).default(129600),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(90),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),

  PI_APPSTUDIO_LOGIN_URL: z.string().url().default("https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com/pi/auth/v1/login"),
  PI_API_BASE: z.string().url().default("https://api.minepi.com"),
  /** Contenu du fichier /validation-key.txt fourni par le Developer Portal (vérification du domaine). */
  PI_VALIDATION_KEY: z.string().min(1).optional(),
  FRAME_ANCESTORS: z.string().default("'self' https://*.minepi.com https://*.pinet.com"),
  CLIENT_DIST: z.string().optional(),

  /**
   * Tests exigés par la core team pour les applications Testnet. Fermés par défaut ; ignorés si APP_ENV=mainnet.
   * TESTNET_PAYOUT=1 : bouton « test d'envoi » (A2U) · TESTNET_RECEIVE=1 : bouton « test de réception » (U2A).
   */
  TESTNET_PAYOUT: z.enum(["0", "1"]).default("0"),
  TESTNET_RECEIVE: z.enum(["0", "1"]).default("0"),
  /** Clé API de CETTE application (Developer Portal). Uniquement dans les variables de l'hébergeur. */
  PI_API_KEY: z.string().min(1).optional(),
  /** Clé secrète (S…) du portefeuille de l'application : uniquement pour le test d'envoi, à supprimer ensuite. */
  PI_WALLET_SEED: z.string().min(1).optional(),
  TEST_SEND_AMOUNT: z.coerce.number().positive().default(0.1),
  TEST_RECEIVE_AMOUNT: z.coerce.number().positive().default(0.1),
  /** Plafond absolu par paiement (le serveur refuse de démarrer un test au-dessus, quoi qu'on configure). */
  TEST_MAX_AMOUNT: z.coerce.number().positive().max(20).default(20),
  /** Nombre maximal de comptes distincts recevant un paiement de test. */
  TEST_SEND_MAX_ACCOUNTS: z.coerce.number().int().min(1).max(50).default(5),
  TEST_STATE_FILE: z.string().default("./data/test-state.json"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Une variable vide est traitée comme absente.
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.trim() !== "") cleaned[k] = v.trim();
  }
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuration invalide : ${details}`);
  }
  return parsed.data;
}
