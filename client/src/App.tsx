import { useRef, useState } from "react";
import { Brand } from "./components/Brand";
import { IconBack, IconGcv, IconGlobe, IconMarket, IconSettings } from "./components/Icons";
import { StatusPill, healthOf } from "./components/StatusPill";
import { useConfig, useCurrencies, useStatus } from "./hooks/useApiData";
import { useHashRoute, useOnline, usePersisted } from "./hooks/useMisc";
import { ConverterPage } from "./pages/ConverterPage";
import { CurrenciesPage } from "./pages/CurrenciesPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { Direction, Route } from "./types";

const GCV_DEFAULT_FALLBACK = "314159";

const isCurrencyCode = (v: string): v is string => /^[A-Z]{3}$/.test(v);
const isDirection = (v: string): v is Direction => v === "pi_to_fiat" || v === "fiat_to_pi";
const isReference = (v: string): v is string => /^\d{1,13}(\.\d{1,8})?$/.test(v);

const NAV: { route: Route; label: string; icon: JSX.Element }[] = [
  { route: "marche", label: "Marché", icon: <IconMarket /> },
  { route: "gcv", label: "GCV", icon: <IconGcv /> },
  { route: "devises", label: "Devises", icon: <IconGlobe /> },
  { route: "reglages", label: "Réglages", icon: <IconSettings /> },
];

export default function App() {
  const [route, navigate] = useHashRoute();
  const config = useConfig();
  const { currencies, error: currenciesError, retry: retryCurrencies } = useCurrencies();
  const { status, error: statusError, loading: statusLoading, refresh: refreshStatus } = useStatus();
  const online = useOnline();

  const [currency, setCurrency] = usePersisted("currency", "XOF", isCurrencyCode);
  const [direction, setDirection] = usePersisted<Direction>("direction", "pi_to_fiat", isDirection);
  const gcvDefault = config?.gcvDefaultUsd ?? GCV_DEFAULT_FALLBACK;
  const [gcvRef, setGcvRef] = usePersisted("gcvRef", GCV_DEFAULT_FALLBACK, isReference);
  const [amount, setAmount] = useState("100");

  const lastConverter = useRef<"marche" | "gcv">("marche");
  if (route === "marche" || route === "gcv") lastConverter.current = route;

  const isConverter = route === "marche" || route === "gcv";
  const mode = route === "gcv" ? "gcv" : "market";
  const health = healthOf(lastConverter.current === "gcv" ? "gcv" : "market", status, statusLoading, online);

  const title = route === "devises" ? "Choisir une devise" : route === "reglages" ? "Réglages" : "";

  return (
    <div className="shell">
      <header className={`hero ${isConverter ? "with-tabs" : ""}`}>
        <div className="row between">
          <Brand />
          <div className="row gap-s">
            {config?.env === "testnet" && <span className="env-tag">Testnet</span>}
            <StatusPill health={health} mode={lastConverter.current === "gcv" ? "gcv" : "market"} />
          </div>
        </div>

        {isConverter ? (
          <nav className="mode-tabs" aria-label="Mode de conversion">
            <button type="button" aria-current={route === "marche" ? "page" : undefined} onClick={() => navigate("marche")}>
              MARCHÉ
            </button>
            <button
              type="button"
              className="gcv"
              aria-current={route === "gcv" ? "page" : undefined}
              onClick={() => navigate("gcv")}
            >
              GCV
            </button>
          </nav>
        ) : (
          <div className="page-head">
            {route === "devises" && (
              <button type="button" className="back" onClick={() => navigate(lastConverter.current)} aria-label="Retour">
                <IconBack />
              </button>
            )}
            <h1>{title}</h1>
          </div>
        )}
      </header>

      <main className={`content ${isConverter ? "overlap" : ""}`}>
        {isConverter && (
          <ConverterPage
            mode={mode}
            amount={amount}
            onAmount={setAmount}
            direction={direction}
            onSwap={() => setDirection(direction === "pi_to_fiat" ? "fiat_to_pi" : "pi_to_fiat")}
            currency={currency}
            currencies={currencies}
            onPickCurrency={() => navigate("devises")}
            gcvRef={gcvRef}
            gcvDefault={gcvDefault}
            online={online}
            onUseGcv={() => navigate("gcv")}
          />
        )}
        {route === "devises" && (
          <CurrenciesPage
            currencies={currencies}
            error={currenciesError}
            onRetry={retryCurrencies}
            selected={currency}
            onSelect={(code) => {
              setCurrency(code);
              navigate(lastConverter.current);
            }}
          />
        )}
        {route === "reglages" && (
          <SettingsPage
            config={config}
            status={status}
            statusError={statusError}
            statusLoading={statusLoading}
            onRefreshStatus={refreshStatus}
            gcvRef={gcvRef}
            gcvDefault={gcvDefault}
            onGcvRef={setGcvRef}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale">
        {NAV.map((n) => (
          <button
            key={n.route}
            type="button"
            aria-current={route === n.route ? "page" : undefined}
            onClick={() => navigate(n.route)}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
