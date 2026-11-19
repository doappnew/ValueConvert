import { Logo } from "../components/Brand";
import { isPiBrowser } from "../lib/pi";

interface Props {
  busy: boolean;
  error: string | null;
  onLogin: () => void;
}

/** Première page : un message de bienvenue et le bouton de connexion, rien d'autre. */
export function WelcomePage({ busy, error, onLogin }: Props) {
  return (
    <div className="welcome">
      <div className="welcome-body">
        <Logo size={84} />
        <h1>Bienvenue sur ValueConvert</h1>
        <p>Connectez-vous avec Pi pour accéder à l'application.</p>
        <button type="button" className="btn big" onClick={onLogin} disabled={busy}>
          {busy ? "Connexion…" : "Se connecter avec Pi"}
        </button>
        {error && (
          <p className="notice error-notice" role="alert">
            {error}
          </p>
        )}
        {!isPiBrowser() && !error && (
          <p className="hint">La connexion Pi n'est possible que dans Pi Browser.</p>
        )}
      </div>
      <p className="legal center">
        Application indépendante, non affiliée à Pi Network. Pi Network is a trademark of PI Community Company.
        <br />
        <a href="/confidentialite" className="legal-link">Politique de confidentialité</a>
        {" · "}
        <a href="/conditions" className="legal-link">Conditions d'utilisation</a>
      </p>
    </div>
  );
}
