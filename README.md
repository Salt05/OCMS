# ZaloCRM — Multi-Account Zalo Management

Manage multiple personal Zalo accounts from one web dashboard. Real-time chat, customer CRM, appointments, team management, REST API & Webhooks.

## Features

- **Multi-Zalo Accounts** — QR login, auto-reconnect, session persistence
- **Real-time Chat** — Send/receive messages, images, files, groups
- **Customer CRM** — Contact management with pipeline (new→contacted→interested→converted)
- **Appointments** — Schedule, track, reminders
- **Dashboard** — KPIs, charts, message volume, source distribution
- **Reports** — Excel export, date filters
- **Team Management** — RBAC (Owner/Admin/Member), teams, Zalo access control
- **REST API** — Public API with API key auth for integrations
- **Webhooks** — Real-time event notifications (message.received, contact.created, etc.)
- **Rate Limiting** — Anti-block protection (200/day, burst detection)
- **Notifications** — Bell icon with unreplied alerts, appointment reminders
- **Dark/Light Theme** — Liquid Silicon design

## Quick Start

### Prerequisites
- Docker & Docker Compose
- VPS with 4 vCPU / 4GB RAM recommended

### Installation

```bash
git clone https://github.com/vuongnguyenbinh/ZaloCRM.git
cd ZaloCRM
cp .env.example .env
# Edit .env — set passwords and secrets:
#   openssl rand -hex 32  → JWT_SECRET
#   openssl rand -hex 16  → ENCRYPTION_KEY
#   set DB_PASSWORD

docker compose up -d --build
```

Access: **http://your-server-ip:3080**

First visit → create admin account.

### Connect Zalo

1. Go to **Tài khoản Zalo**
2. Click **Thêm Zalo** → enter name
3. Click QR icon → scan with Zalo app
4. Confirm on phone → Connected!

## API

### Authentication
```
Header: X-API-Key: your-api-key
```

Generate API key in Settings → API & Webhook.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/contacts` | List contacts |
| POST | `/api/public/contacts` | Create contact |
| GET | `/api/public/conversations` | List conversations |
| GET | `/api/public/conversations/:id/messages` | Get messages |
| POST | `/api/public/messages/send` | Send message |
| GET | `/api/public/appointments` | List appointments |
| POST | `/api/public/appointments` | Create appointment |

### Webhooks

Configure webhook URL in Settings. Events:

| Event | Description |
|-------|-------------|
| `message.received` | New incoming message |
| `message.sent` | Outgoing message |
| `contact.created` | New contact auto-created |
| `zalo.connected` | Zalo account connected |
| `zalo.disconnected` | Zalo account disconnected |

Payload:
```json
{
  "event": "message.received",
  "timestamp": "2026-03-28T12:00:00Z",
  "data": { ... },
  "signature": "hmac-sha256"
}
```

## Tech Stack

- **Backend:** Node.js 20 / Fastify 5 / Prisma 7 / Socket.IO
- **Frontend:** Vue 3 / Vuetify 3 / Chart.js / Pinia
- **Database:** PostgreSQL 16
- **Zalo:** zca-js 2.x (unofficial)
- **Deploy:** Docker Compose

## License

MIT
