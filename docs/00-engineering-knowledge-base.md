# HCMUT IoT Smart Parking System — Engineering Knowledge Base (SE252)

Internal engineering artifact. Synthesized from 6 research dossiers (IoT architecture, commercial/academic feature landscape, auth/RBAC/payment, requirements engineering, software architecture/design, HCMUT real-world grounding). This is the single source that requirements, UML, architecture, class design, and the MVP will be built from. Dense and factual; every threshold/protocol/number is reused from the dossiers so downstream docs can cite it directly.

---

## 1. Domain Summary

The system is a campus smart-parking platform for **Ho Chi Minh City University of Technology (HCMUT)** that modernizes the university's existing (May 2019) RFID motorbike/bicycle parking-card scheme. It links every parking transaction to the driver's real HCMUT identity (via SSO), computes and collects fees, tracks per-slot occupancy through IoT sensors, drives guidance signage, and gives operators/admins live visibility and audit.

**This is NOT a greenfield project and NOT a Western car-parking garage.** Two facts reshape the entire design:

1. **Motorbike dominance.** Vietnam has ~77 million registered motorcycles (~770 per 1,000 people) vs ~68 cars per 1,000 people; 89.4% of households own a motorbike vs 9% a car; motorbikes are 85–90% of road traffic. On an HCMUT campus of **~23,000 undergraduates + ~2,100 masters + ~300 PhD**, the primary vehicle class is **xe máy (motorbike)** with cars a small minority lane — the inverse of a US/EU parking model. Slot geometry is a dense ~1×2 m motorbike footprint (tens of thousands of slots), not one-car-per-bay barrier stalls.

2. **Burst throughput is THE defining constraint.** Nearly all ~23k students arrive on motorbikes in tight pre-class windows (before ~7:00 and ~12:30), producing hundreds of arrivals per minute at peak. A per-vehicle barrier physically gridlocks: the incumbent imported barrier (Model BS 306) has a **1.5 s open/close cycle → ~40 vehicles/min hard ceiling per lane** (far less in practice). Real Vietnamese motorbike lots therefore run **barrier-free wide multi-lane flow**: overhead ANPR camera + contactless RFID/NFC card tap on the move, reconciling plate-vs-card on exit. Physical barriers are reserved for the small car lot or paid-exit reconciliation.

**Core security rule (Vietnamese motorbike anti-theft model):** identity is **plate-bound**, not just card-bound. On entry the system stores {card/account ID, ANPR plate text, entry photo, timestamp}; on exit it re-reads the plate on the same card and **a mismatch raises an anti-theft alarm** (a stolen bike presents a card that doesn't match its plate). This is the single most important domain rule to bake into the data model.

**Multi-site reality:** two physical campuses — Cơ sở 1 at 268 Lý Thường Kiệt (District 10, dense inner-city) and Cơ sở 2 in Dĩ An (Đông Hòa ward, suburban) — total ~41.23 ha. The system must be multi-campus / multi-gate, not a single-lot assumption.

**Motivation framing for the report:** modernize the 2019 RFID system. Cite concrete incumbent pain points — peak overload, lost/counterfeit cards, cash handling, manual guard reconciliation — with the upgrade being ANPR + SSO-linked account + digital wallet + live occupancy/guidance.

---

## 2. Actors & Stakeholders

Two orthogonal axes must not be flattened into one "role" column:
- **Axis 1 — App role (what functions you can invoke):** `end_user`, `operator`, `admin` (+ `finance`). Classic RBAC.
- **Axis 2 — End-user affiliation/subtype (drives PRICING & eligibility, not screens):** student/learner, faculty, staff, visitor. An ABAC-style **attribute** on the user, sourced from CAS affiliation / DATACORE.

### Primary (human) actors
| Actor | Role / expectations |
|---|---|
| **Driver / Member (student, faculty, staff)** | Authenticate at entry (SSO-linked account), view available slots, enter lot, park, (optionally reserve), pay fee, exit, top-up prepaid balance, manage own account & vehicles, view own history/bill. Students get **15% motorbike / 10% car** discount with valid ID. |
| **Guest / Visitor driver** | Non-HCMUT person, **no CAS account**. Take ticket / plate-only session (created BY an operator), view slots, pay at exit (cash/QR), exit. |
| **Parking Operator / Attendant** | Monitor live occupancy board, handle exceptions (stuck barrier, lost ticket, manual open), accept cash, search vehicle/session by plate (target ≤15 s), issue visitor ticket, acknowledge alarms. **Scoped to assigned lot(s)** via ABAC. |
| **System Administrator** | Manage users/cards/blacklist & role assignments, configure tariffs/rate rules, configure zones/slots/sensors/device registry, dashboards (occupancy, revenue, peak hours), export reports, view audit log, run reconciliation. |
| **Finance (optional split of admin)** | View financial reports, reconciliation breaks, refunds/waivers. |

### Secondary / supporting (external-system) actors — must appear on the use-case diagram
Students routinely forget these; putting them on the diagram is the easiest differentiator.
- **Slot occupancy sensor** (magnetometer / ultrasonic / IR)
- **Entry/Exit barrier controller** (vend-signal interface)
- **RFID / NFC card reader**
- **ANPR / LPR camera**
- **Guidance sign / LED display**
- **Payment gateway (BKPay / OCB)**
- **HCMUT_SSO** (CAS server)
- **HCMUT_DATACORE** (identity/vehicle master data)
- **Time source / clock** (for billing)

### Institutional stakeholders
HCMUT IT/SSO administrators (own CAS attribute release), Bach Khoa Service Center (card registration/top-up today), university finance (OCB/BKPay rail), facilities/security (barrier safety, anti-theft), course graders (SE252 rubric).

---

## 3. Functional Scope — Modules

7-module grouping (SWEBOK-aligned). Every FR must be **atomic, verifiable, unambiguous, "The system shall…"**, uniquely ID'd (e.g. `FR-ENT-01`), traceable to a use case, and **state the WHAT not the design** (no "use MQTT" inside a requirement).

**[A] Entry / Access Control** — detect approaching vehicle; read RFID/NFC card or scan QR / ANPR plate; validate against membership/blacklist and lot-full condition; branch **credential-present → member path** vs **nothing → transient/guest path (issue ticket / log plate)**; capture entry photo + plate; open entry barrier (car lane) or log flow-through (motorbike lane); record entry {timestamp, lane, card ID, plate}.

**[B] Slot Occupancy & Detection** — per-slot sensor reports occupied/vacant; aggregate free-count per floor/zone; **reconcile sensor state vs entry/exit counts**; flag stuck/faulty sensors; downgrade stale slots to "unknown".

**[C] Guidance & Signage** — compute available count per zone; drive entrance sign (FULL / xx SPACES); drive zone/level signs and in-aisle directional arrows (toward higher-availability neighbor); optional per-slot indicator lights; mobile/web availability view.

**[D] Exit / Billing** — read card + re-read plate at exit; **match entry-vs-exit plate → alarm on mismatch**; compute duration + fee per tariff; process payment (prepaid balance / e-wallet / cash-at-booth); open exit barrier; close session.

**[E] Reservation (if in scope)** — search availability; reserve slot/time window; hold slot; auto-release on no-show timeout; convert reservation to active session on entry.

**[F] Administration & Reporting** — manage tariffs/rate rules, cards/users/blacklist, zones/slots/sensors; dashboards (occupancy, revenue, peak hours); export reports; manage operator accounts + roles.

**[G] Monitoring & Audit** — live lot status board for operators; alarm on hardware fault / forced barrier / anti-passback / plate-mismatch; **immutable audit log** of every entry/exit/payment/admin action.

**Must-cover failure/edge flows** (rubric points live here): lot full, sensor fault, network down, lost ticket, power loss, card cloned/mismatched plate, double-entry, no-show, IPN lost.

---

## 4. Non-Functional Requirements (measurable)

Present as a table: `NFR-ID | ISO/IEC 25010:2023 characteristic | statement | metric | load/condition | verification method`. State numbers as **targets the team will validate**, not measured results. Priority order for this domain: (1) offline/availability, (2) sensor fault tolerance & reconciliation, (3) barrier/signage latency, (4) concurrency, (5) payment/privacy security, (6) auditability, (7) scalability, (8) signage usability, (9) safety.

**ISO/IEC 25010:2023** (replaces 2011) — 9 characteristics: Functional Suitability, Performance Efficiency, Compatibility, **Interaction Capability** (was Usability), Reliability, Security, Maintainability, **Flexibility** (was Portability; Portability now a subcharacteristic), **Safety** (NEW).

| Area (25010) | Target |
|---|---|
| **Performance — time behaviour** | Barrier-open latency from valid card read to open command **≤2 s p95, ≤3 s p99** (grounded: field RFID gate ~0.93 s entry / ~1.15 s exit). Occupancy view/signage reflects a state change **≤5 s**. API **p99 ≤500 ms** nominal. ANPR recognition **<2 s, ~98% accuracy**. |
| **Performance — capacity/concurrency** | ≥20 simultaneous lane events; ≥2,000 active sessions; sensor ingest ≥500 slot-state msg/sec, no throughput degradation. |
| **Reliability — availability** | **≥99.5% monthly uptime** (≤~3.6 h/month downtime). |
| **Reliability — offline operation** | Entry/exit keeps working during backend/network outage via edge/offline mode: barrier decisions locally cached, transactions queued and **synced ≤60 s of reconnect**. |
| **Reliability — fault tolerance** | A single failed slot sensor must not corrupt total free-count: degrade gracefully, mark slot "unknown", **alert ≤30 s**; count-vs-sensor mismatch auto-reconciled; no single sensor/gateway failure blocks whole-lot entry. |
| **Reliability — recoverability** | After power/crash recover last consistent state (open sessions preserved) **RTO ≤2 min, RPO ≤30 s**. |
| **Security** | Card IDs + payment data encrypted at rest (**AES-256**) and in transit (**TLS 1.2+**); no full card/payment data in logs; RBAC for operators/admins; every privileged action to tamper-evident audit trail; anti-passback / clone-card / plate-mismatch detection. |
| **Security — accountability / auditability** | 100% of entry/exit/payment/admin events logged with actor, timestamp, before/after; logs immutable, retained **≥12 months**, queryable. |
| **Performance — scalability** | Scales from a 200-slot single lot to **≥5,000 slots / multiple sites** with no redesign; adding a lot = config only, no code change. |
| **Interaction capability (usability)** | Entrance sign readable **≥30 m in daylight**; first-time driver interprets slot indicator lights unaided (**≥95% success** in usability test); operator "find vehicle by plate" **≤15 s**. |
| **Safety (NEW in 2023)** | Fail-safe barrier: **must not close on a vehicle/person**; hazard warning; safe integration near moving traffic. (Category students almost always miss — strong differentiator.) |
| **Maintainability / Flexibility** | Modular independently-deployable services; sensor vendor replaceable behind an abstraction; runs on standard Linux/cloud + edge gateway. |

---

## 5. IoT & Resilience Design

### Two-tier protocol design (resolves the common "MQTT vs LoRaWAN" mistake)
It is **NOT MQTT vs LoRaWAN** — they sit at different layers:

```
battery sensors → LoRaWAN / NB-IoT radio → gateway / LoRaWAN Network Server → MQTT broker → backend/cloud
```

- **Field radio:** LoRaWAN (Class A most power-efficient, 10+ yr battery, range up to ~10 mi LoS, but tens-to-hundreds of seconds worst-case downlink latency due to duty-cycle + ALOHA) or NB-IoT (licensed cellular, sub-second RTT, seconds-level attach, carrier cost).
- **Backend transport = MQTT** because pub/sub decouples thousands of sensors from many consumers (dashboard, pricing engine, mobile, signage), is broker-buffered/reliable on flaky links, and has built-in liveness semantics.

**Concrete MQTT parameters (defensible, citable):**
- TCP, port **1883** (dev) / **8883** TLS (prod); ~2-byte min header; keep-alive **60 s**.
- Topic hierarchy: `parking/{lot}/{zone}/{sensor}/state` and `parking/{lot}/{zone}/{sensor}/status`.
- **QoS: occupancy = QoS 1** (at-least-once; consumers must be idempotent to tolerate duplicates); **payment/reservation = QoS 2** (exactly-once). QoS 0 only for high-freq non-critical telemetry.
- (CoAP alternative: UDP port 5683 / 5684 DTLS, 4-byte header — lower overhead but weaker on lossy links; not chosen.)

### Fault tolerance — three named mechanisms with thresholds
1. **LWT + retained message = liveness + last-known-state.** On connect, sensor/gateway publishes retained `online` to its `.../status` topic and registers an **LWT** (will-topic/will-payload/will-QoS/will-retain) publishing retained `offline`. Broker declares dead + fires LWT after **1.5× keep-alive (~90 s)**. Any new subscriber instantly gets last-known state (retained) and is told when a node dropped (LWT). Standard mechanism to detect gateway disconnection / stale sensors.
2. **Heartbeat + staleness timeout.** App-layer MQTT keep-alive 60 s; sensor-layer periodic heartbeat independent of events (Nwave default 24 h; Dragino LDS02 once/day) to catch silent-death. **Staleness rule:** no update within N intervals (e.g. **2 consecutive missed 60 s intervals**) → mark node UNRESPONSIVE; its stall excluded from availability count or shown "unknown", **never treated as free**.
3. **Debounce / re-verify before flagging offline** to prevent flapping — wait a debounce period and re-verify on an `offline`/disconnect event before acting.

### Staleness & event-driven availability computation
- Event-driven sensors transmit only on **state change**, so **silence ≠ free** — hold last-known-state until a new event or staleness timeout.
- **Availability = running per-lot/per-zone counter** that increments/decrements on each occupied↔free delta (NOT polling every sensor). Each event carries a timestamp; aggregator recomputes free-count per delta.
- **Reconciliation:** dual-trigger (event + periodic re-check, e.g. every 5 min) corrects missed change events; EMI/false-event filtering (real park vs underground-train magnetic spike); auto-restart on error threshold (camera reboots after N corrupt frames).
- **Near-real-time caveat:** end-to-end freshness bounded by radio latency (LoRaWAN adds tens of seconds), so it is **near-real-time**; the UI/API must timestamp each availability figure and downgrade slots older than the staleness timeout to "unknown".

### Edge/cloud split + store-and-forward
- **Edge** does per-slot detection and transmits **only state deltas** (cite: Odroid N2+ + SSD-MobileNetV2, 0.32 s/frame, dual-trigger periodic 5 s lab / 5 min field, transmit-on-change only) → latency + offline-tolerance + privacy + bandwidth savings.
- **Gateway store-and-forward:** buffers messages/state in a local queue during backhaul outages, replays in order on reconnect → survives gateway-to-cloud disconnection without losing the delta stream.
- **Cloud/fog** aggregates across gateways, does analytics, dynamic pricing, driver-facing availability API.

### Sensor selection & signage thresholds
- **No single modality suffices outdoors** → recommend **dual-detection** (magnetometer + radar) for outdoor stalls, **ultrasonic** for covered garages. Tradeoffs: magnetometer (weatherproof, detects motorbikes, 5–10 yr battery, but road-surface install + EMI false-trigger risk); ultrasonic (~97%+ indoors, cheap, 2–3 yr battery, not outdoors); IR (cheap, degraded by sun/heat/rain); camera/CV (one covers many stalls + plate/class data, but privacy + low-light/weather + compute). Dual (mag+radar) ~99% vs ~95–97% single. Real hardware: **Bosch TPS110** (mag+radar+GPS+temp, Class A LoRaWAN, IP69K); **Nwave** (mag+proximity+temp, IP68, −40–85 °C, ~3 s detection, AA 13,500 mAh Li-SOCl2, default heartbeat 24 h). **EMI/false-event filtering is a requirement, not optional.**
- **Signage: three-tier hierarchy** — (1) Entrance/arrival sign (per-lot count), (2) Zone/Level sign (per-zone count), (3) In-aisle directional arrows (point toward adjacent zone with greater free count; if current zone full → route to nearest non-full zone).
- **Occupancy-% → sign-state color map (CONFIGURABLE, not hardcoded):** default **GREEN <75%**, **YELLOW 75–89%** (filling), **ORANGE 90–99%** (nearly full — "nearly full" trigger = **90% occupancy**), **RED = 100%** (full). Operators tune these.
- **Per-space LED convention (separate enum):** green=free, red=occupied, blue=ADA/accessible, purple=EV.
- **Count-based vs per-space tradeoff:** per-space >99.5% (stable, errors isolated, expensive); count-based >99% per count-point BUT **drifts to ~85% over 30 days** without recalibration. **Chosen for MVP: count-based** (increment on entry, decrement on exit, per zone) + an explicit **nightly zero/recalibration when lot empties** requirement to counter drift.
- **Operating band for simulation:** model 60–90% occupancy (target ~80%) so nearly-full/full logic actually fires. Guidance value curve (NWAVE): ~80% saves ~5 min search, 99% saves 15+ min, <40–50% low value.

---

## 6. Authentication / RBAC / Payment Integration

### Authentication — HCMUT_SSO is CAS, NOT OAuth2/SAML
`https://sso.hcmut.edu.vn/cas/login` self-reports **"Powered by Jasig CAS 3.5.1"** — an Apereo/Jasig **Central Authentication Service**. Design the parking app as a **CAS service/client**, ticket-based, NOT an OAuth2 relying party. Do **not** assume client_id/secret or OIDC discovery. Login credential = **BKNetID** (students use **MSSV** as username). Use a CAS client library (Spring Security CAS `Cas30ServiceTicketValidator`, python-cas, phpCAS) — do not hand-roll.

**CAS login flow (5 steps):**
1. Unauthenticated user hits parking app → app **302 → `.../cas/login?service=<URL-encoded callback>`**.
2. CAS authenticates (username/password on sso.hcmut.edu.vn), sets **TGC** cookie scoped to sso.hcmut.edu.vn (this is what gives SSO across MyBK/LMS).
3. CAS **302 → `service?ticket=ST-xxxx`** (Service Ticket, one-time-use, short-lived).
4. Parking **backend** (server-to-server, not browser) calls **`.../cas/p3/serviceValidate?service=<same>&ticket=ST-xxxx`** — the `service` string must **byte-match** step 1 or validation fails.
5. On `<cas:authenticationSuccess>` the app mints its **own local session/JWT**. ST consumed on first validation (replay-proof by design).

**Use CAS 3.0 `/p3/serviceValidate`, NOT 2.0 `/serviceValidate`.** 2.0 returns only `cas:user` (username); 3.0 p3 returns `cas:user` + a **`<cas:attributes>`** block (uid, email, full name, and crucially **affiliation/role** e.g. eduPersonAffiliation, memberOf). **#1 open question to HCMUT IT: which attributes does /p3/serviceValidate release for a parking service?** — the answer decides how much of DATACORE you actually need.

**Single Logout (SLO):** CAS POSTs a `samlp:LogoutRequest`-style XML (with SessionIndex) to registered service URLs; server **ignores POST errors (fire-and-forget)**. Expose a logout-listener that maps SessionIndex → local session and kills it, but **don't rely on SLO** — also enforce short local session lifetimes.

### DataCore read-only sync (distinct from auth)
CAS proves WHO logged in (+ login-time attributes). Richer/authoritative data (full name, khoa/faculty, student vs staff class, enrollment status, vehicle/plate registration) lives in **HCMUT_DATACORE, the system of record, READ-ONLY (never write)**.

**Pattern:** **JIT provision** a local user row on first CAS login from released attributes, then **enrich/refresh from DATACORE**. Sync options & tradeoffs: (a) scheduled batch pull (nightly full/delta) — simplest, ~24 h staleness OK for slow-changing enrollment/affiliation, **best student-project default**; (b) on-demand pull + cache with TTL (24 h profile, minutes for entitlement) — good if DATACORE exposes a query API; (c) CDC/log streaming — near-real-time but needs transaction-log access, overkill/out of reach; (d) read replica — DBA access, unlikely granted. **Recommendation: JIT-from-CAS + on-demand cache-with-TTL. Rule: "DATACORE is source of truth, local copy is a cache."**

### RBAC + ABAC
Model **app roles as classic RBAC**: tables `users`, `roles`, `permissions`, `user_roles` (M:N), `role_permissions` (M:N) — data-driven so admins change grants without redeploy. Model the **learner/faculty/staff/visitor distinction as a `user.affiliation` attribute** (ABAC) used for fee tier and lot eligibility. Pure RBAC can't express "faculty pays a different rate" or "this operator only manages Lot B" — needs an attribute/scope.

**Permission split:**
- `end_user`: view own vehicle(s), start/close own session, view/pay own bill, view own history.
- `parking_operator`: open barrier / register entry-exit, look up any active session, handle exceptions/manual override, issue visitor ticket, view lot occupancy — **scoped to assigned lot(s) via ABAC**.
- `system_administrator`: manage users & role assignments, configure fee rules/tiers, manage lots & barriers, view financial reports & audit log, run reconciliation.
- **Visitor** = end_user with `affiliation=visitor`, usually **no CAS account** (CAS can't authenticate a non-HCMUT person) → handled as **operator-created plate-only sessions**. This is why visitor must be an attribute path, not a login role.

**Enforcement:** server-side middleware **before** business logic on every endpoint — **coarse RBAC gate first** (does this role reach this endpoint), **then object-level ABAC** (does THIS user own this session / does THIS operator manage this lot). Classic bug: RBAC alone lets any `end_user` hit `GET /sessions/{id}` — must verify `session.owner == current_user`. Never trust the client.

### Fee computation — versioned rule engine (not hardcoded)
Billing unit = **ParkingSession** {session_id, user_id/affiliation, vehicle, lot, entry_time, exit_time, applied_rate_rule_id, computed_amount, status}. Fee = f(duration, vehicle_type, affiliation-tier, active-pass?). Support three coexisting models:
1. **Per-entry / duration-based tiered** — e.g. free first 30 min, block rates thereafter, with a **daily cap**; **rounding rule explicit** (partial hour rounded up).
2. **Monthly pass / subscription** — flat fee per period; when active, per-entry charge = 0.
3. **Affiliation-tiered** — student/faculty/staff subsidized/free (recall 15% motorbike / 10% car student discount), visitors pay full.

Store rate rules with **`effective_from`/`effective_to` (temporal versioning)** so historical bills recompute deterministically. **Freeze `computed_amount` + rule version onto each charge line at session close** — do NOT recompute live from current rates or a later price change silently rewrites history. Separate **immutable append-only charge lines** from the periodic **invoice/statement** (billing job aggregates charge lines over the period → statement with running balance).

### BKPay payment integration
**Reality:** BKPay is HCMUT's real gateway but **narrow** — web-only portal via the same CAS SSO, **no public API/webhooks**, connected to exactly **one bank (OCB / Orient Commercial Bank)**, scope = tuition/service-fees/scholarship/salary only, NOT general micropayments. **Treat "pay via BKPay" as a project RISK/assumption.** Realistic options to state: (a) prepaid parking wallet topped up as a school "service fee" via the OCB rail; (b) **mock/stub the gateway for the prototype** and flag a real BKPay/OCB API as future work. Do NOT assume an off-the-shelf BKPay parking API exists.

**Design to the standard Vietnamese-gateway shape** (VNPay/MoMo/ZaloPay all share it; BKPay almost certainly mirrors it): **redirect-to-gateway + server-to-server IPN, HMAC-signed payloads.** (VNPay: HMAC-SHA512 over alphabetically-sorted params, `vnp_Amount = amount×100` integer, `vnp_SecureHash`. MoMo: HMAC-SHA256 over ordered key=value.) Expect a merchant/partner code + shared secret + a signing algorithm over sorted params.

**BKPay flow (design pattern):**
1. App creates local `payment_transaction` row `status=PENDING` with its OWN unique order/reference id (**this id, not the amount, is the correlation key**).
2. App builds signed request (amount, order id, return url, ipn/notify url, expiry) → redirect browser to BKPay.
3. User pays inside BKPay.
4. **Two independent channels return:** the **RETURN URL** (browser redirect — "thank you" display ONLY, **never trust to mark paid**, forgeable) and the **IPN / server-to-server callback (SOURCE OF TRUTH)** for settlement.
5. On IPN: **verify HMAC first** (reject if invalid) → check transaction exists + amount matches → transition **PENDING→SETTLED/FAILED**.
6. Respond 200/ack quickly; do heavy work (mark bill paid, open barrier, email) in a **background worker**.

**Idempotency is mandatory on the IPN handler** — gateways retry (~3× exponential backoff, e.g. 1s/3s/10s, plus bulk re-delivery after outage), so "payment succeeded" WILL arrive more than once: (a) store processed event/txn ids, short-circuit duplicates (return stored result); (b) make PENDING→SETTLED a **conditional update `... WHERE status='PENDING'`** so a second delivery is a no-op; (c) **reject callbacks older than a few minutes** (replay protection). **Keyed on order/event id, not amount.**

### Audit & reconciliation
- **Tamper-evident, append-only financial audit log** (first-class component): every money-affecting action (txn created, IPN received, status change, refund, admin fee-rule change, reconciliation adjustment). **Hash-chaining:** each row stores `hash = H(prev_hash + row_data)` (SHA-256/HMAC) so any altered/deleted historic row breaks the chain. Never mutate/delete audit rows. Optionally frame payments as **double-entry journal entries** for provable balances (report rigor).
- **Daily reconciliation job:** pull BKPay/OCB settlement report (CSV/API), match each line to a local `payment_transaction` by `gateway_transaction_id + amount`. Matched → confirmed. Local SETTLED with no settlement line, settlement line with no local record, or amount mismatch → **flagged as a "reconciliation break"** in a queryable table for admin resolution. Safety net for "we think it's paid" vs "gateway actually settled" (lost IPN, paid-but-unmarked).

---

## 7. Recommended Architecture & Deployment Topology

### Component decomposition — 10 services behind an API Gateway (split by rate-of-change + data ownership, not CRUD)
1. **API Gateway** (Spring Cloud Gateway / Kong) — single ingress, TLS termination, routing, rate-limit, JWT validation, CORS. One stable edge for IoT devices, mobile, admin web, signage.
2. **Auth/SSO Adapter** — owns CAS login, mints internal JWT/session, maps SSO identity → local User/Role. Isolates the CAS protocol dance; lets you stub SSO in dev.
3. **Access Control / Gate** — commands entry/exit barriers, matches plate/RFID/QR to a valid session, writes AccessEvent, decides open/deny. Small, independently deployable, safety-critical (a bug leaves vehicles stuck).
4. **Sensor Ingestion** — the **ONLY MQTT consumer that writes slot state**; validates/deduplicates/debounces raw messages, updates authoritative slot state, emits `SlotStateChanged`. Absorbs noisy high-freq IoT traffic; shields core from device protocol churn.
5. **Availability/Guidance** — read-optimized projection of free/occupied counts per Zone; pushes guidance to signage/app; "nearest free slot" routing. Read-heavy, latency-sensitive, cacheable → scale reads without touching writes (CQRS-lite).
6. **Billing** — owns ParkingSession pricing lifecycle, applies PricingPolicy, produces BillingRecord on exit. Money math auditable, versioned, changes independent of hardware.
7. **Payment Integration** — adapter to BKPay (redirect + webhook), reconciles Payment vs BillingRecord, idempotency + retries. Isolates external gateway's slow/flaky failure modes.
8. **DataCore Sync Adapter** — pulls identity/vehicle/permit/whitelist from DATACORE on schedule + on-demand; caches locally. DATACORE authoritative but not always reachable → cache = resilience + speed.
9. **Admin/Config** — manages Zones, slots, sensors, pricing policies, device registry, feature flags. Config changes daily → must not require runtime redeploy.
10. **Notification/Signage** — fans out to LED signage, mobile push, SMS/email. Delivery channels change often and can fail without blocking core flows.

**MVP simplification (do NOT force physical microservices):** build a **modular monolith** — the 10 as clear modules/packages with these boundaries, one API gateway, one MQTT broker, one PostgreSQL. Only physically split Ingestion or Payment if time allows. Preserves the architecture story on the diagram while staying buildable by a student team.

### Deployment topology — 6 tiers (bottom-up)
- **Tier 1 — Field devices:** per-slot sensors (magnetometer/ultrasonic/IR) + gate controllers (barrier + RFID/QR reader + LPR camera) + LED signage.
- **Tier 2 — Edge gateways:** LoRaWAN/Zigbee/WiFi gateways aggregate sensors, bridge to IP, publish to MQTT over TLS; ~one gateway per level/building.
- **Tier 3 — Messaging:** MQTT broker (EMQX / Mosquitto cluster) — buffer/decoupler between unreliable field and reliable backend; retained messages + QoS1 for slot state.
- **Tier 4 — Backend cluster (Docker/K8s):** API Gateway + 10 services, stateless & horizontally scalable **except Ingestion (partition by gateway/zone)**.
- **Tier 5 — Data:** **PostgreSQL** (transactional core — sessions, billing, users, access events), **Redis** (slot-state cache + guidance projection + rate-limit counters), optional **TimescaleDB/InfluxDB** for raw sensor history/analytics.
- **Tier 6 — External:** HCMUT_SSO (CAS), DATACORE (REST/SOAP), BKPay (redirect + async webhook).
- **Links:** gate controllers get commands FROM Access Control (MQTT or local REST); signage gets updates FROM Notification/Signage (MQTT); all device↔broker and service↔external links **mutual-TLS where possible**.

### Three UML views to produce (marks won/lost on consistency)
1. **Component/package diagram** — 10 services + API gateway + which DB each owns.
2. **Deployment diagram** — 6 tiers, device→gateway→MQTT→service→DB→external nodes + mTLS links.
3. **Domain class diagram** — the entities below with multiplicities.

---

## 8. Core Domain Entities & Design Patterns

### Entities (13 core; attributes)
- **User** {id, hcmutId/MSSV, fullName, email, phone, type(STUDENT|STAFF|GUEST), affiliation, status} — 1—* Vehicle, *—* Role.
- **Role** {id, name(DRIVER|OPERATOR|ADMIN|FINANCE), permissions[]} — M:N User.
- **Vehicle** {id, ownerUserId, plateNumber, rfidTag, type(CAR|MOTORBIKE), registeredAt} — belongs to User, 1—* Session.
- **Zone** {id, name, buildingCode, floor, capacity, vehicleType} — 1—* ParkingSlot, aggregates availability.
- **ParkingSlot** {id, zoneId, code, type, state(FREE|OCCUPIED|RESERVED|OUT_OF_SERVICE), lastChangedAt, currentSessionId?} — 1—1 Sensor.
- **Sensor** {id, slotId, gatewayId, hardwareType, lastSeenAt, batteryLevel, health(ONLINE|OFFLINE|FAULTY)} — attached to one Slot, reports via one Gateway. **First-class** (stale/failed sensors are the hardest reliability problem).
- **Gateway** {id, location, protocol, ipAddress, lastHeartbeat, status} — 1—* Sensor.
- **ParkingSession** (**aggregate root**) {id, vehicleId, userId?, slotId, zoneId, entryEventId, exitEventId?, entryTime, exitTime?, entryPlate, exitPlate, plateMatchFlag, state(ACTIVE|COMPLETED|PENDING_PAYMENT|EXPIRED|ABANDONED), pricingPolicyId} — links vehicle-slot-time-money; 1—1 BillingRecord; 1—* AccessEvent.
- **Ticket** {id, sessionId, code(QR), issuedAt, type(TIMED|VALIDATED), status} — guest/no-plate flow.
- **AccessEvent** {id, gateId, sessionId?, vehicleId?, direction(ENTRY|EXIT), method(PLATE|RFID|QR), decision(GRANTED|DENIED), reason, timestamp} — audit of every gate action.
- **PricingPolicy** {id, name, vehicleType, userType, ratePerHour, freeMinutes, dailyCap, gracePeriod, validFrom, validTo, active} — Strategy input.
- **BillingRecord** {id, sessionId, policyId, durationMinutes, amount, currency, breakdown[], status(UNPAID|PAID|WAIVED|REFUNDED), createdAt} — 1:1 completed Session; 1—* Payment.
- **Payment** {id, billingRecordId, method(BKPAY|CASH|WALLET), gatewayTxnId, amount, status(PENDING|SUCCESS|FAILED|REFUNDED), idempotencyKey, createdAt, settledAt}.
- (Supporting) **SignageDevice** {id, zoneId, location, type(ENTRY_BOARD|IN_ZONE|EXIT), lastMessage, status}.

**Key relationships:** User 1..*—* Role; User 1—* Vehicle; Zone 1—* Slot; Slot 1—1 Sensor; Gateway 1—* Sensor; Vehicle 1—* Session; Session 1—1 BillingRecord 1—* Payment; Session 1—* AccessEvent; PricingPolicy 1—* BillingRecord.

### Design patterns (map each to a named class in the class diagram)
- **Observer** — `SensorIngestion` is Subject; `Availability/Guidance`, `Notification/Signage`, `AccessControl` subscribe to `SlotStateChangedEvent{slotId, old, new, at}` and `SessionStateChangedEvent`. Implemented as MQTT topic fan-out + in-app event bus (Spring `ApplicationEvent`). Decouples "who knows a slot freed" from "who reacts".
- **State** — `ParkingSession` and `ParkingSlot` lifecycles as State classes, not if/switch on enum. `SessionState` interface {enter/exit/requestPayment/expire(ctx)}; `ActiveState / PendingPaymentState / CompletedState / ExpiredState` each allow only legal transitions, throw on illegal → prevents "paid before exit" bugs, makes lifecycle a testable state machine. Same for Slot (Free/Occupied/Reserved/OutOfService). **Show ParkingSession as both a UML state diagram AND a State-pattern class diagram** (ENTRY → ACTIVE → exit request → PENDING_PAYMENT → payment success → COMPLETED, with EXPIRED/ABANDONED branches).
- **Strategy** — `PricingStrategy { Money calculate(ParkingSession, PricingPolicy) }`; `HourlyStrategy / DailyCapStrategy / FreeGraceStrategy / StudentSubsidizedStrategy / FlatRateStrategy`. Billing selects from PricingPolicy at exit; new rate schemes = new classes, no edits to Billing core.
- **Adapter** — `SsoAdapter`, `DataCoreAdapter`, `PaymentGatewayAdapter` (behind it `BkPayAdapter`); clean internal port + protocol translation → swap BKPay / mock SSO in tests without touching domain.
- **Circuit Breaker** (Resilience4j) — wrap every outbound call to SSO/DATACORE/BKPay; on repeated failures the breaker opens and **falls back** (cached DATACORE identity, queued payment retry, cached SSO session). Pair with **bulkhead** (isolated thread pools) + timeout + retry-with-backoff. **Document a fallback per external system so "what happens when BKPay is down" has an answer.**
- (Also) **Repository** per aggregate; **CQRS-lite** (Availability reads a denormalized Redis projection separate from the Postgres write model).

---

## 9. Key Decisions & Assumptions to State Explicitly

1. **HCMUT_SSO = CAS 3.5.1, not OAuth2/OIDC.** Integrate as a CAS service (redirect → ST → `/p3/serviceValidate`) using a CAS client library. If the report currently says "OAuth2/OIDC", correct it, or frame explicitly: "HCMUT_SSO is CAS; if graders permit an abstract IdP we model it as OIDC, otherwise CAS."
2. **Primary vehicle = motorbike; barrier-free multi-lane flow** with overhead ANPR + card-tap-on-the-move; physical barriers only for the small car lot / paid-exit. Design for burst throughput, not steady flow.
3. **Identity is plate-bound** — every session stores entry+exit plate photo/text and a match flag; mismatch = anti-theft alarm.
4. **DATACORE is read-only, source of truth; local copy is a cache.** Primary provisioning = JIT-from-CAS-attributes + on-demand cache-with-TTL (24 h profile). Never write to DATACORE.
5. **BKPay has no public API and is OCB-only/tuition-scoped** → for MVP, mock/stub the payment gateway (design to VNPay/MoMo redirect+IPN+HMAC shape) or use a prepaid wallet on the OCB rail; real BKPay/OCB API = future work.
6. **Occupancy tracking = count-based per zone** (increment on entry / decrement on exit) + nightly zero-reset recalibration to counter documented ~85%/30-day drift.
7. **MQTT is the single IoT↔backend seam; Sensor Ingestion is the only writer of slot state**; all other services react via internal domain events (Observer).
8. **Availability is near-real-time, event-driven delta counting** with last-known-state persistence and an "unknown" fallback; every availability figure is timestamped.
9. **Sign-state thresholds are config, not hardcoded** (default green<75 / yellow 75–89 / orange 90–99 / red 100; "nearly full" = 90% occupancy).
10. **Architecture is a modular monolith for the MVP** (10 logical modules, one Postgres, one gateway, one MQTT), not physically deployed microservices.
11. **Fee rules are temporally versioned; computed amount frozen at session close.**
12. **Multi-campus, multi-gate** (Lý Thường Kiệt + Dĩ An), not single-lot.
13. **Assumptions to confirm/flag in the SRS:** card type (RFID/NFC), prepaid vs postpaid billing, whether Reservation is in scope, single-site vs multi-site rollout for the MVP, exact ANPR vendor accuracy target (~98%), which sensor modality per lot.

---

## 10. Risks & Open Questions

**Open questions (send to HCMUT IT/stakeholders):**
- **#1 (highest value):** Which user attributes does `/p3/serviceValidate` release for a parking service (uid, email, full name, **affiliation/role**, faculty)? Decides how much of DATACORE is actually needed — if affiliation comes down in CAS attributes, DATACORE shrinks to enrichment only.
- Does DATACORE expose a query API (for on-demand cache) or only batch export? Does it hold vehicle/plate registration?
- Does any BKPay/OCB API exist for micropayments or webhooks, or must parking ride the "service fee" rail? Is a prepaid wallet acceptable to finance?
- Will the university grant a CAS service registration + service URL for the app? SLO behavior?
- Barrier safety certification requirements (fail-safe on vehicle presence).

**Risks:**
- **BKPay integration** — no public API, single-bank, tuition-scoped; the real payment path may not be buildable within the course → mitigate by stubbing + documenting as future work.
- **Peak-hour throughput** — a barrier-per-vehicle design gridlocks (~40 veh/min ceiling at 1.5 s/cycle) against hundreds/min; mitigate with barrier-free ANPR+tap flow.
- **Sensor false-triggers / stale sensors** — EMI (magnetic spikes), silent death; mitigate with dual-detection, EMI filtering, heartbeat + staleness "unknown" fallback, debounce.
- **Count drift** (~85% over 30 days) — mitigate with periodic recalibration and sensor reconciliation.
- **ANPR accuracy in real conditions** (~98% claimed; degraded by weather/low-light/occlusion) — mitigate with card+plate dual credential and operator override.
- **Lost/mismatched IPN** — mitigate with idempotent IPN handler + daily reconciliation + reconciliation-breaks table.
- **CAS SLO unreliability** (fire-and-forget) — mitigate with short local session lifetimes.
- **Multi-campus network partitions** — mitigate with edge offline mode + gateway store-and-forward + sync ≤60 s on reconnect.
- **Over-scoping** (reservation, multi-site, full microservices) vs a runnable student MVP — mitigate by scoping reservation as optional and building the modular monolith.
- **Privacy** — plate photos + identity linkage; mitigate with PII minimization, AES-256 at rest, no full card/payment data in logs, retention policy.
