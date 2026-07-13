// Smart parking demo. Plain JavaScript, data is in the code, no backend.
// STATE holds everything, sim() drives the fake traffic, the services do
// the work, and the views draw each role's screen.
'use strict';

// small helpers
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const pad = n => String(n).padStart(2, '0');
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtVND = n => n.toLocaleString('vi-VN') + ' đ';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
let SEQ = 8000; const nextId = () => ++SEQ;

/* Vietnamese motorbike-style plate generator, e.g. 59-P1 234.56 */
function genPlate() {
  const prov = pick(['59', '51', '50', '61', '72', '43']);
  const ser = pick('BCDEFGHKLMNPS') + Math.floor(rnd(1, 9));
  const a = Math.floor(rnd(100, 999)), b = Math.floor(rnd(10, 99));
  return `${prov}-${ser} ${a}.${b}`;
}

// thresholds the admin can change (green / yellow / full)
const CONFIG = {
  greenBelow: 75,   // under 75% is green
  yellowBelow: 90,  // 75-89 yellow, 90-99 nearly full, 100 full
  stalenessSec: 8,  // a slot goes unknown if the sensor is quiet this long
  simSpeed: 1,
  arrivalRate: 0.55 // chance of an arrival each tick
};

// price rules
const POLICIES = [
  { id: 'P-MB-STD',  name: 'Std Motorbike', vehicle: 'MOTORBIKE', tier: 'all',     ratePerDay: 3000, freeMin: 30, cap: 3000, discount: 0,    validFrom: '2024-01-01' },
  { id: 'P-MB-STU',  name: 'Student MB',    vehicle: 'MOTORBIKE', tier: 'student', ratePerDay: 3000, freeMin: 30, cap: 3000, discount: 0.15, validFrom: '2024-01-01' },
  { id: 'P-CAR-STD', name: 'Std Car',       vehicle: 'CAR',       tier: 'all',     ratePerHour: 5000, freeMin: 15, cap: 50000, discount: 0,   validFrom: '2024-01-01' },
  { id: 'P-CAR-STU', name: 'Student Car',   vehicle: 'CAR',       tier: 'student', ratePerHour: 5000, freeMin: 15, cap: 50000, discount: 0.10, validFrom: '2024-01-01' },
  { id: 'P-VIS',     name: 'Visitor Flat',  vehicle: 'ANY',       tier: 'visitor', flat: 8000, freeMin: 0, cap: 8000, discount: 0,           validFrom: '2024-01-01' }
];

/* ---------------- Seed: zones + slots per campus ---------------- */
function buildCampus(prefix, zoneDefs) {
  const zones = zoneDefs.map(zd => {
    const slots = [];
    for (let i = 0; i < zd.cap; i++) {
      slots.push({
        id: `${prefix}-${zd.name}-${pad(i + 1)}`,
        state: 'FREE',            // FREE | OCCUPIED | RESERVED | UNKNOWN | OOS
        sessionId: null,
        lastSeen: 0               // sim-second of last sensor update
      });
    }
    return { name: zd.name, vehicle: zd.vehicle, cap: zd.cap, slots };
  });
  return zones;
}

const STATE = {
  now: new Date(2024, 8, 16, 7, 5, 0),   // start ~07:05, peak arrival window
  simSec: 0,
  running: true,
  role: null,
  user: null,
  campus: 'LTK',
  campuses: {
    LTK: { label: 'Lý Thường Kiệt', zones: buildCampus('LTK', [
      { name: 'A', vehicle: 'MOTORBIKE', cap: 60 },
      { name: 'B', vehicle: 'MOTORBIKE', cap: 48 },
      { name: 'C', vehicle: 'MOTORBIKE', cap: 36 },
      { name: 'D', vehicle: 'CAR',       cap: 16 }
    ]) },
    DA: { label: 'Dĩ An', zones: buildCampus('DA', [
      { name: 'A', vehicle: 'MOTORBIKE', cap: 72 },
      { name: 'B', vehicle: 'MOTORBIKE', cap: 60 },
      { name: 'C', vehicle: 'CAR',       cap: 20 }
    ]) }
  },
  sessions: {},        // id -> session
  events: [],          // audit / event feed (newest first)
  alarms: [],          // open alarms
  payments: [],        // settled/failed payments
  reconBreaks: [],     // reconciliation breaks
  wallet: 45000,       // demo driver's prepaid wallet
  driverHistory: [],   // demo driver's own sessions
  logCount: 0,
  stats: { entries: 0, exits: 0, revenue: 0, denied: 0, mismatch: 0 }
};

/* Demo member driver identity (would come from SSO+DataCore) */
const DEMO_DRIVER = { id: 1, hcmutId: '2252001', name: 'Nguyễn Văn A', tier: 'student', vehicle: { plate: genPlate(), type: 'MOTORBIKE', rfid: 'RF-2252001' } };

// the services: everything the app actually does
const services = {
  // write a line to the log
  audit(actor, action, tag = 'info') {
    STATE.logCount++;
    STATE.events.unshift({ id: STATE.logCount, ts: new Date(STATE.now), actor, msg: action, tag });
    if (STATE.events.length > 200) STATE.events.pop();
  },

  // free-count and sign state for each area
  zoneFree(zone) { return zone.slots.filter(s => s.state === 'FREE').length; },
  zoneOccPct(zone) {
    const usable = zone.slots.filter(s => s.state !== 'OOS' && s.state !== 'UNKNOWN').length || zone.cap;
    const occ = zone.slots.filter(s => s.state === 'OCCUPIED' || s.state === 'RESERVED').length;
    return Math.round((occ / usable) * 100);
  },
  signState(pct) {
    if (pct >= 100) return 'red';
    if (pct >= CONFIG.yellowBelow) return 'orange';
    if (pct >= CONFIG.greenBelow) return 'yellow';
    return 'green';
  },
  signLabel(st) { return { green: 'Available', yellow: 'Filling', orange: 'Nearly full', red: 'Full' }[st]; },
  stClass(st) { return { green: 'st-good', yellow: 'st-warn', orange: 'st-serious', red: 'st-crit' }[st]; },
  currentZones() { return STATE.campuses[STATE.campus].zones; },
  nearestFreeZone(fromName) {
    const z = this.currentZones().filter(z => z.name !== fromName && this.zoneFree(z) > 0)
      .sort((a, b) => this.zoneFree(b) - this.zoneFree(a));
    return z[0] || null;
  },
  totalFree() { return this.currentZones().reduce((n, z) => n + this.zoneFree(z), 0); },
  totalCap() { return this.currentZones().reduce((n, z) => n + z.cap, 0); },

  /* ---- Find a free slot for a vehicle type ---- */
  findFreeSlot(vehicleType) {
    for (const z of this.currentZones()) {
      if (z.vehicle !== vehicleType) continue;
      const s = z.slots.find(s => s.state === 'FREE');
      if (s) return { zone: z, slot: s };
    }
    return null;
  },

  // let a vehicle in
  entry({ plate, type, tier, rfid, member, name }) {
    const spot = this.findFreeSlot(type);
    if (!spot) {
      STATE.stats.denied++;
      this.audit('Gate', `Refused ${plate}, lot full for ${type}`, 'deny');
      return { ok: false, reason: 'FULL' };
    }
    const id = nextId();
    const sess = {
      id, plate, entryPlate: plate, exitPlate: null, type, tier,
      rfid: rfid || null, member: !!member, name: name || 'Visitor',
      zone: spot.zone.name, slot: spot.slot.id,
      entrySec: STATE.simSec, entryTime: new Date(STATE.now),
      exitSec: null, state: 'ACTIVE', ticket: member ? null : ('T-' + id),
      billing: null
    };
    spot.slot.state = 'OCCUPIED';
    spot.slot.sessionId = id;
    spot.slot.lastSeen = STATE.simSec;   // sensor confirms occupied
    STATE.sessions[id] = sess;
    STATE.stats.entries++;
    this.audit('Gate', `Let in ${plate} to Zone ${sess.zone} (${sess.slot})${member ? '' : ', visitor ticket ' + sess.ticket}`, 'grant');
    return { ok: true, session: sess };
  },

  // work out the fee
  resolvePolicy(sess) {
    const vt = p => p.vehicle === sess.type || p.vehicle === 'ANY';
    // 1) exact tier match first (e.g. student), 2) then generic "all", 3) then visitor
    return POLICIES.find(p => vt(p) && p.tier === sess.tier)
      || POLICIES.find(p => vt(p) && p.tier === 'all' && sess.member)
      || POLICIES.find(p => p.tier === 'visitor');
  },
  computeFee(sess) {
    const durMin = Math.max(1, Math.round((STATE.simSec - sess.entrySec) * 3)); // 1 sim-sec ≈ 3 "minutes"
    const pol = this.resolvePolicy(sess);
    let amount;
    if (pol.flat != null) amount = pol.flat;
    else if (durMin <= pol.freeMin) amount = 0;
    else if (pol.ratePerDay) amount = pol.ratePerDay;                    // motorbike: per-day flat block
    else { const hrs = Math.ceil(durMin / 60); amount = hrs * pol.ratePerHour; } // car: per-hour, round up
    amount = Math.round(amount * (1 - pol.discount));
    if (pol.cap) amount = Math.min(amount, pol.cap);
    return { durMin, amount, policy: pol };
  },

  // let a vehicle out: check the plate, take payment, close the session
  exit(sessId, { method = 'WALLET', exitPlate = null, forceMismatch = false } = {}) {
    const sess = STATE.sessions[sessId];
    if (!sess || sess.state !== 'ACTIVE') return { ok: false, reason: 'NO_SESSION' };
    const ep = exitPlate || (forceMismatch ? genPlate() : sess.entryPlate);
    sess.exitPlate = ep;
    // plate check: entry plate must match exit plate
    if (ep !== sess.entryPlate) {
      sess.state = 'HELD';
      STATE.stats.mismatch++;
      services.raiseAlarm('PLATE_MISMATCH', `Session ${sess.id}: entry ${sess.entryPlate}, exit ${ep}`, sess.id, true);
      this.audit('Gate', `Plate mismatch at exit, session ${sess.id}`, 'alarm');
      return { ok: false, reason: 'MISMATCH', session: sess };
    }
    const { durMin, amount, policy } = this.computeFee(sess);
    // Payment
    const pay = services.pay(sess, amount, method);
    if (!pay.ok) return { ok: false, reason: pay.reason, amount, durMin, session: sess };
    // save the amount on the record so a later price change doesn't touch it
    sess.billing = { amount, durMin, policyId: policy.id, ruleVersion: policy.validFrom, method, frozenAt: new Date(STATE.now) };
    sess.state = 'COMPLETED';
    sess.exitSec = STATE.simSec;
    sess.exitTime = new Date(STATE.now);
    // free the slot + sensor confirms vacant
    const z = this.currentZones().find(z => z.name === sess.zone) ||
      Object.values(STATE.campuses).flatMap(c => c.zones).find(z => z.slots.some(s => s.id === sess.slot));
    const slot = z && z.slots.find(s => s.id === sess.slot);
    if (slot) { slot.state = 'FREE'; slot.sessionId = null; slot.lastSeen = STATE.simSec; }
    STATE.stats.exits++;
    STATE.stats.revenue += amount;
    if (sess.hcmutId === DEMO_DRIVER.hcmutId || sess.name === DEMO_DRIVER.name) STATE.driverHistory.unshift(sess);
    this.audit('Gate', `Out ${sess.plate}, ${durMin}min, ${fmtVND(amount)}, ${method}`, 'pay');
    return { ok: true, amount, durMin, policy, session: sess };
  },

  // take a payment (fake gateway)
  pay(sess, amount, method) {
    if (amount === 0) { return { ok: true, txn: null }; }
    if (method === 'WALLET') {
      if (STATE.wallet < amount) return { ok: false, reason: 'INSUFFICIENT' };
      STATE.wallet -= amount;
    }
    const txn = {
      id: 'PMT-' + nextId(), sessId: sess.id, amount, method,
      gatewayTxnId: method === 'BKPAY' ? 'BK' + Math.floor(rnd(1e6, 9e6)) : null,
      status: 'SETTLED', idemKey: 'idem-' + sess.id, at: new Date(STATE.now)
    };
    STATE.payments.unshift(txn);
    // now and then pretend the bank confirmation got lost, so the daily check has something to catch
    if (method === 'BKPAY' && Math.random() < 0.12) {
      STATE.reconBreaks.push({ txn: txn.gatewayTxnId, amount, reason: 'Local SETTLED, no bank settlement line', at: new Date(STATE.now) });
    }
    return { ok: true, txn };
  },

  /* ---- Alarms ---- */
  raiseAlarm(type, detail, sessId, crit = false) {
    STATE.alarms.unshift({ id: nextId(), type, detail, sessId, crit, at: new Date(STATE.now), ack: false });
  },
  ackAlarm(id) {
    const a = STATE.alarms.find(a => a.id === id);
    if (a) { a.ack = true; this.audit(STATE.user.name, `ACK alarm ${a.type} (#${a.id})`, 'info'); }
    STATE.alarms = STATE.alarms.filter(a => !a.ack);
  }
};

// the simulation: vehicles arrive and leave, sensors sometimes drop out
const sim = {
  tick() {
    if (!STATE.running) return;
    // advance clock (1 real tick ≈ 20 sim-seconds so "minutes" pass)
    STATE.simSec += 1;
    STATE.now = new Date(STATE.now.getTime() + 20000);

    // a few arrivals per tick, fewer once the lot is nearly full
    const occNow = 1 - services.totalFree() / Math.max(1, services.totalCap());
    const burst = occNow < 0.85 ? Math.ceil(rnd(1, 3.5)) : 1;
    for (let k = 0; k < burst; k++) {
      if (Math.random() > CONFIG.arrivalRate) continue;
      const isMember = Math.random() < 0.8;
      const type = Math.random() < 0.85 ? 'MOTORBIKE' : 'CAR';
      const tier = isMember ? pick(['student', 'student', 'student', 'faculty', 'staff']) : 'visitor';
      services.entry({
        plate: genPlate(), type, tier,
        rfid: isMember ? 'RF-' + Math.floor(rnd(1e6, 9e6)) : null,
        member: isMember, name: isMember ? pick(['Trần B', 'Lê C', 'Phạm D', 'Võ E', 'Đỗ F']) : 'Visitor'
      });
    }

    // some leave; more of them leave when the lot is fuller, so it doesn't drain
    const active = Object.values(STATE.sessions).filter(s => s.state === 'ACTIVE');
    const occFrac = 1 - services.totalFree() / Math.max(1, services.totalCap());
    const departProb = 0.01 + occFrac * 0.04;
    active.forEach(s => {
      const staying = STATE.simSec - s.entrySec;
      if (staying > 6 && Math.random() < departProb) {
        const mismatch = Math.random() < 0.04;   // a few leave with a wrong plate
        services.exit(s.id, { method: pick(['WALLET', 'BKPAY', 'CASH']), forceMismatch: mismatch });
      }
    });

    // a sensor sometimes goes quiet; that slot becomes unknown
    this.currentSlots().forEach(slot => {
      if ((slot.state === 'FREE' || slot.state === 'OCCUPIED') && Math.random() < 0.004) {
        slot.state = 'UNKNOWN';
        services.audit('Sensor', `Slot ${slot.id} went quiet, marked unknown`, 'sensor');
      }
      // stale UNKNOWN sometimes recovers with a fresh report
      if (slot.state === 'UNKNOWN' && Math.random() < 0.08) {
        slot.state = slot.sessionId ? 'OCCUPIED' : 'FREE';
        slot.lastSeen = STATE.simSec;
      }
    });

    app.render();
  },
  currentSlots() { return STATE.campuses[STATE.campus].zones.flatMap(z => z.slots); }
};

// login, logout, render, and the button handlers
const app = {
  tab: { driver: 'avail', operator: 'board', admin: 'tariff' },

  login(role) {
    STATE.role = role;
    STATE.user = role === 'driver'
      ? { name: DEMO_DRIVER.name, sub: 'Student ' + DEMO_DRIVER.hcmutId, role }
      : role === 'operator'
        ? { name: 'Op. Trần Văn B', sub: 'Lot LTK-Main', role }
        : { name: 'Admin. Lê Thị C', sub: 'System Administrator', role };
    $('#login').style.display = 'none';
    $('#app').style.display = 'block';
    $('#roleBadge').textContent = { driver: 'Driver', operator: 'Operator', admin: 'Admin' }[role];
    $('#roleBadge').className = 'role-badge';
    $('#userChip').textContent = STATE.user.name;
    services.audit(STATE.user.name, `Logged in as ${role}`, 'info');
    this.render();
  },
  logout() {
    services.audit(STATE.user.name, 'Logged out', 'info');
    STATE.role = null; STATE.user = null;
    $('#app').style.display = 'none';
    $('#login').style.display = 'flex';
  },

  render() {
    if (!STATE.role) return;
    $('#clock').textContent = fmtTime(STATE.now);
    const m = $('#main'); m.innerHTML = '';
    if (STATE.role === 'driver') views.driver(m);
    else if (STATE.role === 'operator') views.operator(m);
    else views.admin(m);
  },

  setTab(role, t) { this.tab[role] = t; this.render(); },
  toggleSim() { STATE.running = !STATE.running; this.render(); },

  /* modal helpers */
  modal(html) { $('#modalCard').innerHTML = html; $('#modal').style.display = 'flex'; },
  closeModal() { $('#modal').style.display = 'none'; },

  /* ---- Driver actions ---- */
  driverEnter() {
    const r = services.entry({ plate: DEMO_DRIVER.vehicle.plate, type: DEMO_DRIVER.vehicle.type, tier: DEMO_DRIVER.tier, rfid: DEMO_DRIVER.vehicle.rfid, member: true, name: DEMO_DRIVER.name });
    if (!r.ok) { this.modal(`<h3>Entry refused</h3><p class="muted">The lot is full for ${DEMO_DRIVER.vehicle.type}. Try another zone.</p><button class="btn" onclick="app.closeModal()">OK</button>`); return; }
    r.session.hcmutId = DEMO_DRIVER.hcmutId;
    this._mySession = r.session.id;
    this.render();
  },
  driverExit() {
    const id = this._mySession;
    if (!id || !STATE.sessions[id] || STATE.sessions[id].state !== 'ACTIVE') { this.modal('<h3>No open session</h3><p class="muted">You are not parked right now. Use the entry button first.</p><button class="btn" onclick="app.closeModal()">OK</button>'); return; }
    const sess = STATE.sessions[id];
    const { durMin, amount, policy } = services.computeFee(sess);
    this.modal(`
      <h3>Exit and pay</h3>
      <div class="kv"><span class="k">Plate</span><span>${sess.entryPlate} <span class="match-ok">matches entry</span></span></div>
      <div class="kv"><span class="k">Time</span><span>${durMin} min</span></div>
      <div class="kv"><span class="k">Vehicle, type</span><span>${sess.type}, ${sess.tier}${policy.discount ? ' (-' + (policy.discount * 100) + '%)' : ''}</span></div>
      <div class="kv"><span class="k">Rule</span><span>${policy.name}</span></div>
      <div class="kv"><span class="k">Fee</span><span style="font-weight:700">${fmtVND(amount)}</span></div>
      <div class="pay-opts">
        <label class="pay-opt"><input type="radio" name="pm" value="WALLET" checked> Balance (${fmtVND(STATE.wallet)})</label>
        <label class="pay-opt"><input type="radio" name="pm" value="BKPAY"> BKPay <span class="muted">(stubbed)</span></label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn ghost" onclick="app.closeModal()">Cancel</button>
        <button class="btn" onclick="app.confirmExit(${id})">Confirm & Exit</button>
      </div>`);
  },
  confirmExit(id) {
    const method = ($('input[name=pm]:checked') || {}).value || 'WALLET';
    const r = services.exit(id, { method });
    this.closeModal();
    if (!r.ok && r.reason === 'INSUFFICIENT') { this.modal('<h3>Insufficient balance</h3><p class="muted">Top up your wallet or choose BKPay.</p><button class="btn" onclick="app.closeModal()">OK</button>'); return; }
    this._mySession = null;
    this.render();
  },
  topup() { STATE.wallet += 50000; services.audit(STATE.user.name, 'Topped up balance by 50,000 đ', 'pay'); this.render(); },

  /* ---- Operator actions ---- */
  inspectAlarm(id) {
    const a = STATE.alarms.find(a => a.id === id); if (!a) return;
    const sess = STATE.sessions[a.sessId];
    this.modal(`
      <h3>${a.type.replace('_', ' ')}</h3>
      <p class="muted">${a.detail}</p>
      ${sess ? `<div class="kv"><span class="k">Entry plate</span><span>${sess.entryPlate}</span></div>
      <div class="kv"><span class="k">Exit plate</span><span class="match-bad">${sess.exitPlate}</span></div>
      <div class="kv"><span class="k">Zone / slot</span><span>${sess.zone} / ${sess.slot}</span></div>
      <div class="kv"><span class="k">State</span><span>${sess.state}</span></div>` : ''}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn warn" onclick="app.resolveHold(${a.sessId},${a.id})">Sort out and release</button>
        <button class="btn ghost" onclick="app.ack(${a.id})">Acknowledge</button>
      </div>`);
  },
  resolveHold(sessId, alarmId) {
    const sess = STATE.sessions[sessId];
    if (sess && sess.state === 'HELD') {
      const { amount } = services.computeFee(sess);
      services.pay(sess, amount, 'CASH');
      sess.state = 'COMPLETED'; sess.exitSec = STATE.simSec;
      const slot = sim.currentSlots().find(s => s.id === sess.slot) ||
        Object.values(STATE.campuses).flatMap(c => c.zones).flatMap(z => z.slots).find(s => s.id === sess.slot);
      if (slot) { slot.state = 'FREE'; slot.sessionId = null; }
      STATE.stats.exits++; STATE.stats.revenue += amount;
      services.audit(STATE.user.name, `Sorted out held session ${sessId}, closed with cash`, 'info');
    }
    services.ackAlarm(alarmId); this.closeModal(); this.render();
  },
  ack(id) { services.ackAlarm(id); this.closeModal(); this.render(); },
  issueVisitor() {
    const r = services.entry({ plate: genPlate(), type: 'MOTORBIKE', tier: 'visitor', member: false, name: 'Visitor' });
    if (r.ok) services.audit(STATE.user.name, `Issued visitor ticket ${r.session.ticket}`, 'info');
    this.render();
  },
  lookupPlate() {
    const q = ($('#plateSearch') || {}).value || '';
    const found = Object.values(STATE.sessions).filter(s => s.state === 'ACTIVE' && s.plate.includes(q.trim()));
    this.modal(`<h3>Vehicle lookup</h3><p class="muted">"${q}", ${found.length} match(es)</p>
      ${found.slice(0, 8).map(s => `<div class="kv"><span class="k">${s.plate}</span><span>Zone ${s.zone}, ${s.slot}, parked ${(STATE.simSec - s.entrySec) * 3}min</span></div>`).join('') || '<p class="muted">Nothing found.</p>'}
      <button class="btn" style="margin-top:12px" onclick="app.closeModal()">Close</button>`);
  },

  /* ---- Admin actions ---- */
  saveThresholds() {
    CONFIG.greenBelow = +$('#thGreen').value;
    CONFIG.yellowBelow = +$('#thYellow').value;
    services.audit(STATE.user.name, `Changed sign thresholds: green below ${CONFIG.greenBelow}%, nearly full at ${CONFIG.yellowBelow}%`, 'info');
    this.render();
  },
  toggleSlotOOS() {
    const z = services.currentZones()[0];
    const s = z.slots.find(s => s.state === 'FREE');
    if (s) { s.state = 'OOS'; services.audit(STATE.user.name, `Set slot ${s.id} OUT_OF_SERVICE`, 'info'); }
    this.render();
  }
};

/* -------- shared render bits -------- */
function tilesHtml(tiles) {
  return `<div class="summary">${tiles.map(t => `<div class="s${t.alarm ? ' alarm' : ''}"><div class="n">${t.v}</div><div class="l">${t.k}</div></div>`).join('')}</div>`;
}
function zoneRowsHtml() {
  const rows = services.currentZones().map(z => {
    const free = services.zoneFree(z), pct = services.zoneOccPct(z), st = services.signState(pct);
    return `<tr><td>Zone ${z.name}</td><td>${free} / ${z.cap}</td><td>${pct}%</td>
      <td><span class="st ${services.stClass(st)}"><span class="d"></span>${services.signLabel(st)}</span></td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Zone</th><th>Free</th><th>Full</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function slotGridHtml(zone) {
  return `<div class="slotgrid">${zone.slots.map(s => {
    const cls = s.state.toLowerCase() === 'oos' ? 'oos' : s.state.toLowerCase();
    const g = { FREE: '', OCCUPIED: '', RESERVED: 'R', UNKNOWN: '?', OOS: 'x' }[s.state] || '';
    return `<div class="slot ${cls}" title="${s.id} ${s.state}">${g}</div>`;
  }).join('')}</div>`;
}
function feedHtml(limit = 40) {
  return `<div class="feed">${STATE.events.slice(0, limit).map(e =>
    `<div class="ev"><span class="ts">${fmtTime(e.ts)}</span><span class="tag ${e.tag}">${e.tag.toUpperCase()}</span><span class="msg">${e.msg}</span></div>`
  ).join('') || '<p class="muted">Nothing yet.</p>'}</div>`;
}
function simCtlHtml() {
  return `<div class="sim-ctl"><span class="muted" style="font-size:12px">Simulation ${STATE.running ? 'running' : 'paused'}</span>
    <button class="btn ghost sm" onclick="app.toggleSim()" style="color:var(--ink);border-color:var(--line2)">${STATE.running ? 'Pause' : 'Resume'}</button>
  </div>`;
}

// the screens, one function per role
const views = {
  // driver
  driver(root) {
    const tabs = [['avail', 'Availability'], ['wallet', 'Wallet and history']];
    root.appendChild(el('div', 'tabs', tabs.map(([k, l]) => `<button class="tab ${app.tab.driver === k ? 'active' : ''}" onclick="app.setTab('driver','${k}')">${l}</button>`).join('')));

    if (app.tab.driver === 'avail') {
      const my = app._mySession && STATE.sessions[app._mySession] && STATE.sessions[app._mySession].state === 'ACTIVE' ? STATE.sessions[app._mySession] : null;
      const grid = el('div', 'grid cols-2');
      // left: zones + slot grid
      const left = el('div', 'card');
      left.innerHTML = `<h2>Live availability <span class="hint">updated a moment ago</span></h2>${zoneRowsHtml()}
        <div class="section-title" style="margin-top:14px">Zone A slots</div>${slotGridHtml(services.currentZones()[0])}
        <p class="legend">green = free, grey = taken, ? = unknown (sensor quiet)</p>`;
      grid.appendChild(left);
      // right: my session + entrance signage
      const right = el('div');
      const z0 = services.currentZones()[0], pct0 = services.zoneOccPct(z0), st0 = services.signState(pct0);
      right.innerHTML = `
        <div class="card" style="margin-bottom:16px">
          <h2>Entrance sign</h2>
          <p>${STATE.campuses[STATE.campus].label} parking: <b>${services.totalFree()} spaces free</b> (${services.signLabel(st0)}).</p>
        </div>
        <div class="card">
          <h2>My parking</h2>
          ${my ? `<div class="kv"><span class="k">Plate</span><span>${my.plate}</span></div>
            <div class="kv"><span class="k">Zone / Slot</span><span>${my.zone} / ${my.slot}</span></div>
            <div class="kv"><span class="k">Parked for</span><span>${(STATE.simSec - my.entrySec) * 3} min</span></div>
            <div class="kv"><span class="k">Est. fee now</span><span>${fmtVND(services.computeFee(my).amount)}</span></div>
            <button class="btn" style="margin-top:12px;width:100%" onclick="app.driverExit()">Exit and pay</button>`
          : `<p class="muted">Not currently parked.</p>
            <button class="btn" style="margin-top:6px;width:100%" onclick="app.driverEnter()">Simulate my entry (${DEMO_DRIVER.vehicle.plate})</button>`}
        </div>`;
      grid.appendChild(right);
      root.appendChild(grid);
      const ctl = el('div', '', simCtlHtml()); ctl.style.marginTop = '4px';
      root.appendChild(ctl);
    } else {
      const g = el('div', 'grid cols-2');
      g.innerHTML = `
        <div class="card"><h2>Wallet</h2>
          <p>Balance: <b>${fmtVND(STATE.wallet)}</b></p>
          <button class="btn" onclick="app.topup()">Top up 50,000 đ</button>
          <div class="disclaimer">The top-up is stubbed here. A real parking payment through BKPay is future work.</div>
        </div>
        <div class="card"><h2>My history</h2>
          <table><thead><tr><th>Plate</th><th>Zone</th><th>Time</th><th>Fee</th><th>Status</th></tr></thead><tbody>
          ${STATE.driverHistory.slice(0, 8).map(s => `<tr><td>${s.plate}</td><td>${s.zone}</td><td>${s.billing ? s.billing.durMin + 'm' : '-'}</td><td>${s.billing ? fmtVND(s.billing.amount) : '-'}</td><td>${s.state}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing yet.</td></tr>'}
          </tbody></table>
        </div>`;
      root.appendChild(g);
    }
  },

  // operator
  operator(root) {
    const tabs = [['board', 'Live board'], ['feed', 'Event log']];
    root.appendChild(el('div', 'tabs', tabs.map(([k, l]) => `<button class="tab ${app.tab.operator === k ? 'active' : ''}" onclick="app.setTab('operator','${k}')">${l}</button>`).join('')));

    const activeCount = Object.values(STATE.sessions).filter(s => s.state === 'ACTIVE').length;
    const visitors = Object.values(STATE.sessions).filter(s => s.state === 'ACTIVE' && !s.member).length;
    root.appendChild(el('div', 'card', tilesHtml([
      { k: 'Free / total', v: `${services.totalFree()}<small>/${services.totalCap()}</small>` },
      { k: 'Open sessions', v: activeCount },
      { k: 'Visitors in lot', v: visitors },
      { k: 'Open alarms', v: STATE.alarms.length, alarm: STATE.alarms.length > 0 }
    ])));

    if (app.tab.operator === 'board') {
      const g = el('div', 'grid cols-2');
      const left = el('div', 'card');
      left.innerHTML = `<h2>Occupancy</h2>${zoneRowsHtml()}
        <div class="section-title" style="margin-top:14px">Find vehicle by plate</div>
        <div style="display:flex;gap:8px"><input id="plateSearch" placeholder="e.g. 59-" style="flex:1"><button class="btn" onclick="app.lookupPlate()">Search</button></div>
        <div style="display:flex;gap:8px;margin-top:12px"><button class="btn ghost" onclick="app.issueVisitor()">Issue visitor ticket</button></div>
        <div style="margin-top:12px">${simCtlHtml()}</div>`;
      g.appendChild(left);
      const right = el('div', 'card');
      right.innerHTML = `<h2>Alarms (${STATE.alarms.length})</h2>
        ${STATE.alarms.length ? `<table><thead><tr><th>Type</th><th>Detail</th><th>Time</th><th></th></tr></thead><tbody>
        ${STATE.alarms.map(a => `<tr><td>${a.type.replace('_', ' ')}</td><td>${a.detail}</td><td>${fmtTime(a.at)}</td><td><button class="btn sm" onclick="app.inspectAlarm(${a.id})">Inspect</button></td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">No open alarms.</p>'}`;
      g.appendChild(right);
      root.appendChild(g);
    } else {
      root.appendChild(el('div', 'card', `<h2>Event log</h2>${feedHtml(60)}`));
    }
  },

  // admin
  admin(root) {
    const tabs = [['tariff', 'Fees and signs'], ['zones', 'Zones and sensors'], ['reports', 'Reports'], ['audit', 'Log']];
    root.appendChild(el('div', 'tabs', tabs.map(([k, l]) => `<button class="tab ${app.tab.admin === k ? 'active' : ''}" onclick="app.setTab('admin','${k}')">${l}</button>`).join('')));

    if (app.tab.admin === 'tariff') {
      const c = el('div', 'card');
      c.innerHTML = `<h2>Price rules</h2>
        <table><thead><tr><th>Name</th><th>Vehicle</th><th>Type</th><th>Rate</th><th>Free</th><th>Cap</th><th>From</th></tr></thead><tbody>
        ${POLICIES.map(p => `<tr><td>${p.name}</td><td>${p.vehicle}</td><td>${p.tier}</td>
          <td>${p.flat ? 'flat ' + fmtVND(p.flat) : p.ratePerDay ? fmtVND(p.ratePerDay) + '/day' : fmtVND(p.ratePerHour) + '/h'}${p.discount ? ' (-' + p.discount * 100 + '%)' : ''}</td>
          <td>${p.freeMin}m</td><td>${p.cap ? fmtVND(p.cap) : '-'}</td><td>${p.validFrom}</td></tr>`).join('')}
        </tbody></table>
        <div class="section-title" style="margin-top:16px">Sign thresholds</div>
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
          <div><label>green below (%)</label><input id="thGreen" type="number" value="${CONFIG.greenBelow}" style="width:90px"></div>
          <div><label>nearly full at (%)</label><input id="thYellow" type="number" value="${CONFIG.yellowBelow}" style="width:120px"></div>
          <button class="btn" onclick="app.saveThresholds()">Save</button>
        </div>
        <div class="disclaimer">The thresholds are settings, not fixed in code. Full is 100%.</div>`;
      root.appendChild(c);
    } else if (app.tab.admin === 'zones') {
      root.appendChild(el('div', 'card', tilesHtml([
        { k: 'Zones', v: services.currentZones().length },
        { k: 'Total slots', v: services.totalCap() },
        { k: 'Unknown', v: sim.currentSlots().filter(s => s.state === 'UNKNOWN').length },
        { k: 'Out of service', v: sim.currentSlots().filter(s => s.state === 'OOS').length }
      ])));
      services.currentZones().forEach(z => {
        const st = services.signState(services.zoneOccPct(z));
        const card = el('div', 'card');
        card.style.marginTop = '14px';
        card.innerHTML = `<h2>Zone ${z.name} <span class="hint">${z.vehicle}, ${z.cap} slots &middot; <span class="st ${services.stClass(st)}"><span class="d"></span>${services.signLabel(st)}</span></span></h2>${slotGridHtml(z)}`;
        root.appendChild(card);
      });
      root.appendChild(el('div', 'card', `<div style="display:flex;gap:8px"><button class="btn ghost" onclick="app.toggleSlotOOS()">Set a free Zone A slot out of service</button></div><div class="disclaimer">In the demo, sensors go quiet at random. That slot then shows as unknown and is not counted as free.</div>`));
    } else if (app.tab.admin === 'reports') {
      const g = el('div', 'grid cols-2');
      g.innerHTML = `
        <div class="card"><h2>Operations</h2>${tilesHtml([
          { k: 'Entries', v: STATE.stats.entries },
          { k: 'Exits', v: STATE.stats.exits },
          { k: 'Refused (full)', v: STATE.stats.denied },
          { k: 'Theft alarms', v: STATE.stats.mismatch, alarm: STATE.stats.mismatch > 0 }
        ])}
        <p style="margin-top:10px">Money collected: <b>${fmtVND(STATE.stats.revenue)}</b></p></div>
        <div class="card"><h2>Payment check</h2>
          ${STATE.reconBreaks.length ? `<p class="muted">${STATE.reconBreaks.length} payment(s) the bank did not confirm:</p>
          <table><thead><tr><th>Ref</th><th>Amount</th><th>Note</th></tr></thead><tbody>
          ${STATE.reconBreaks.slice(0, 8).map(r => `<tr><td>${r.txn}</td><td>${fmtVND(r.amount)}</td><td>${r.reason}</td></tr>`).join('')}
          </tbody></table>` : '<p class="muted">Everything the system recorded matched the bank report.</p>'}
          <div class="disclaimer">The daily check compares each recorded payment with the bank report and flags any that do not match. Some demo payments drop their confirmation on purpose so this has something to show.</div>
        </div>`;
      root.appendChild(g);
    } else {
      root.appendChild(el('div', 'card', `<h2>Log</h2>${feedHtml(80)}`));
    }
  }
};

// run the simulation a bit before login so the lot starts partly full
(function seed() {
  for (let i = 0; i < 220; i++) sim.tick();
})();
STATE.alarms = STATE.alarms.slice(0, 3);
STATE.now = new Date(2024, 8, 16, 7, 25, 0);
STATE.running = true;

setInterval(() => sim.tick(), 1500);
setInterval(() => { if (STATE.role) $('#clock').textContent = fmtTime(STATE.now); }, 500);

// Optional auto-login for demos / screenshots:  index.html?role=operator
(function autoLogin() {
  const r = new URLSearchParams(location.search).get('role');
  if (r && ['driver', 'operator', 'admin'].includes(r)) app.login(r);
})();
