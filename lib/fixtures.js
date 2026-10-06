/**
 * One pay week at Harbour & Co: who was on the clock, and what the tills recorded
 * in tips. Invented and deterministic; the dates slide so it is always last week.
 *
 * Two sources, as on a real account:
 *
 *   punches  from the time clock: who, where, in what role, in and out
 *   tips     from the POS: card tips per half day, plus the cash a closer declared,
 *            and the odd terminal batch that settles at a strange hour
 *
 * The week is ordinary except for five things a manager meets most weeks, planted
 * in the data and found by ordinary detection code, not listed here as answers:
 *
 *   a server who never clocked out on Friday night
 *   a barista on the clock at two rooms at once on Wednesday
 *   a card batch that settled at 06:12 the next morning, outside any shift
 *   the owner, a company director, working a Saturday bar shift
 *   a Thursday close where nobody declared the cash tips
 *
 * Plus one quiet fact the rules have to handle without a fuss: the Oakridge counter
 * has one cook, who does not work every day, so some days its kitchen is empty.
 */
import { STAFF, ROLES, SITES } from "./harbour/index.js";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const hm = (h, m = 0) => h * 60 + m;
export const fmtTime = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** Opening hours, the same for every room (the Avo demo's venue page shows them). */
export const OPEN = [
  [hm(7), hm(17)], [hm(7), hm(17)], [hm(7), hm(17)], [hm(7), hm(17)], // Mon to Thu
  [hm(7), hm(21)], [hm(8), hm(21)], [hm(8), hm(16)],                  // Fri, Sat, Sun
];

/**
 * Tips are recorded per half day. AM runs to 14:00, PM from 14:00. Shifts straddle
 * the line, so a person's hours are split across the two by the clock.
 */
export const BLOCKS = [{ id: "AM", from: 0, to: hm(14) }, { id: "PM", from: hm(14), to: hm(24) }];

/** Slots per site: [role, start, end, count]. `wk` is Mon to Thu. */
const SLOTS = {
  harbour: {
    wk: [["manager", hm(9), hm(17, 30), 1], ["server", hm(6, 30), hm(14, 30), 2], ["host", hm(6, 45), hm(14, 30), 1], ["runner", hm(7), hm(14), 1], ["sous-chef", hm(6), hm(14, 30), 1], ["cook", hm(6, 30), hm(14, 30), 1], ["prep", hm(6), hm(13), 1], ["dish", hm(7), hm(15), 1],
         ["server", hm(11), hm(17, 30), 2], ["bartender", hm(12), hm(17, 30), 1], ["runner", hm(11, 30), hm(17, 30), 1], ["cook", hm(11), hm(17, 30), 1], ["dish", hm(12), hm(17, 30), 1]],
    fri: [["manager", hm(12), hm(21, 30), 1], ["server", hm(6, 30), hm(14, 30), 2], ["host", hm(6, 45), hm(14, 30), 1], ["runner", hm(7), hm(14), 1], ["sous-chef", hm(6), hm(14, 30), 1], ["cook", hm(6, 30), hm(14, 30), 1], ["prep", hm(6), hm(13), 1], ["dish", hm(7), hm(15), 1],
          ["server", hm(14), hm(21, 30), 4], ["bartender", hm(14), hm(21, 30), 2], ["host", hm(14), hm(21), 1], ["runner", hm(14), hm(21, 30), 2], ["cook", hm(13, 30), hm(21, 30), 2], ["dish", hm(14), hm(22), 1]],
    sat: [["manager", hm(12), hm(21, 30), 1], ["server", hm(7, 30), hm(14, 30), 2], ["host", hm(7, 45), hm(14, 30), 1], ["runner", hm(8), hm(14, 30), 1], ["sous-chef", hm(7), hm(14, 30), 1], ["cook", hm(7, 30), hm(14, 30), 1], ["prep", hm(7), hm(13), 1], ["dish", hm(8), hm(15), 1],
          ["server", hm(14), hm(21, 30), 4], ["bartender", hm(14), hm(21, 30), 1], ["host", hm(14), hm(21), 1], ["runner", hm(14), hm(21, 30), 2], ["cook", hm(13, 30), hm(21, 30), 2], ["dish", hm(14), hm(22), 1]],
    sun: [["server", hm(7, 30), hm(14, 30), 3], ["host", hm(7, 45), hm(14, 30), 1], ["runner", hm(8), hm(14, 30), 1], ["sous-chef", hm(7), hm(14, 30), 1], ["cook", hm(7, 30), hm(14, 30), 1], ["dish", hm(8), hm(15), 1],
          ["server", hm(12), hm(16, 30), 2], ["bartender", hm(12), hm(16, 30), 1], ["cook", hm(12), hm(16, 30), 1], ["dish", hm(12), hm(16, 30), 1]],
  },
  lonsdale: {
    wk: [["manager", hm(9), hm(17, 30), 1], ["barista", hm(6, 30), hm(13), 2], ["cook", hm(6, 30), hm(14), 1], ["barista", hm(11), hm(17, 30), 1], ["server", hm(11), hm(17, 30), 1], ["dish", hm(10), hm(17, 30), 1]],
    fri: [["manager", hm(12), hm(21, 30), 1], ["barista", hm(6, 30), hm(13), 2], ["cook", hm(6, 30), hm(14), 1], ["barista", hm(13), hm(21, 30), 1], ["server", hm(14), hm(21, 30), 1], ["cook", hm(14), hm(21, 30), 1], ["dish", hm(14), hm(21, 30), 1]],
    sat: [["manager", hm(12), hm(21, 30), 1], ["barista", hm(7, 30), hm(14), 2], ["server", hm(8), hm(14), 1], ["cook", hm(7, 30), hm(14), 1], ["barista", hm(13, 30), hm(21, 30), 1], ["server", hm(14), hm(21, 30), 1], ["cook", hm(14), hm(21, 30), 1], ["dish", hm(12), hm(21, 30), 1]],
    sun: [["barista", hm(7, 30), hm(14), 2], ["cook", hm(7, 30), hm(14, 30), 1], ["barista", hm(12), hm(16, 30), 1], ["dish", hm(10), hm(16, 30), 1]],
  },
  oakridge: {
    wk: [["barista", hm(6, 30), hm(13), 2], ["cook", hm(7), hm(14), 1], ["barista", hm(12), hm(17, 30), 1]],
    fri: [["barista", hm(6, 30), hm(13), 2], ["cook", hm(7), hm(14), 1], ["barista", hm(13), hm(21, 30), 2]],
    sat: [["barista", hm(7, 30), hm(14), 2], ["barista", hm(13, 30), hm(21, 30), 2]],
    sun: [["barista", hm(7, 30), hm(14), 2], ["barista", hm(12), hm(16, 30), 1]],
  },
  langley: {
    wk: [["manager", hm(9), hm(17, 30), 1], ["server", hm(6, 30), hm(14, 30), 1], ["cook", hm(6, 30), hm(14, 30), 1], ["dish", hm(8), hm(15), 1], ["server", hm(11), hm(17, 30), 1], ["cook", hm(11), hm(17, 30), 1]],
    fri: [["manager", hm(12), hm(21, 30), 1], ["server", hm(6, 30), hm(14, 30), 1], ["cook", hm(6, 30), hm(14, 30), 1], ["dish", hm(8), hm(15), 1], ["server", hm(14), hm(21, 30), 3], ["bartender", hm(14), hm(21, 30), 1], ["host", hm(14), hm(21), 1], ["cook", hm(13, 30), hm(21, 30), 2], ["dish", hm(14), hm(22), 1]],
    sat: [["manager", hm(12), hm(21, 30), 1], ["server", hm(7, 30), hm(14, 30), 2], ["host", hm(7, 45), hm(14, 30), 1], ["cook", hm(7, 30), hm(14, 30), 1], ["dish", hm(8), hm(15), 1], ["server", hm(14), hm(21, 30), 3], ["bartender", hm(14), hm(21, 30), 1], ["cook", hm(13, 30), hm(21, 30), 2], ["dish", hm(14), hm(22), 1]],
    sun: [["server", hm(7, 30), hm(14, 30), 2], ["host", hm(7, 45), hm(14, 30), 1], ["cook", hm(7, 30), hm(14, 30), 2], ["dish", hm(8), hm(15), 1], ["server", hm(12), hm(16, 30), 1], ["cook", hm(12), hm(16, 30), 1]],
  },
};

/** Tips a week by room, before the day and half-day split. Rooms with table service tip more. */
const WEEK_TIPS = { harbour: 780_000, lonsdale: 260_000, oakridge: 170_000, langley: 320_000 };
const DAY_WEIGHT = [0.11, 0.11, 0.12, 0.13, 0.19, 0.21, 0.13];
const AM_SHARE = [0.62, 0.62, 0.62, 0.62, 0.32, 0.3, 0.72];

export function load({ asOf = new Date() } = {}) {
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const dow = (new Date(today).getUTCDay() + 6) % 7; // Monday = 0
  const monday = today - (dow + 7) * DAY;              // the last complete Mon to Sun
  const days = Array.from({ length: 7 }, (_, i) => iso(monday + i * DAY));
  const rnd = seeded(20260928);
  const jitter = () => Math.round(rnd() * 15) - 6;

  const punches = [];
  const worked = new Map(); // personId -> Set(dates)
  const add = (p) => { punches.push({ id: `P${String(punches.length + 1).padStart(3, "0")}`, ...p }); };

  // Forced shifts first, so the planted cases exist whatever the rota draws.
  const forced = [
    { personId: "E103", site: "harbour", day: 4, role: "server", start: hm(14), end: hm(21, 30), open: true },   // Priya, Friday night, never clocks out
    { personId: "E204", site: "lonsdale", day: 2, role: "barista", start: hm(6, 30), end: hm(13), late: hm(13, 4) }, // Sam, Wednesday, Lonsdale...
    { personId: "E204", site: "oakridge", day: 2, role: "barista", start: hm(12), end: hm(17, 30), early: hm(12, 5) }, // ...and Oakridge, overlapping
    { personId: "E001", site: "harbour", day: 5, role: "bartender", start: hm(16), end: hm(21, 30) },           // the owner behind the bar on Saturday
  ];
  const taken = new Set(); // `${site}:${day}:${role}:${start}` slots already filled by a forced shift

  for (const f of forced) {
    add({
      personId: f.personId, site: f.site, date: days[f.day], role: f.role,
      in: f.early ?? f.start + jitter(),
      out: f.open ? null : f.late ?? f.end + jitter(),
      scheduledEnd: f.end,
    });
    if (!worked.has(f.personId)) worked.set(f.personId, new Set());
    worked.get(f.personId).add(days[f.day]);
    taken.add(`${f.site}:${f.day}:${f.role}:${f.start}`);
  }

  for (const site of SITES) {
    for (let d = 0; d < 7; d += 1) {
      const kind = d < 4 ? "wk" : d === 4 ? "fri" : d === 5 ? "sat" : "sun";
      for (const [role, start, end, count] of SLOTS[site.id][kind]) {
        let need = count - (taken.has(`${site.id}:${d}:${role}:${start}`) ? 1 : 0);
        while (need > 0) {
          const pool = STAFF.filter((s) => s.role === role && (s.site === site.id || (s.alsoAt ?? []).includes(site.id)))
            .filter((s) => !worked.get(s.id)?.has(days[d]))
            .map((s) => ({ s, n: worked.get(s.id)?.size ?? 0, r: rnd() }))
            .filter((x) => x.n < 5)
            .sort((a, b) => a.n - b.n || a.r - b.r);
          if (!pool.length) break; // nobody left this day: the slot goes unfilled, as real rotas do
          const who = pool[0].s;
          add({ personId: who.id, site: site.id, date: days[d], role, in: start + jitter(), out: end + jitter(), scheduledEnd: end });
          if (!worked.has(who.id)) worked.set(who.id, new Set());
          worked.get(who.id).add(days[d]);
          need -= 1;
        }
      }
    }
  }

  // Tips per site, day and half day. Card tips from the POS; cash as declared at close.
  const tips = [];
  for (const site of SITES) {
    for (let d = 0; d < 7; d += 1) {
      const dayCents = WEEK_TIPS[site.id] * DAY_WEIGHT[d] * (0.92 + rnd() * 0.16);
      for (const b of BLOCKS) {
        const share = b.id === "AM" ? AM_SHARE[d] : 1 - AM_SHARE[d];
        const total = Math.round(dayCents * share);
        const cash = Math.round(total * (0.07 + rnd() * 0.07));
        tips.push({ id: `${site.id}:${days[d]}:${b.id}`, site: site.id, date: days[d], block: b.id, cardCents: total - cash, cashCents: cash });
      }
    }
  }
  // Thursday close at Langley: nobody declared the cash.
  tips.find((t) => t.id === `langley:${days[3]}:PM`).cashCents = null;

  // A Tuesday terminal batch that settled at 06:12 on Wednesday, before anyone was on.
  const batches = [{ id: "B-OAK-0612", site: "oakridge", date: days[2], at: hm(6, 12), cardCents: 6450, terminal: "OAK-T2" }];

  return {
    week: { from: days[0], to: days[6], days },
    punches,
    tips,
    batches,
    meta: { source: "fixtures", sourceLabel: "Sample data", asOf: iso(today) },
  };
}
