# ValueConvert — version Testnet

Convertisseur Pi ⇄ monnaies fiat (30 devises) avec prix et taux actualisés en continu depuis des sources réelles.
Application indépendante, non affiliée à Pi Network. *Pi Network is a trademark of PI Community Company.*

## Principes
- Mode **Marché** (par défaut) : prix du Pi via CoinGecko (`pi-network`, jamais l'IOU) + taux USD→devise via ExchangeRate-API. Mise en cache courte côté serveur, actualisation toutes les 60 s côté client.
- Mode **GCV** (facultatif) : référence hypothétique 314 159 USD, modifiable, clairement signalée, jamais présentée comme un prix officiel ni une cotation.
- **Aucun prix inventé** : si une source est indisponible, un message explicite remplace le résultat (HTTP 503). Les données trop anciennes sont marquées « périmées » puis retirées.
- Aucune clé dans le navigateur ni dans le dépôt. Aucune demande de phrase secrète, clé privée, e-mail ou téléphone. Pas de paiement Pi en v1.

## Lancer
```
npm install
cp .env.example .env     # puis exporter les variables (ou les définir dans l'hébergeur)
npm run dev              # serveur :3000 + client Vite
npm test                 # 85 tests serveur + 26 tests client
npm run build && npm start
```
Node 22 requis.

## Variables (serveur)
APP_ENV (testnet|mainnet), PORT, COINGECKO_API_KEY (facultative), COINGECKO_KEY_HEADER (défaut `x-cg-demo-api-key`, à confirmer selon votre plan), PRICE_TTL_SECONDS, FX_TTL_SECONDS, RATE_LIMIT_PER_MINUTE, PI_VALIDATION_KEY, FRAME_ANCESTORS. Voir `server/src/config.ts`.

## Déploiement Testnet sur Render
1. Poussez ce dossier sur GitHub. Render → New → Blueprint (ou Web Service) : build `npm ci && npm run build`, start `npm start`, `NODE_VERSION=22`, Auto-Deploy **Yes**.
2. Les instances gratuites s'endorment : le premier chargement peut prendre ~50 s.
3. Ne confirmez jamais un écran « Rollback » de Render (il restaure d'anciennes variables).

## Pi Developer Portal (Testnet)
1. Créez une application **Testnet** (Self Hosted) avec l'URL Render (ex. `https://valueconvert-testnet.onrender.com`).
2. Le portail donne une clé de validation : placez-la dans `PI_VALIDATION_KEY` (Render), redéployez, puis cliquez « Vérifier » (le fichier est servi sur `/validation-key.txt`).
3. Ouvrez l'URL **dans Pi Browser** (le SDK n'existe que là). Réglages → « Se connecter avec Pi » : seul le nom d'utilisateur est vérifié (côté serveur, `GET https://api.minepi.com/v2/me`).
4. Contrôlez : conversions Marché/GCV, changement de devise, état des sources dans Réglages, message clair si une source tombe.

## Points à valider pendant le test Testnet
- Affichage dans Pi Browser (si la page ne s'intègre pas, ajuster `FRAME_ANCESTORS`).
- En-tête/plan CoinGecko et conditions d'attribution ; ExchangeRate-API : lien d'attribution présent, pas de redistribution de la table complète.
- Les appels aux sources n'ont pas pu être testés depuis l'environnement de développement (réseau restreint) : vérifiez `/api/status` après déploiement ; il doit indiquer « live ».

## Mainnet (étape suivante)
Nouvelle application Mainnet dans le Developer Portal avec **URL distincte vérifiée**, `APP_ENV=mainnet`, nouvelle clé API si besoin, KYC du développeur, relecture des mentions légales. Aucune clé de Testnet ne doit être réutilisée.
