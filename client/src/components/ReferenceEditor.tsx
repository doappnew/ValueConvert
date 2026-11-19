import { useEffect, useId, useState } from "react";
import { formatDecimal } from "../lib/format";

const RE = /^\d{1,13}([.,]\d{1,8})?$/;

interface Props {
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}

/** Référence GCV modifiable. Toute valeur différente de la référence par défaut est clairement signalée. */
export function ReferenceEditor({ value, defaultValue, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(value);
  const [error, setError] = useState("");

  useEffect(() => setText(value), [value]);

  const modified = value !== defaultValue;

  function handle(v: string) {
    setText(v);
    const clean = v.replace(/[\s  ]/g, "");
    if (!RE.test(clean)) {
      setError("Saisissez un nombre positif (ex. 314159).");
      return;
    }
    const n = clean.replace(",", ".").replace(/^0+(?=\d)/, "");
    if (Number(n) < 0.000001 || Number(n) > 1_000_000_000_000) {
      setError("Valeur hors limites (0,000001 à 1 000 000 000 000).");
      return;
    }
    setError("");
    onChange(n);
  }

  return (
    <section className={`card reference ${modified ? "modified" : ""}`} aria-labelledby={`${id}-t`}>
      <div className="row between">
        <h2 id={`${id}-t`}>Référence GCV (USD pour 1 Pi)</h2>
        {modified && <span className="badge-warn">Modifiée</span>}
      </div>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={text}
        onChange={(e) => handle(e.target.value)}
        aria-invalid={error !== ""}
        aria-describedby={`${id}-h`}
      />
      <p id={`${id}-h`} className={error ? "hint error" : "hint"}>
        {error ||
          (modified
            ? `Valeur personnalisée : ce n'est pas la référence par défaut (${formatDecimal(defaultValue)} USD) et ce n'est pas un prix de marché.`
            : `Référence communautaire par défaut : ${formatDecimal(defaultValue)} USD. Elle n'est pas un prix de marché.`)}
      </p>
      {modified && (
        <button type="button" className="btn ghost" onClick={() => onChange(defaultValue)}>
          Rétablir la référence par défaut
        </button>
      )}
    </section>
  );
}
