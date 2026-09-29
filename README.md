# autocars. — Backend + Frontend

Cette version ajoute un backend Node.js complet au site.

## Architecture

- `server.js` — API + serveur des fichiers + authentification admin
- `public/` — site client et interface admin
- `schema.sql` — structure Supabase
- `.env.example` — variables d'environnement
- `data.json` — créé automatiquement pour le mode local

## Démarrage local

1. Installer Node.js 18+.
2. Copier `.env.example` vers `.env`.
3. Définir au minimum :

```env
ADMIN_PASSWORD=un_mot_de_passe_fort
```

4. Lancer :

```bash
npm start
```

5. Ouvrir :

- Site : `http://localhost:3000`
- Administration : `http://localhost:3000/admin`

En l'absence de `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, le backend utilise automatiquement `data.json`.

## Passage à Supabase

1. Créer les tables en exécutant `schema.sql` dans Supabase SQL Editor.
2. Ajouter dans l'environnement du serveur :

```env
SUPABASE_URL=https://VOTRE_PROJET.supabase.co
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SERVER
```

3. Redémarrer le serveur.

La clé server/secret **ne doit jamais être placée dans `public/app.js`**, dans HTML, ni dans GitHub côté public.

## API publique

### GET `/api/cars`
Retourne les véhicules actifs.

### POST `/api/bookings`
Crée une demande. Le serveur recalcule les jours, le prix et vérifie le chevauchement des dates.

Exemple :

```json
{
  "carId":"dacia-sandero",
  "pickupDate":"2026-10-01",
  "returnDate":"2026-10-04",
  "fullName":"Nom Prénom",
  "phone":"+212600000000",
  "cin":"AB123456",
  "city":"Khouribga",
  "deliveryLocation":"Adresse"
}
```

## API admin

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/session`
- `GET /api/admin/bookings`
- `GET /api/admin/cars`
- `POST /api/admin/bookings/status`
- `POST /api/admin/cars/status`

## Notifications

Le backend contient des hooks optionnels pour Resend et WhatsApp Cloud API. Ils ne s'activent que si les variables correspondantes sont renseignées.

Variables :

```env
AGENCY_EMAIL=
RESEND_API_KEY=
EMAIL_FROM=autocars. <onboarding@resend.dev>
AGENCY_WHATSAPP=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=v23.0
```

## Important avant publication

- Remplacer `CHANGE_ME_STRONG_PASSWORD`.
- Utiliser uniquement des variables d'environnement pour les secrets.
- Activer HTTPS sur l'hébergeur.
- Ne pas committer `.env`.
- Pour une exploitation importante, remplacer la session mémoire par une authentification admin persistante (Supabase Auth ou équivalent).
