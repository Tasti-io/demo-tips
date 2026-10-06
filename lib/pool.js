/**
 * A week of tips, pooled, by rules a person can read. All arithmetic, no model.
 *
 * The order is the whole design:
 *
 *   1. detect()      find what a person has to decide before any money moves
 *   2. resolve()     apply what they decided; anything undecided is HELD, visibly,
 *                    and never quietly folded into anyone's share
 *   3. distribute()  split each pool by the policy, to the exact cent
 *   4. approve       a manager signs off one room at a time, against a fingerprint
 *                    of the numbers they saw; change anything and the sign-off lapses
 *   5. export        only when every room is signed off on current numbers
 *
 * Two British Columbia rules are built in rather than offered as settings
 * (Employment Standards Act s.30.3 and s.30.4, and the Branch's interpretation):
 * nothing may be deducted from tips, card processing fees included; and a director
 * or shareholder of a corporate employer shares in a pool only if they regularly
 * perform, to a substantial degree, the same work as those who share in it. The
 * first is a locked setting. The second is a decision a person makes, on the
 * record, the week it comes up. Everything else (who shares, in what proportion)
 * the Act leaves to the employer, so it is policy, and the page lets you change it.
 *
 * This is a demo of the mechanics, not legal advice.
 */
import { createHash } from "node:crypto";
import { STAFF, ROLES, SITES, person, LEGAL_NAME } from "./harbour/index.js";
import { BLOCKS, OPEN, fmtTime } from "./fixtures.js";

/* ------------------------------------------------------------------ policy */

export const DEFAULT_POLICY = {
  period: "shift",          // shift (half day) | day | week
  kitchenPct: 25,           // share of each pool that goes to the kitchen
  managersShare: false,     // salaried managers in the pool or not
  points: { server: 1, bartender: 1, barista: 1, host: 0.6, runner: 0.8, "sous-chef": 1.2, cook: 1, prep: 0.8, dish: 0.7, manager: 1 },
  deductCardFees: false,    // locked: not allowed in BC
};

export const LIMITS = { kitchenPct: [0, 50], points: [0, 3] };

/** Validate a policy from the page. Unknown keys are dropped; illegal ones are refused by name. */
export function checkPolicy(raw) {
  const r = raw ?? {};
  const p = structuredClone(DEFAULT_POLICY);
  const notes = [];
  if (r.period != null) {
    if (!["shift", "day", "week"].includes(r.period)) return { error: "pool period must be shift, day or week" };
    p.period = r.period;
  }
  if (r.kitchenPct != null) {
    const k = Number(r.kitchenPct);
    if (!Number.isFinite(k) || k < LIMITS.kitchenPct[0] || k > LIMITS.kitchenPct[1]) return { error: "kitchen share between 0% and 50%" };
    p.kitchenPct = k;
  }
  if (r.managersShare != null) p.managersShare = Boolean(r.managersShare);
  if (r.points && typeof r.points === "object") {
    for (const [role, v] of Object.entries(r.points)) {
      if (!(role in p.points)) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < LIMITS.points[0] || n > LIMITS.points[1]) return { error: `points for ${role} between 0 and 3` };
      p.points[role] = n;
    }
  }
  if (r.deductCardFees) notes.push("Card processing fees cannot be deducted from tips in British Columbia, so that setting stays off.");
  p.deductCardFees = false;
  return { policy: p, notes };
}

/* -------------------------------------------------------------- exceptions */

const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
const dayIndex = (week, date) => week.days.indexOf(date);
const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", timeZone: "UTC" });
const siteName = (id) => SITES.find((s) => s.id === id)?.name ?? id;

/**
 * Everything a person has to decide before the week can be paid. Found from the
 * data, not from a list of planted answers: an open punch, two punches at once,
 * tips outside any shift, a director on the clock, a close with no cash declared.
 */
export function detect(data) {
  const out = [];
  const { punches, tips, batches, week } = data;

  for (const p of punches.filter((x) => x.out == null)) {
    const who = person(p.personId);
    out.push({
      id: `open:${p.id}`, kind: "open-punch", site: p.site, date: p.date, personId: p.personId,
      title: `${who.name} never clocked out`,
      detail: `${dayName(p.date)} at ${siteName(p.site)}: in at ${fmtTime(p.in)}, no out. The rota had ${who.name.split(" ")[0]} finishing at ${fmtTime(p.scheduledEnd)}.`,
      options: [
        { value: "scheduled", label: `Use the rota: out at ${fmtTime(p.scheduledEnd)}` },
        { value: "time", label: "Enter the real time", input: "time" },
      ],
      suggested: "scheduled",
      touches: [p.id],
      inAt: p.in,
    });
  }

  for (let i = 0; i < punches.length; i += 1) {
    for (let j = i + 1; j < punches.length; j += 1) {
      const a = punches[i]; const b = punches[j];
      if (a.personId !== b.personId || a.date !== b.date || a.out == null || b.out == null) continue;
      const o = overlap(a.in, a.out, b.in, b.out);
      if (!o) continue;
      const [first, second] = a.in <= b.in ? [a, b] : [b, a];
      const who = person(a.personId);
      out.push({
        id: `overlap:${first.id}:${second.id}`, kind: "overlap", site: second.site, sites: [...new Set([first.site, second.site])], date: a.date, personId: a.personId,
        title: `${who.name} was on the clock in two rooms at once`,
        detail: `${dayName(a.date)}: ${siteName(first.site)} ${fmtTime(first.in)} to ${fmtTime(first.out)}, and ${siteName(second.site)} from ${fmtTime(second.in)}. That is ${o} minutes counted twice, so two pools would each pay for them.`,
        options: [
          { value: "first-ends", label: `${siteName(first.site)} ended at ${fmtTime(second.in)}` },
          { value: "second-starts", label: `${siteName(second.site)} started at ${fmtTime(first.out)}` },
        ],
        suggested: "first-ends",
        touches: [first.id, second.id],
        first: first.id, second: second.id,
      });
    }
  }

  for (const b of batches) {
    const [open, close] = OPEN[dayIndex(week, b.date)];
    if (b.at >= open && b.at < close) continue;
    const prev = week.days[dayIndex(week, b.date) - 1];
    out.push({
      id: `batch:${b.id}`, kind: "stray-batch", site: b.site, date: b.date,
      title: `${(b.cardCents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" })} in card tips arrived outside any shift`,
      detail: `Terminal ${b.terminal} at ${siteName(b.site)} settled a batch at ${fmtTime(b.at)} on ${dayName(b.date)}, before the room opened and before anyone clocked in. A batch that settles late belongs to the shift that took the payments.`,
      options: [
        ...(prev ? [{ value: "prev-pm", label: `It is ${dayName(prev)} afternoon's, settled late` }] : []),
        { value: "same-am", label: `It belongs to ${dayName(b.date)} morning` },
      ],
      suggested: prev ? "prev-pm" : "same-am",
      batch: b.id,
    });
  }

  for (const p of punches) {
    const who = person(p.personId);
    if (who.kind !== "director") continue;
    out.push({
      id: `director:${p.id}`, kind: "director", site: p.site, date: p.date, personId: p.personId,
      title: `${who.name}, a director of the company, worked a ${ROLES[p.role].label.toLowerCase()} shift`,
      detail: `${dayName(p.date)} at ${siteName(p.site)}, ${fmtTime(p.in)} to ${fmtTime(p.out)}. ${LEGAL_NAME} is a corporation, so under the Employment Standards Act a director may share in the pool only if he regularly performs, to a substantial degree, the same work as the staff who share in it. One shift does not answer that; his usual week does.`,
      options: [
        { value: "exclude", label: "Leave him out of the pool" },
        { value: "include", label: "He regularly does this work to a substantial degree; include him" },
      ],
      suggested: "exclude",
      touches: [p.id],
      law: "s.30.4",
    });
  }

  for (const t of tips.filter((x) => x.cashCents == null)) {
    out.push({
      id: `cash:${t.id}`, kind: "no-cash", site: t.site, date: t.date,
      title: "Nobody declared the cash tips at close",
      detail: `${siteName(t.site)}, ${dayName(t.date)} ${t.block === "AM" ? "morning" : "afternoon and evening"}: the POS has ${(t.cardCents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" })} in card tips; the cash line is blank, not zero. Blank is not a number, so this pool waits.`,
      options: [
        { value: "zero", label: "There was no cash: $0" },
        { value: "amount", label: "Enter what was in the jar", input: "money" },
      ],
      suggested: null,
      tip: t.id,
    });
  }

  // Every exception names each room whose pool it holds, so a room never waits on
  // something its own manager cannot see.
  for (const e of out) e.sites ??= [e.site];
  return out;
}

/** Check decisions from the page against the exceptions that exist. */
export function checkResolutions(raw, exceptions) {
  const res = {};
  if (raw == null) return { resolutions: res };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "decisions must be an object" };
  for (const [id, v] of Object.entries(raw)) {
    const ex = exceptions.find((e) => e.id === id);
    if (!ex) continue; // a decision about something that is not there any more
    const opt = ex.options.find((o) => o.value === v?.value);
    if (!opt) return { error: `unknown choice for ${id}` };
    if (opt.input === "time") {
      const m = Number(v.minutes);
      const p = ex.touches[0];
      if (!Number.isInteger(m) || m < 0 || m > 24 * 60) return { error: "a clock-out time on that day" };
      res[id] = { value: v.value, minutes: m, punch: p };
    } else if (opt.input === "money") {
      const c = Number(v.cents);
      if (!Number.isInteger(c) || c < 0 || c > 200_000) return { error: "cash between $0 and $2,000" };
      res[id] = { value: v.value, cents: c };
    } else {
      res[id] = { value: v.value };
    }
  }
  return { resolutions: res };
}

/* ------------------------------------------------------------- resolution */

/**
 * Apply decisions. Returns effective punches and tips, plus what stays HELD
 * because nobody has decided yet: whole pools, never parts of them, because a
 * pool with one person's hours unknown cannot be split fairly for anyone else.
 */
export function resolve(data, exceptions, resolutions) {
  const punches = data.punches.map((p) => ({ ...p }));
  const tips = data.tips.map((t) => ({ ...t }));
  const byId = new Map(punches.map((p) => [p.id, p]));
  const holds = []; // { site, date, block|null, reason, exceptionId }
  const strayTips = [];

  for (const ex of exceptions) {
    const r = resolutions[ex.id];
    if (ex.kind === "open-punch") {
      const p = byId.get(ex.touches[0]);
      if (!r) { holds.push({ site: p.site, date: p.date, from: p.in, to: hm24, reason: ex.title, exceptionId: ex.id }); p.excluded = true; continue; }
      p.out = r.value === "scheduled" ? p.scheduledEnd : r.minutes;
      if (p.out <= p.in) p.out = p.in; // an out before the in is zero hours, not negative ones
    }
    if (ex.kind === "overlap") {
      const a = byId.get(ex.first); const b = byId.get(ex.second);
      if (!r) {
        holds.push({ site: a.site, date: a.date, from: a.in, to: a.out, reason: ex.title, exceptionId: ex.id });
        holds.push({ site: b.site, date: b.date, from: b.in, to: b.out, reason: ex.title, exceptionId: ex.id });
        a.excluded = true; b.excluded = true;
        continue;
      }
      if (r.value === "first-ends") a.out = b.in; else b.in = a.out;
    }
    if (ex.kind === "director") {
      const p = byId.get(ex.touches[0]);
      if (!r) { holds.push({ site: p.site, date: p.date, from: p.in, to: p.out, reason: ex.title, exceptionId: ex.id }); p.excluded = true; continue; }
      p.directorIncluded = r.value === "include";
    }
    if (ex.kind === "no-cash") {
      const t = tips.find((x) => x.id === ex.tip);
      if (!r) { const b = BLOCKS.find((x) => x.id === t.block); holds.push({ site: t.site, date: t.date, from: b.from, to: b.to, reason: ex.title, exceptionId: ex.id }); continue; }
      t.cashCents = r.value === "zero" ? 0 : r.cents;
    }
    if (ex.kind === "stray-batch") {
      const batch = data.batches.find((b) => b.id === ex.batch);
      if (!r) { strayTips.push({ ...batch, exceptionId: ex.id }); continue; }
      const date = r.value === "prev-pm" ? data.week.days[data.week.days.indexOf(batch.date) - 1] : batch.date;
      const block = r.value === "prev-pm" ? "PM" : "AM";
      tips.find((t) => t.id === `${batch.site}:${date}:${block}`).cardCents += batch.cardCents;
    }
  }
  return { punches, tips, holds, strayTips };
}
const hm24 = 24 * 60;

/* ------------------------------------------------------------ distribution */

/** Who is in the pool, on which side, at what weight per hour. */
export function eligibility(p, policy) {
  const who = person(p.personId);
  if (who.kind === "director") return p.directorIncluded ? { side: ROLES[p.role].side, points: policy.points[p.role] ?? 1 } : { reason: "director, not included" };
  if (who.pay === "salary") return policy.managersShare ? { side: "foh", points: policy.points.manager } : { reason: "salaried manager, not in the pool by policy" };
  const side = ROLES[p.role].side;
  return { side, points: policy.points[p.role] ?? 0 };
}

/** The pools for a site under a period, each with its time windows and its tips. */
function pools(site, eff, data, period) {
  const units = new Map();
  for (const t of eff.tips.filter((x) => x.site === site)) {
    const key = period === "shift" ? t.id : period === "day" ? `${site}:${t.date}` : `${site}:week`;
    if (!units.has(key)) units.set(key, { key, site, windows: [], tipIds: [], cents: 0, label: "" });
    const u = units.get(key);
    const b = BLOCKS.find((x) => x.id === t.block);
    u.windows.push({ date: t.date, from: b.from, to: b.to });
    u.tipIds.push(t.id);
    u.cents += t.cardCents + (t.cashCents ?? 0);
    u.label = period === "shift" ? `${dayName(t.date).slice(0, 3)} ${t.block === "AM" ? "morning" : "evening"}` : period === "day" ? dayName(t.date) : "The week";
    u.date = period === "week" ? null : t.date;
  }
  return [...units.values()];
}

const heldUnit = (u, holds) => holds.find((h) => h.site === u.site && u.windows.some((w) => w.date === h.date && overlap(w.from, w.to, h.from, h.to) > 0));

export function distribute(data, eff, policy) {
  const sites = [];
  for (const site of SITES) {
    const units = pools(site.id, eff, data, policy.period);
    const people = new Map(); // personId -> row
    const heldPools = [];
    let poolCents = 0;
    let heldCents = 0;

    for (const u of units) {
      poolCents += u.cents;
      const hold = heldUnit(u, eff.holds);
      if (hold) { heldCents += u.cents; heldPools.push({ label: u.label, cents: u.cents, reason: hold.reason, exceptionId: hold.exceptionId }); continue; }

      // Minutes each eligible person worked inside this pool's windows.
      const weights = { foh: new Map(), boh: new Map() };
      const minutesBy = new Map();
      for (const p of eff.punches.filter((x) => x.site === site.id && !x.excluded && x.out != null)) {
        const mins = u.windows.filter((w) => w.date === p.date).reduce((a, w) => a + overlap(p.in, p.out, w.from, w.to), 0);
        if (!mins) continue;
        const e = eligibility(p, policy);
        if (!e.side || !e.points) continue;
        const side = e.side === "mgmt" ? "foh" : e.side;
        const w = (mins / 60) * e.points;
        weights[side].set(p.personId, (weights[side].get(p.personId) ?? 0) + w);
        minutesBy.set(`${p.personId}:${side}`, (minutesBy.get(`${p.personId}:${side}`) ?? 0) + mins);
        const row = people.get(p.personId) ?? { personId: p.personId, roles: new Set(), minutes: 0, exactCents: 0, lines: [] };
        row.roles.add(p.role);
        row.minutes += mins;
        people.set(p.personId, row);
      }
      const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
      const fohW = total(weights.foh); const bohW = total(weights.boh);
      if (!fohW && !bohW) { heldCents += u.cents; heldPools.push({ label: u.label, cents: u.cents, reason: "tips with nobody eligible on the clock" }); continue; }

      // The kitchen's share; if one side had nobody, the whole pool goes to the other.
      let bohCents = u.cents * policy.kitchenPct / 100;
      if (!bohW) bohCents = 0;
      if (!fohW) bohCents = u.cents;
      const sideCents = { foh: u.cents - bohCents, boh: bohCents };
      const sideW = { foh: fohW, boh: bohW };
      for (const side of ["foh", "boh"]) {
        for (const [pid, w] of weights[side]) {
          const exact = sideCents[side] * (w / sideW[side]);
          const row = people.get(pid);
          row.exactCents += exact;
          row.lines.push({
            pool: u.label, poolCents: u.cents, side, sideCents: sideCents[side],
            minutes: minutesBy.get(`${pid}:${side}`), weight: w, sideWeight: sideW[side], exactCents: exact,
            pointsPerHour: w / (minutesBy.get(`${pid}:${side}`) / 60),
            note: side === "foh" && !bohW && policy.kitchenPct > 0 ? "no kitchen on the clock, so the whole pool went to the floor" : side === "boh" && !fohW ? "nobody on the floor, so the whole pool went to the kitchen" : null,
          });
        }
      }
    }

    // Round to cents so the people add up to the pool exactly: floor everyone, then
    // hand the leftover cents to the largest remainders. Nobody's share is ever
    // nudged by more than a cent, and no cent is lost or invented.
    const rows = [...people.values()].filter((r) => r.exactCents > 0);
    const target = Math.round(rows.reduce((a, r) => a + r.exactCents, 0));
    for (const r of rows) r.cents = Math.floor(r.exactCents + 1e-9);
    let left = target - rows.reduce((a, r) => a + r.cents, 0);
    for (const r of [...rows].sort((a, b) => (b.exactCents - b.cents) - (a.exactCents - a.cents) || a.personId.localeCompare(b.personId))) {
      if (left <= 0) break;
      r.cents += 1; left -= 1;
    }

    const stray = eff.strayTips.filter((b) => b.site === site.id);
    const strayCents = stray.reduce((a, b) => a + b.cardCents, 0);
    const out = rows
      .map((r) => {
        const who = person(r.personId);
        return {
          personId: r.personId, name: who.name, home: who.site,
          roles: [...r.roles].map((x) => ROLES[x].label),
          minutes: r.minutes,
          cents: r.cents,
          exactCents: r.exactCents,
          perHourCents: r.minutes ? (r.cents / r.minutes) * 60 : 0,
          lines: r.lines,
        };
      })
      .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));

    const excludedPeople = [...new Set(eff.punches.filter((p) => p.site === site.id && !p.excluded && p.out != null)
      .filter((p) => !eligibility(p, policy).side).map((p) => p.personId))]
      .map((id) => ({ personId: id, name: person(id).name, reason: eligibility(eff.punches.find((p) => p.personId === id && p.site === site.id), policy).reason }));

    sites.push({
      site: site.id, name: site.name,
      tipsCents: poolCents + strayCents,
      cardCents: eff.tips.filter((t) => t.site === site.id).reduce((a, t) => a + t.cardCents, 0) + strayCents,
      cashCents: eff.tips.filter((t) => t.site === site.id).reduce((a, t) => a + (t.cashCents ?? 0), 0),
      distributedCents: out.reduce((a, r) => a + r.cents, 0),
      heldCents: heldCents + strayCents,
      heldPools: [...heldPools, ...stray.map((b) => ({ label: `batch ${b.id}`, cents: b.cardCents, reason: "card tips outside any shift", exceptionId: b.exceptionId }))],
      people: out,
      excluded: excludedPeople,
      minutes: out.reduce((a, r) => a + r.minutes, 0),
    });
  }
  return sites;
}

/** A short fingerprint of what a manager is signing: who gets what. */
export function fingerprint(site) {
  return createHash("sha256").update(JSON.stringify(site.people.map((p) => [p.personId, p.cents]))).update(String(site.heldCents)).digest("hex").slice(0, 12);
}

/* --------------------------------------------------------------- the week */

export function checkApprovals(raw) {
  const out = {};
  if (raw == null) return out;
  if (typeof raw !== "object") return out;
  for (const s of SITES) {
    const a = raw[s.id];
    if (a && typeof a.fingerprint === "string" && a.fingerprint.length <= 32) out[s.id] = { fingerprint: a.fingerprint, at: String(a.at ?? "").slice(0, 40) };
  }
  return out;
}

export function week(data, { policy = DEFAULT_POLICY, resolutions = {}, approvals = {} } = {}) {
  const exceptions = detect(data);
  const eff = resolve(data, exceptions, resolutions);
  const sites = distribute(data, eff, policy).map((s) => {
    const open = exceptions.filter((e) => e.sites.includes(s.site) && !resolutions[e.id]);
    const fp = fingerprint(s);
    const a = approvals[s.site];
    return {
      ...s,
      openExceptions: open.length,
      fingerprint: fp,
      canApprove: open.length === 0 && s.heldCents === 0,
      approval: a ? { ...a, current: a.fingerprint === fp } : null,
    };
  });
  const ready = sites.every((s) => s.approval?.current && s.canApprove);
  return {
    week: data.week,
    legalName: LEGAL_NAME,
    policy,
    exceptions: exceptions.map((e) => ({ ...e, decided: resolutions[e.id] ?? null })),
    sites,
    totals: {
      tipsCents: sites.reduce((a, s) => a + s.tipsCents, 0),
      distributedCents: sites.reduce((a, s) => a + s.distributedCents, 0),
      heldCents: sites.reduce((a, s) => a + s.heldCents, 0),
      people: new Set(sites.flatMap((s) => s.people.map((p) => p.personId))).size,
      openExceptions: exceptions.filter((e) => !resolutions[e.id]).length,
      approved: sites.filter((s) => s.approval?.current).length,
    },
    payroll: ready ? payroll(data, sites) : null,
  };
}

/**
 * The payroll file. One line per person per room, a tips earnings code, and no
 * vacation pay: the Branch's guidance is that employees are not entitled to
 * vacation pay on tips, so the code is set up as non-vacationable.
 */
function payroll(data, sites) {
  const header = ["employee_id", "name", "location", "earnings_code", "amount", "hours", "period_start", "period_end"];
  const lines = [];
  for (const s of sites) {
    for (const p of s.people) {
      lines.push([p.personId, p.name, s.name, "TIPS-NV", (p.cents / 100).toFixed(2), (p.minutes / 60).toFixed(2), data.week.from, data.week.to]);
    }
  }
  const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return {
    rows: lines.length,
    totalCents: sites.reduce((a, s) => a + s.distributedCents, 0),
    csv: [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\n") + "\n",
    filename: `harbour-tips-${data.week.from}-to-${data.week.to}.csv`,
  };
}

/** One person's week, for the page they can open on their phone. */
export function statement(w, personId) {
  const who = person(personId);
  if (!who) return null;
  const rooms = w.sites.map((s) => ({ site: s.site, name: s.name, row: s.people.find((p) => p.personId === personId) })).filter((x) => x.row);
  const excluded = w.sites.flatMap((s) => s.excluded.filter((e) => e.personId === personId).map((e) => ({ site: s.name, reason: e.reason })));
  return {
    personId, name: who.name, role: ROLES[who.role].label, home: SITES.find((s) => s.id === who.site).name,
    week: w.week, policy: w.policy,
    rooms,
    excluded,
    totalCents: rooms.reduce((a, r) => a + r.row.cents, 0),
    minutes: rooms.reduce((a, r) => a + r.row.minutes, 0),
    perHourCents: (() => { const m = rooms.reduce((a, r) => a + r.row.minutes, 0); return m ? (rooms.reduce((a, r) => a + r.row.cents, 0) / m) * 60 : 0; })(),
    held: w.sites.filter((s) => s.heldCents && rooms.some((r) => r.site === s.site)).map((s) => ({ site: s.name, cents: s.heldCents })),
    approved: rooms.every((r) => w.sites.find((s) => s.site === r.site).approval?.current),
  };
}

export const EVERYONE = STAFF.map((s) => ({ id: s.id, name: s.name, site: s.site, role: ROLES[s.role].label }));
