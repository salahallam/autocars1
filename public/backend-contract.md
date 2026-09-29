# Contrat Backend — autocars.

Le frontend est volontairement séparé du backend. En phase de développement, `app.js` utilise `localStorage`.

## 1. GET /api/cars

Réponse attendue :

```json
{
  "cars": [
    {
      "id": "dacia-sandero",
      "name": "Dacia Sandero",
      "price": 250,
      "image": "assets/dacia-sandero.jpg",
      "tag": "Économique",
      "status": "available",
      "active": true
    }
  ]
}
```

Statuts recommandés :
- `available`
- `booked`

## 2. POST /api/bookings

Payload envoyé par le frontend :

```json
{
  "carId": "dacia-sandero",
  "carName": "Dacia Sandero",
  "pricePerDay": 250,
  "pickupDate": "2026-10-01",
  "returnDate": "2026-10-04",
  "days": 3,
  "deliveryFee": 0,
  "total": 750,
  "fullName": "Nom Prénom",
  "phone": "+212600000000",
  "cin": "AB123456",
  "city": "Khouribga",
  "deliveryLocation": "Adresse / hôtel / gare",
  "notes": ""
}
```

Le backend doit recalculer `days` et `total` côté serveur. Ne jamais faire confiance au prix ou au total envoyé par le navigateur.

Réponse de succès :

```json
{
  "ok": true,
  "id": "BK-XXXXXXXX"
}
```

Réponse si le véhicule est déjà réservé sur la période :

```json
{
  "ok": false,
  "message": "Ce véhicule est déjà demandé ou réservé pour cette période."
}
```

## 3. POST /api/bookings/status

À prévoir pour l'interface admin :

```json
{
  "bookingId": "BK-XXXXXXXX",
  "status": "confirmed"
}
```

Statuts :
- `pending`
- `confirmed`
- `rejected`
- `completed`
- `cancelled`

Lorsqu'une réservation est `confirmed`, le véhicule doit être bloqué uniquement pour sa période, et non définitivement si le système gère plusieurs périodes futures.

## 4. Données de réservation

Champs recommandés en base :

`id, created_at, status, car_id, car_name, price_per_day, pickup_date, return_date, days, delivery_fee, total, full_name, phone, cin, city, delivery_location, notes`

## 5. Sécurité

- Validation serveur de toutes les données.
- Recalcul serveur du nombre de jours et du total.
- Vérification serveur des chevauchements de dates.
- Ne jamais mettre une clé secrète de base de données dans `app.js`.
- Les notifications WhatsApp/email doivent partir du backend.
- L'interface admin doit être protégée par authentification.

## 6. Passage au backend

Dans `app.js` :

```js
const CONFIG = {
  USE_API: true,
  API_BASE: "https://votre-backend.example.com",
  DELIVERY_FEE: 0
};
```

Le frontend est alors prêt à consommer l'API sans modifier la structure de la page.
