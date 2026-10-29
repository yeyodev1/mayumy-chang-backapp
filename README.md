# Mayumy Chang API

API de la tienda de Mayumy Chang · Alta Joyería. Express 5 + Mongoose + TypeScript, desplegada en Vercel como función serverless. El contrato completo está en `../CONTRATO-API.md`.

## Setup local

```bash
pnpm install
cp .env.example .env         # rellenar DB_URI, JWT_SECRET, ADMIN_PASSWORD
pnpm seed:products           # categorías y piezas iniciales (idempotente)
pnpm dev                     # http://localhost:8110
```

Smoke:

```bash
curl http://localhost:8110/api/health
curl http://localhost:8110/api/products
curl http://localhost:8110/api/store/config
```

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` | ts-node-dev con recarga |
| `pnpm build` | `tsc` → `dist/` (única verificación) |
| `pnpm start` | `node dist/index.js` |
| `pnpm seed:admin` | crea/actualiza la cuenta admin desde `.env` |
| `pnpm seed:products` | upsert por slug del catálogo inicial; restaura stock, nunca borra |
| `pnpm format` | prettier |

## Rutas principales (`/api`)

- Público: `GET /products`, `GET /products/piece-of-month`, `GET /products/:slug`, `GET /products/:slug/related`, `GET /categories`, `GET /store/config`, `POST /orders`, `POST /orders/confirm`, `GET /orders/by-code/:code?email=`, `POST /leads`
- Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/password`
- Admin (Bearer admin): `/admin/stats`, `/admin/products` (+ `/stock`, `/images`), `/admin/categories`, `/admin/orders`, `/admin/customers`, `/admin/leads`, `/admin/users`, `/admin/settings/store`, `/admin/settings/payments`

## Deploy a Vercel

- `api/index.ts` — entrada serverless: conecta Mongo, siembra admin y delega en la app Express.
- `vercel.json` — todo el tráfico se reescribe a `/api`.
- Variables: las de `.env.example` (Vercel → Project → Settings → Environment Variables). Añade el dominio de la tienda en `CORS_ORIGINS` y en `FRONTEND_URL`.
