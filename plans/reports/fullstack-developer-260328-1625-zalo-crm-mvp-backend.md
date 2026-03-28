# Phase Implementation Report

### Executed Phase
- Phase: ZaloCRM MVP Backend — Phases 1–3
- Plan: task prompt (no plan dir)
- Status: completed

### Files Modified

**Deleted**
- `backend/src/modules/jobs/` (entire directory)
- `backend/src/modules/patients/` (entire directory)
- `backend/src/modules/contacts/icd10-data.ts`
- `backend/src/modules/contacts/icd10-routes.ts`
- `backend/src/modules/contacts/contact-disease-routes.ts`
- `backend/src/modules/chat/appointment-sync.ts`
- `backend/prisma/seed.ts`
- `backend/prisma.config.ts`

**Modified**
- `backend/prisma/schema.prisma` — removed Patient, ContactDisease, Icd10Code, Job/JobRun/JobResult models; removed disease/patient fields from Contact; added `email`, `status` to Contact; removed `patients` from Organization
- `backend/src/app.ts` — removed job/ai/patient/disease route imports & registrations; removed startJobScheduler/startDailyStatsAggregation; added publicApiRoutes + webhookSettingsRoutes
- `backend/src/modules/contacts/contact-routes.ts` — replaced disease/medication filters with generic `status`; updated create/update/pipeline endpoints
- `backend/src/modules/contacts/contact-sub-resource-routes.ts` — removed AI results endpoint (referenced deleted JobResult model); kept appointments sub-resource
- `backend/src/modules/dashboard/dashboard-routes.ts` — replaced medicationStatus pipeline with generic `status` groupBy
- `backend/src/modules/dashboard/report-routes.ts` — removed patient report; replaced treatmentProgress/medicationStatus with `byStatus` in contacts report
- `backend/src/modules/chat/message-handler.ts` — removed syncZaloReminder import/call; added emitWebhook calls on message.sent/received and contact.created
- `backend/src/modules/zalo/zalo-pool.ts` — added emitWebhook import; added webhook calls on zalo.connected (loginQR + reconnect) and zalo.disconnected (onDisconnected); added `getApi()` method

**Created**
- `backend/src/modules/api/webhook-service.ts` — HMAC-signed fire-and-forget webhook delivery
- `backend/src/modules/api/public-api-routes.ts` — X-Api-Key authenticated REST API (contacts, conversations, appointments, send message)
- `backend/src/modules/api/webhook-settings-routes.ts` — webhook URL/secret management + API key generation endpoints
- `backend/.env.example` — sanitized environment template

### Tasks Completed
- [x] Delete domain-specific modules (jobs, patients, icd10, disease, appointment-sync, seed)
- [x] Update Prisma schema — generic Contact model with status pipeline
- [x] Update app.ts — remove domain routes, add public API + webhook routes
- [x] Update contact-routes.ts — generic status pipeline
- [x] Update dashboard-routes.ts — generic pipeline
- [x] Update report-routes.ts — remove patient report, generic contact status report
- [x] Update message-handler.ts — remove syncZaloReminder, add webhook emissions
- [x] Create webhook-service.ts
- [x] Create public-api-routes.ts
- [x] Create webhook-settings-routes.ts
- [x] Wire webhooks into zalo-pool.ts + add getApi()
- [x] Remove AI SDK deps (@anthropic-ai/sdk, @google/generative-ai, openai)
- [x] Create .env.example
- [x] npm install + prisma generate + tsc --noEmit — all pass clean

### Tests Status
- Type check: pass (tsc --noEmit, zero errors)
- Unit tests: n/a (no test suite present)
- Integration tests: n/a

### Issues Encountered
- `contact-sub-resource-routes.ts` referenced `prisma.jobResult` — removed that endpoint entirely (AI results have no backing model in MVP)
- `loginQR` and `reconnect` in zalo-pool had no local `orgId` — resolved with async DB lookup (fire-and-forget pattern, consistent with rest of pool)

### Next Steps
- Run `prisma migrate dev` against a real DB to apply schema changes
- Frontend API settings view (#35 completed in parallel) can now wire to `/api/v1/settings/webhook` and `/api/v1/settings/api-key`
- Public API consumers authenticate via `X-Api-Key` header with key generated from `/api/v1/settings/api-key/generate`
