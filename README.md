# ValueConvert — version Testnet

Convertisseur Pi ⇄ monnaies fiat (30 devises) avec prix et taux actualisés en continu depuis des sources réelles.
Application indépendante, non affiliée à Pi Network. *Pi Network is a trademark of PI Community Company.*

## Principes
- **Page de bienvenue** : au démarrage, un message de bienvenue et le bouton « Se connecter avec Pi » (connexion Pi Browser, jeton vérifié côté serveur). Rien d'autre n'est accessible avant la connexion.
- **Valeur du Pi « à venir »** : tant que `PI_VALUE_AVAILABLE=0` (défaut), l'application affiche que la valeur du Pi n'est pas encore disponible ; aucune source de prix n'est interrogée et aucun chiffre n'est présenté. Mettre `PI_VALUE_AVAILABLE=1` réactive les conversions de marché : prix du Pi via CoinGecko (`pi-network`, jamais l'IOU) + taux USD→devise via ExchangeRate-API (cache court côté serveur, actualisation toutes les 60 s côté client).
- **Aucun prix inventé** : si une source est indisponible, un message explicite remplace le résultat (HTTP 503). Les données trop anciennes sont marquées « périmées » puis retirées.
- Aucune clé dans le navigateur ni dans le dépôt. Aucune demande de phrase secrète, clé privée, e-mail ou téléphone. Les seuls paiements Pi sont les deux tests Testnet décrits plus bas.

## Lancer
```
npm install
cp .env.example .env     # puis exporter les variables (ou les définir dans l'hébergeur)
npm run dev              # serveur :3000 + client Vite
npm test                 # 95 tests serveur + 26 tests client
npm run build && npm start
```
Node 22 requis.

## Variables (serveur)
APP_ENV (testnet|mainnet), PI_VALUE_AVAILABLE (0|1, défaut 0), PORT, COINGECKO_API_KEY (facultative), COINGECKO_KEY_HEADER (défaut `x-cg-demo-api-key`, à confirmer selon votre plan), PRICE_TTL_SECONDS, FX_TTL_SECONDS, RATE_LIMIT_PER_MINUTE, PI_VALIDATION_KEY, FRAME_ANCESTORS. Voir `server/src/config.ts`.

## Déploiement Testnet sur Render
1. Poussez ce dossier sur GitHub. Render → New → Blueprint (ou Web Service) : build `npm ci && npm run build`, start `npm start`, `NODE_VERSION=22`, Auto-Deploy **Yes**.
2. Les instances gratuites s'endorment : le premier chargement peut prendre ~50 s.
3. Gardez `NPM_CONFIG_INCLUDE=dev` : avec `NODE_ENV=production`, sans cette variable le build échoue (`Cannot find type definition file for 'vite/client'`).
4. Ne confirmez jamais un écran « Rollback » de Render (il restaure d'anciennes variables).

## Pi Developer Portal (Testnet)
1. Créez une application **Testnet** (Self Hosted) avec l'URL Render (ex. `https://valueconvert-testnet.onrender.com`).
2. Le portail donne une clé de validation : placez-la dans `PI_VALIDATION_KEY` (Render), redéployez, puis cliquez « Vérifier » (le fichier est servi sur `/validation-key.txt`).
3. Ouvrez l'URL **dans Pi Browser** (le SDK n'existe que là). Réglages → « Se connecter avec Pi » : seul le nom d'utilisateur est vérifié (côté serveur, `GET https://api.minepi.com/v2/me`).
4. Contrôlez : conversions Marché/GCV, changement de devise, état des sources dans Réglages, message clair si une source tombe.

## Points à valider pendant le test Testnet
- Affichage dans Pi Browser (si la page ne s'intègre pas, ajuster `FRAME_ANCESTORS`).
- En-tête/plan CoinGecko et conditions d'attribution ; ExchangeRate-API : lien d'attribution présent, pas de redistribution de la table complète.
- Les appels aux sources n'ont pas pu être testés depuis l'environnement de développement (réseau restreint) : vérifiez `/api/status` après déploiement ; il doit indiquer « live ».

## Si la connexion Pi échoue
La page de bienvenue affiche l'erreur exacte et un diagnostic (origine, SDK présent, sandbox). Contrôles, dans l'ordre :
1. Developer Portal : l'application Testnet porte exactement l'URL de l'app (https://…onrender.com, sans chemin), le domaine est **vérifié** (`/validation-key.txt` répond avec la clé), et l'application est enregistrée/enregistrée à jour.
2. Ouvrir l'application depuis l'adresse enregistrée, dans Pi Browser (pas Chrome).
3. Si le portail impose l'adresse de développement (sandbox.minepi.com / menu Develop de Pi Browser) : mettre `PI_SANDBOX=1` dans Render, redéployer, puis ouvrir l'application par cette adresse de développement.
4. Journaux Render : lignes `[auth]` (statut renvoyé par `/v2/me`). Aucune ligne = l'échec se produit dans Pi Browser avant le serveur.

## Tests exigés par la core team (Testnet uniquement)
Deux boutons, à deux endroits : **Test d'envoi** (A2U, page Réglages) et **Test de réception** (U2A, page Marché). Fermés par défaut et absents si `APP_ENV=mainnet`.
- `TESTNET_PAYOUT=1` ouvre l'envoi (exige `PI_API_KEY` + `PI_WALLET_SEED`) ; `TESTNET_RECEIVE=1` ouvre la réception (exige `PI_API_KEY`). Mettre un drapeau à `0` retire le bouton correspondant (le serveur répond 404).
- Montants fixés par le serveur (`TEST_SEND_AMOUNT`, `TEST_RECEIVE_AMOUNT`, 0,1 Pi par défaut), plafond absolu 20 Pi, une seule fois par compte, 5 comptes distincts au maximum pour l'envoi (`TEST_SEND_MAX_ACCOUNTS`).
- Le serveur vérifie le réseau « Pi Testnet », l'identité (jeton → `/v2/me`), le montant, le sens et l'objet du paiement avant d'approuver/terminer. Les journaux (`[payout]`, `[receive]`, `[test]`) ne contiennent aucune clé.
- Autorisations demandées au clic : envoi = `username`, `payments`, `wallet_address` ; réception = `username`, `payments`.
- L'état « déjà fait » est enregistré dans `TEST_STATE_FILE` ; sur Render gratuit le disque est éphémère (réinitialisé à chaque redéploiement) : ne redéployez pas pendant la série de 5 envois, ou notez les comptes déjà servis.
- Après le test : `TESTNET_PAYOUT=0`, **supprimer `PI_WALLET_SEED` de Render**, puis retirer le code de test avant le Mainnet.
- La clé secrète du portefeuille (S…) se saisit uniquement dans Render, jamais dans un chat ni dans le dépôt.

## Mainnet (étape suivante)
Nouvelle application Mainnet dans le Developer Portal avec **URL distincte vérifiée**, `APP_ENV=mainnet`, nouvelle clé API si besoin, KYC du développeur, relecture des mentions légales. Aucune clé de Testnet ne doit être réutilisée.
