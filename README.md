# SmartParking (IoT-SPMS)

IoT-based Smart Parking Management System for a university campus (HCMUT). Course project for **Software Engineering (SE252)**.

The system tracks per-slot occupancy through IoT sensors, controls entry/exit access, drives availability signage, computes and collects parking fees, and gives operators and administrators live visibility and audit — designed for the reality of a Vietnamese campus, where parking is **motorbike-dominated** and traffic arrives in tight peak-hour bursts.

## Live demo

Open [`mvp/index.html`](mvp/index.html) in any browser — no build, no server, no network needed. Or run it from GitHub Pages once enabled (Settings → Pages → deploy from `main` / root, then open `/mvp/`).

Pick a role on the login screen: **Member Driver**, **Parking Operator**, or **System Administrator**. The simulation runs live — vehicles arrive and leave, sensors occasionally go stale, plate-mismatch anti-theft alarms fire, and payments settle (or drop their callback so reconciliation has something to catch).

| Login | Driver | Operator | Admin |
|---|---|---|---|
| ![login](assets/screen-1-login.png) | ![driver](assets/screen-2-driver.png) | ![operator](assets/screen-3-operator.png) | ![admin](assets/screen-4-admin.png) |

## What's in here

```
docs/
  00-engineering-knowledge-base.md   research synthesis the docs are built on
  01-requirements.md                 #1 — context, stakeholders, FR/NFR, use-case diagram
  02-uml-and-ui.md                   #2 — use-case scenarios, sequence/activity/statechart, UI
  03-design.md                       #3 — architecture, deployment, class diagram, methods, tests
  pdf/                               the three submissions rendered to PDF (diagrams included)
mvp/
  index.html                         single-file simulation (UI + styles)
  app.js                             state model, simulation engine, services, RBAC views
assets/                              screenshots used above
```

The documents render on GitHub directly (Mermaid diagrams included). The `docs/pdf/` copies are the submission format.

## Key design decisions

These are the choices that shape the whole system; each is argued in the docs.

- **Motorbike-first, barrier-free flow.** A per-vehicle barrier (~1.5 s/cycle, ~40 veh/min) gridlocks against hundreds of arrivals per minute at peak. The primary lane is barrier-free: overhead ANPR + a contactless card tap on the move, reconciled at exit.
- **Identity is plate-bound.** Every session stores the entry plate; the exit plate is re-read and compared. A mismatch raises an **anti-theft alarm** (a stolen bike presents a card that doesn't match its plate).
- **Near-real-time, fault-tolerant occupancy.** Sensors report state deltas over MQTT; a stale sensor is marked **UNKNOWN** and never counted as free. Availability is an event-driven per-zone count.
- **HCMUT_SSO is CAS, not OAuth2.** Integrated as a CAS service (redirect → service ticket → `/p3/serviceValidate`), with read-only enrichment from HCMUT_DATACORE treated as a cache.
- **BKPay is stubbed.** The real BKPay is web-only, single-bank (OCB), and has no public parking API, so the prototype mocks it against the standard redirect + IPN + HMAC + idempotency shape and flags a real integration as future work.
- **Modular monolith.** Ten logical services (Auth, Access, Ingestion, Availability, Billing, Payment, DataCore sync, Admin, Notification, Audit) behind one API gateway — buildable by a student team, but split cleanly for a future microservice migration.

## Tech

Plain HTML/CSS/JavaScript, no dependencies, all data hard-coded in code (per the course allowance — no backend/database required). The simulation is deterministic-ish and self-contained.

## AI usage

See [`AI-USAGE.md`](AI-USAGE.md) for the required disclosure of how generative AI was used on this project.
