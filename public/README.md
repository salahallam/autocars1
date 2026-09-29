# autocars. — site de location

## Contenu

- `index.html` : interface principale
- `style.css` : design responsive sombre et minimal
- `app.js` : flotte, réservation, calcul du prix et mode démo
- `backend-contract.md` : contrat API à respecter pour le backend
- `assets/` : logo et 5 photos fournies

## Tarifs configurés

- Dacia Sandero : 250 DH / jour
- Dacia Logan : 250 DH / jour
- Mercedes-AMG C63 : 1 000 DH / jour
- Mercedes C Coupé : 1 000 DH / jour
- Mercedes G-Class : 1 000 DH / jour

## Lancer en local

Le plus simple :

1. Décompresser le dossier.
2. Ouvrir `index.html` dans un navigateur.

Pour un environnement plus propre, utiliser un petit serveur HTTP local.

## Phase actuelle

Le site fonctionne en mode démo avec `localStorage`. Les demandes restent dans le navigateur.

La prochaine étape est le backend : base de données, API, authentification admin, confirmation/refus des réservations et notifications.
