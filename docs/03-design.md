# Smart Parking Management System for HCMUT (IoT-SPMS)
## Submission #3: Design

Course: Software Engineering (SE252)
This builds on Submissions #1 and #2.

## Contents
1. Architecture overview
2. Components
3. Deployment
4. Class diagram
5. Design patterns
6. Class and method descriptions
7. Test cases

## 1. Architecture overview

We split the system into a few services, each responsible for one part of the job, and put an API gateway in front of them. For the project we build it as one application with these parts kept as separate modules, rather than as truly separate deployed services, so that a small team can actually build and run it. If the system grew, the same boundaries would let us pull a module out into its own service later. The two we would split first are the sensor ingestion and the payment part, because those are the ones most likely to be noisy or to fail in ways we do not control.

We grouped the modules by what they own and by how often they change, not just by which table they touch. The sensor and gate code changes when hardware changes, so we keep it apart. The pricing and payment code changes when the fees or the bank change, so that is apart too. The availability view is read a lot, so we keep its data separate and cache it.

Each of these choices lines up with a non-functional requirement from Submission #1:

- We put the sensors behind an MQTT broker so a slow or offline sensor does not block the rest (NFR-REL-03).
- The gate keeps a local cache and works offline (NFR-REL-02).
- Calls out to SSO, DATACORE, and BKPay have a timeout and a fallback, so if one of them is down the rest keeps going (NFR-REL-01).
- The free-count for the availability view is cached so reads are fast (NFR-PERF-02).
- We keep an audit table of who did what (NFR-SEC-03).
- We check the roles on every request and make sure a user can only see their own session (NFR-SEC-02).

## 2. Components

<svg viewBox="0 0 700 470" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:680px;font-family:Arial,sans-serif;font-size:11px">
  <!-- clients row -->
  <rect x="30" y="20" width="120" height="34" fill="#FEFECE" stroke="#A80036"/><text x="90" y="41" text-anchor="middle">Mobile / web app</text>
  <rect x="170" y="20" width="110" height="34" fill="#FEFECE" stroke="#A80036"/><text x="225" y="41" text-anchor="middle">Admin / operator</text>
  <rect x="300" y="20" width="130" height="34" fill="#FEFECE" stroke="#A80036"/><text x="365" y="41" text-anchor="middle">Sensors and signs</text>

  <!-- gateway + broker -->
  <rect x="60" y="90" width="160" height="30" fill="#FEFECE" stroke="#A80036"/><text x="140" y="110" text-anchor="middle">API gateway</text>
  <rect x="300" y="90" width="130" height="30" fill="#FEFECE" stroke="#A80036"/><text x="365" y="110" text-anchor="middle">MQTT broker</text>

  <!-- backend box -->
  <rect x="30" y="150" width="420" height="200" fill="#FEFECE" stroke="#A80036"/>
  <text x="40" y="168" font-size="11">Backend</text>
  <rect x="45" y="180" width="120" height="26" fill="#FEFECE" stroke="#A80036"/><text x="105" y="197" text-anchor="middle">Login handler</text>
  <rect x="175" y="180" width="120" height="26" fill="#FEFECE" stroke="#A80036"/><text x="235" y="197" text-anchor="middle">Access control</text>
  <rect x="305" y="180" width="130" height="26" fill="#FEFECE" stroke="#A80036"/><text x="370" y="197" text-anchor="middle">Sensor ingestion</text>
  <rect x="45" y="216" width="120" height="26" fill="#FEFECE" stroke="#A80036"/><text x="105" y="233" text-anchor="middle">Availability</text>
  <rect x="175" y="216" width="120" height="26" fill="#FEFECE" stroke="#A80036"/><text x="235" y="233" text-anchor="middle">Billing</text>
  <rect x="305" y="216" width="130" height="26" fill="#FEFECE" stroke="#A80036"/><text x="370" y="233" text-anchor="middle">Payment</text>
  <rect x="45" y="252" width="120" height="26" fill="#FEFECE" stroke="#A80036"/><text x="105" y="269" text-anchor="middle">DataCore reader</text>
  <rect x="175" y="252" width="120" height="26" fill="#FEFECE" stroke="#A80036"/><text x="235" y="269" text-anchor="middle">Admin / config</text>
  <rect x="305" y="252" width="130" height="26" fill="#FEFECE" stroke="#A80036"/><text x="370" y="269" text-anchor="middle">Signs / notify</text>
  <rect x="110" y="300" width="120" height="26" fill="#FEFECE" stroke="#A80036"/><text x="170" y="317" text-anchor="middle">Audit log</text>

  <!-- data -->
  <rect x="45" y="360" width="110" height="28" fill="#FEFECE" stroke="#A80036"/><text x="100" y="378" text-anchor="middle">Database</text>
  <rect x="175" y="360" width="90" height="28" fill="#FEFECE" stroke="#A80036"/><text x="220" y="378" text-anchor="middle">Cache</text>

  <!-- external column -->
  <rect x="500" y="150" width="170" height="120" fill="#FEFECE" stroke="#A80036"/>
  <text x="510" y="168" font-size="11">Outside systems</text>
  <rect x="515" y="180" width="140" height="24" fill="#FEFECE" stroke="#A80036"/><text x="585" y="196" text-anchor="middle">HCMUT_SSO</text>
  <rect x="515" y="210" width="140" height="24" fill="#FEFECE" stroke="#A80036"/><text x="585" y="226" text-anchor="middle">HCMUT_DATACORE</text>
  <rect x="515" y="240" width="140" height="24" fill="#FEFECE" stroke="#A80036"/><text x="585" y="256" text-anchor="middle">BKPay</text>

  <!-- arrows (main flows only) -->
  <g stroke="#A80036" fill="none" marker-end="url(#ah)">
    <line x1="90" y1="54" x2="130" y2="90"/>
    <line x1="225" y1="54" x2="150" y2="90"/>
    <line x1="365" y1="54" x2="365" y2="90"/>
    <line x1="140" y1="120" x2="140" y2="150"/>
    <line x1="365" y1="120" x2="370" y2="180"/>
    <line x1="240" y1="350" x2="130" y2="360"/>
    <line x1="240" y1="350" x2="215" y2="360"/>
    <line x1="450" y1="210" x2="500" y2="210"/>
  </g>
  <defs>
    <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L7,3 L0,6" fill="none" stroke="#A80036"/>
    </marker>
  </defs>
</svg>

What each module does:

- API gateway: the single entry point. Handles HTTPS, routing, and checking the login token.
- Login handler: does the SSO login and creates a local session. Keeping this in one place means we can fake the login in testing.
- Access control (gate): decides entry and exit, matches the plate/card/QR to a session, and writes the entry/exit events.
- Sensor ingestion: the only module that writes slot state. It reads the MQTT messages, drops duplicates, and updates the slots.
- Availability: keeps the free-count per area, ready to read quickly, and feeds the signs and the app.
- Billing: works out the fee for a session and makes the bill when the session closes.
- Payment: talks to BKPay and records the payment.
- DataCore reader: pulls student and vehicle data and caches it. We only read from DATACORE.
- Admin / config: manages zones, slots, sensors, price rules, and the device list.
- Signs and notifications: sends updates to the signs and messages to users.
- Audit log: keeps a record of entries, exits, payments, and admin actions.

## 3. Deployment

<svg viewBox="0 0 680 430" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:640px;font-family:Arial,sans-serif;font-size:11px">
  <!-- field devices -->
  <rect x="20" y="20" width="300" height="70" fill="#FEFECE" stroke="#A80036"/>
  <text x="30" y="37" font-size="11">At the lot</text>
  <rect x="30" y="45" width="80" height="34" fill="#FEFECE" stroke="#A80036"/><text x="70" y="65" text-anchor="middle">Sensors</text>
  <rect x="120" y="45" width="110" height="34" fill="#FEFECE" stroke="#A80036"/><text x="175" y="60" text-anchor="middle">Gate: barrier,</text><text x="175" y="72" text-anchor="middle">reader, camera</text>
  <rect x="240" y="45" width="70" height="34" fill="#FEFECE" stroke="#A80036"/><text x="275" y="65" text-anchor="middle">Signs</text>

  <!-- gateway -->
  <rect x="60" y="130" width="220" height="34" fill="#FEFECE" stroke="#A80036"/><text x="170" y="151" text-anchor="middle">Gateway (buffers if network drops)</text>

  <!-- broker -->
  <rect x="90" y="200" width="160" height="30" fill="#FEFECE" stroke="#A80036"/><text x="170" y="220" text-anchor="middle">MQTT broker</text>

  <!-- backend -->
  <rect x="60" y="270" width="220" height="34" fill="#FEFECE" stroke="#A80036"/><text x="170" y="291" text-anchor="middle">Backend server (the services)</text>

  <!-- data -->
  <rect x="60" y="345" width="100" height="30" fill="#FEFECE" stroke="#A80036"/><text x="110" y="365" text-anchor="middle">Database</text>
  <rect x="180" y="345" width="100" height="30" fill="#FEFECE" stroke="#A80036"/><text x="230" y="365" text-anchor="middle">Cache</text>

  <!-- external -->
  <rect x="420" y="240" width="230" height="120" fill="#FEFECE" stroke="#A80036"/>
  <text x="430" y="258" font-size="11">Outside systems</text>
  <rect x="435" y="270" width="200" height="24" fill="#FEFECE" stroke="#A80036"/><text x="535" y="286" text-anchor="middle">HCMUT_SSO</text>
  <rect x="435" y="300" width="200" height="24" fill="#FEFECE" stroke="#A80036"/><text x="535" y="316" text-anchor="middle">HCMUT_DATACORE</text>
  <rect x="435" y="330" width="200" height="24" fill="#FEFECE" stroke="#A80036"/><text x="535" y="346" text-anchor="middle">BKPay</text>

  <g stroke="#A80036" fill="none" marker-end="url(#ah2)">
    <line x1="70" y1="79" x2="120" y2="130"/>
    <line x1="170" y1="164" x2="170" y2="200"/>
    <line x1="170" y1="230" x2="170" y2="270"/>
    <line x1="130" y1="304" x2="110" y2="345"/>
    <line x1="210" y1="304" x2="230" y2="345"/>
    <line x1="280" y1="287" x2="420" y2="300"/>
    <line x1="230" y1="79" x2="255" y2="270"/>
  </g>
  <defs>
    <marker id="ah2" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L7,3 L0,6" fill="none" stroke="#A80036"/>
    </marker>
  </defs>
</svg>

Some notes:

- The sensors send their updates to a nearby gateway, which forwards them to the broker over the network. If the network to the backend drops, the gateway holds the data and sends it once it is back.
- The database holds the real data (sessions, bills, users, events). The cache holds the free-count for fast reads.
- All the links use HTTPS.

## 4. Class diagram

```mermaid
classDiagram
    class User {
        +Long id
        +String hcmutId
        +String fullName
        +String email
        +UserType type
        +String category
        +authenticate() Session
        +addVehicle(Vehicle) void
    }
    class Role {
        +Long id
        +String name
        +hasPermission(name) boolean
    }
    class Vehicle {
        +Long id
        +String plateNumber
        +String rfidTag
        +VehicleType type
    }
    class Zone {
        +Long id
        +String name
        +int capacity
        +VehicleType vehicleType
        +freeCount() int
        +signState() State
    }
    class ParkingSlot {
        +Long id
        +String code
        +SlotState state
        +Date lastChangedAt
        +occupy() void
        +release() void
        +markUnknown() void
    }
    class Sensor {
        +Long id
        +String hardwareType
        +Date lastSeenAt
        +int battery
        +Health health
        +isStale(timeout) boolean
    }
    class Gateway {
        +Long id
        +String location
        +Date lastHeartbeat
    }
    class ParkingSession {
        +Long id
        +Date entryTime
        +Date exitTime
        +String entryPlate
        +String exitPlate
        +boolean plateMatch
        +SessionState state
        +open() void
        +requestExit() void
        +close() void
        +hold() void
    }
    class Ticket {
        +Long id
        +String qrCode
        +Date issuedAt
        +TicketStatus status
    }
    class AccessEvent {
        +Long id
        +Direction direction
        +String method
        +String decision
        +String reason
        +Date timestamp
    }
    class PriceRule {
        +Long id
        +String name
        +VehicleType vehicleType
        +String userCategory
        +int rate
        +int freeMinutes
        +int dailyCap
        +Date validFrom
        +Date validTo
    }
    class Bill {
        +Long id
        +int durationMinutes
        +int amount
        +BillStatus status
        +Date createdAt
    }
    class Payment {
        +Long id
        +String method
        +String gatewayTxnId
        +int amount
        +PaymentStatus status
        +Date createdAt
    }

    User "1" --> "*" Vehicle : owns
    User "*" --> "*" Role : has
    User "1" --> "*" ParkingSession : drives
    Zone "1" --> "*" ParkingSlot : has
    ParkingSlot "1" --> "1" Sensor : watched by
    Gateway "1" --> "*" Sensor : routes
    Vehicle "1" --> "*" ParkingSession : parks in
    ParkingSlot "1" --> "*" ParkingSession : holds
    ParkingSession "1" --> "0..1" Ticket : has
    ParkingSession "1" --> "*" AccessEvent : logs
    ParkingSession "1" --> "0..1" Bill : billed as
    Bill "1" --> "*" Payment : paid by
    PriceRule "1" --> "*" Bill : priced by
```

The classes fall into three kinds. The entity classes are the ones above (User, Vehicle, Zone, ParkingSlot, Sensor, Gateway, ParkingSession, Ticket, AccessEvent, PriceRule, Bill, Payment). The screen classes are the login page, availability map, operator board, exit terminal, and admin pages. The service classes are the ones from Section 2 (login handler, access control, sensor ingestion, availability, billing, payment, admin, notifications, audit), described in Section 6.

## 5. Design patterns

We used a few patterns where they fit:

- Observer, for the sensor updates. The sensor ingestion is the source of "a slot changed" events, and the availability, signs, and access-control code react to them. In the prototype this is just a small event bus, and over MQTT it is the same idea (publish and subscribe).
- State, for the session and the slot. Instead of a big if/else on a status field, the session moves between states (active, waiting for payment, held, closed) and only the allowed moves are possible. This is the same as the state diagrams in Submission #2.
- Strategy, for the pricing. There is one interface that takes a session and returns an amount, and a class per pricing style (per hour, per day with a cap, free grace period, student rate, flat rate). Adding a new fee style means adding a class, not editing the billing code.
- Adapter, for the outside systems. The SSO, DATACORE, and BKPay each sit behind a small adapter, so we can swap in a fake one for testing.

```mermaid
classDiagram
    class PricingStrategy {
        <<interface>>
        +calculate(session, rule) int
    }
    class HourlyStrategy
    class DailyCapStrategy
    class StudentStrategy
    class FlatRateStrategy
    PricingStrategy <|.. HourlyStrategy
    PricingStrategy <|.. DailyCapStrategy
    PricingStrategy <|.. StudentStrategy
    PricingStrategy <|.. FlatRateStrategy
    class BillingService {
        -PricingStrategy strategy
        +computeFee(session) int
    }
    BillingService --> PricingStrategy

    class SessionState {
        <<interface>>
        +requestExit(ctx)
        +close(ctx)
        +hold(ctx)
    }
    class ActiveState
    class WaitingPaymentState
    class HeldState
    class ClosedState
    SessionState <|.. ActiveState
    SessionState <|.. WaitingPaymentState
    SessionState <|.. HeldState
    SessionState <|.. ClosedState
```

## 6. Class and method descriptions

The service classes and their main methods.

### LoginHandler
- buildLoginRedirect(serviceUrl): returns the SSO login URL to send the user to.
- validateTicket(ticket, serviceUrl): checks the ticket on our server and returns the user identity, or an error if it is invalid.
- createSession(identity): creates the local user on first login if needed, fills in the profile from DATACORE, and issues a local session token.
- logout(): ends the local session.

### AccessControlService
- handleEntry(read): checks the credential, the blacklist, and whether the area is free, opens a session, writes the entry event, and lowers the free count. Returns granted or denied with a reason.
- handleExit(read): finds the open session, checks the plate, triggers the fee and payment, and closes the session on success.
- verifyPlateMatch(session, exitPlate): compares the exit plate with the entry plate. If they differ it raises the theft alarm, holds the session, and returns false.
- startVisitorSession(plate): opens a plate-only session and gives out a QR ticket.
- openBarrier(gate): sends the open command to the barrier, with the safety check so it does not close on someone.

### SensorIngestionService
- onMessage(msg): the entry point for a sensor message. Drops duplicates, checks it, and applies it.
- applyChange(slotId, state, time): updates the slot and its last-seen time, and fires a "slot changed" event.
- checkStale(): runs every so often; any slot not seen for too long is marked unknown, not counted as free, and an alert is raised.
- reconcile(zone): compares the sensor counts with the gate counts and flags differences.

### AvailabilityService
- onSlotChanged(event): updates the free count for the area.
- freeCount(zoneId): returns the current free count for an area, not counting unknown or out-of-service slots.
- signState(zoneId): turns the occupancy percentage into a sign state using the admin thresholds.
- nearestFreeZone(fromZoneId): returns the nearest area that still has room, for the guidance arrows.

### BillingService
- resolveRule(session): picks the price rule for the vehicle type and user category for the time of the session.
- computeFee(session): uses the chosen pricing strategy to work out the amount.
- closeSession(session): saves the amount on a new bill and moves the session toward closed. The amount is saved so a later price change does not affect this bill.
- generateStatement(user, period): adds up a member's bills over a period and sends the payment request to BKPay.

### PaymentService
- initiate(bill, method): creates a pending payment with its own reference id and builds the redirect to BKPay.
- handleCallback(callback): checks the callback, matches it to the payment and amount, and marks it paid. If the same callback comes twice, it does not charge twice.
- refund(payment, amount): issues a refund and records it.

### AdminService, NotificationService, AuditService
- upsertPriceRule(rule): checks there is no overlapping active rule, saves it with its dates, and logs the change.
- assignRole(user, role): grants or removes a role and logs it.
- pushSign(zone, state): sends the sign state to the signs.
- append(actor, action): writes a row to the audit log with who did it and when.
- reconcile(day): matches the payments we recorded against the bank report and flags any that do not match.

## 7. Test cases

Some tests across the main flows, including the ones that can go wrong.

| ID | Requirement | Setup | Steps | Expected |
|---|---|---|---|---|
| TC-01 | FR-ENT-04 | Valid member, area not full | Card and plate at entry | Session opened, free count down one, granted logged |
| TC-02 | FR-ENT-06 | Area full, no other free | Card at entry | Refused, sign shows full, reason logged |
| TC-03 | FR-ENT-05 | No card | Vehicle at lane | Plate-only session and QR ticket issued |
| TC-04 | FR-EXT-03 | Student, motorbike, ~5h33m stay | Exit and compute | Fee applies the student discount and the cap correctly |
| TC-05 | FR-EXT-04 | Entry plate differs from exit plate | Card at exit | Theft alarm, session held, barrier stays shut, operator told |
| TC-06 | FR-EXT-06 | Session closes, then price changes | Close, then change the rule | Old bill unchanged (amount was saved) |
| TC-07 | FR-OCC-05 | Sensor silent too long | Wait past the timeout | Slot goes to unknown, alert raised, not counted as free |
| TC-08 | FR-SIG-01 | Occupancy passes 90% | Fill the area | Sign turns to nearly full |
| TC-09 | FR-EXT-05 | Payment callback arrives twice | Send it twice | Charged once only |
| TC-10 | FR-ADM-06 | A recorded payment with no bank line | Run the daily check | Flagged as not matching |
| TC-11 | NFR-REL-02 | Backend offline | Enter during the outage | Gate decides locally, event syncs when back |
| TC-12 | NFR-SEC-02 | User asks for another user's session | Request a session they do not own | Refused |
| TC-13 | NFR-SAFE-01 | Vehicle under the barrier | Command close | Barrier does not close |
