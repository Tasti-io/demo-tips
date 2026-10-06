#!/usr/bin/env node
/**
 * The claims this demo makes about itself, checked.
 *
 * It is about people's pay, so the failure paths come first and hardest: an
 * undecided exception must hold money rather than guess, a forged or stale
 * sign-off must not produce a payroll file, an illegal deduction must be
 * refused, a director must not be paid by default. Then the arithmetic, under
 * every policy the page allows, to the cent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { load } from "../lib/fixtures.js";
import { week, detect, checkPolicy, checkResolutions, DEFAULT_POLICY, statement, fingerprint } from "../lib/pool.js";
import { build } from "../lib/request.js";
import weekApi from "../api/week.js";

let failed = 0;
const check = (name, cond) => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}`); failed += 1; }
};

const asOf = new Date("2026-10-06T12:00:00Z");
const data = load({ asOf });
const ex = detect(data);
const decideAll = (overrides = {}) => Object.fromEntries(ex.map((e) => [e.id, overrides[e.kind] ?? (e.kind === "no-cash" ? { value: "zero" } : { value: e.suggested })]));
const approveAll = (w) => Object.fromEntries(w.sites.map((s) => [s.site, { fingerprint: s.fingerprint, at: "now" }]));
const add = (sites) => sites.every((s) => s.distributedCents + s.heldCents === s.tipsCents);

console.log("nothing is guessed: undecided means held");
{
  const w = week(data);
  check("five things are found from the data", ex.length === 5 && ["open-punch", "overlap", "stray-batch", "director", "no-cash"].every((k) => ex.some((e) => e.kind === k)));
  check("with nothing decided, money is held, not split", w.totals.heldCents > 0);
  check("every room touched by an exception waits for it", w.sites.every((s) => s.openExceptions > 0 ? !s.canApprove : true));
  check("the overlap holds both rooms it touches", ex.find((e) => e.kind === "overlap").sites.length === 2
    && ["lonsdale", "oakridge"].every((id) => w.sites.find((s) => s.site === id).heldCents > 0));
  check("Priya is not paid for a shift with no end", !w.sites.find((s) => s.site === "harbour").people.some((p) => p.personId === "E103" && p.lines.some((l) => l.pool === "Fri evening")));
  check("the stray batch is held, not dropped", w.sites.find((s) => s.site === "oakridge").heldPools.some((h) => h.cents === 6450));
  check("even held, every room adds up to the cent", add(w.sites));
  check("no payroll file while anything is held", w.payroll === null);
}

console.log("\nthe law is not a setting");
{
  const p = checkPolicy({ deductCardFees: true });
  check("asking to deduct card fees is refused, and said so", p.policy.deductCardFees === false && p.notes.some((n) => /cannot be deducted/.test(n)));
  const w = week(data, { resolutions: decideAll() });
  const harbour = w.sites.find((s) => s.site === "harbour");
  check("the director is out of the pool by default", !harbour.people.some((x) => x.personId === "E001") && harbour.excluded.some((x) => x.personId === "E001"));
  const w2 = week(data, { resolutions: decideAll({ director: { value: "include" } }) });
  check("and in only when a person records that he regularly does the work", w2.sites.find((s) => s.site === "harbour").people.some((x) => x.personId === "E001"));
  check("tips paid out equal tips taken: nothing is kept back", w.totals.distributedCents === w.totals.tipsCents);
}

console.log("\nsign-offs cannot be forged or go stale");
{
  const res = decideAll();
  const w = week(data, { resolutions: res });
  check("unsigned rooms give no payroll file", w.payroll === null);
  const forged = Object.fromEntries(w.sites.map((s) => [s.site, { fingerprint: "deadbeef0000", at: "now" }]));
  check("a made-up fingerprint signs nothing", week(data, { resolutions: res, approvals: forged }).payroll === null);
  const signed = week(data, { resolutions: res, approvals: approveAll(w) });
  check("signed on the current numbers, the file exists", signed.payroll !== null);
  const changed = week(data, { resolutions: res, approvals: approveAll(w), policy: checkPolicy({ kitchenPct: 30 }).policy });
  check("change a rule after sign-off and the sign-offs lapse", changed.payroll === null && changed.sites.every((s) => s.approval && !s.approval.current));
  const redecided = week(data, { resolutions: { ...res, [ex.find((e) => e.kind === "director").id]: { value: "include" } }, approvals: approveAll(w) });
  check("change a decision after sign-off and that room lapses", !redecided.sites.find((s) => s.site === "harbour").approval.current);
  check("rooms the change did not touch keep their sign-off", redecided.sites.find((s) => s.site === "langley").approval.current);
}

console.log("\nwhat a browser sends is not trusted");
check("an unknown pool period is refused", Boolean(checkPolicy({ period: "month" }).error));
check("a kitchen share over 50% is refused", Boolean(checkPolicy({ kitchenPct: 90 }).error));
check("negative points are refused", Boolean(checkPolicy({ points: { server: -1 } }).error));
check("an unknown choice is refused", Boolean(checkResolutions({ [ex[0].id]: { value: "pay-me-double" } }, ex).error));
check("cash over $2,000 is refused", Boolean(checkResolutions({ [ex.find((e) => e.kind === "no-cash").id]: { value: "amount", cents: 900000 } }, ex).error));
check("a clock-out time of 30 o'clock is refused", Boolean(checkResolutions({ [ex.find((e) => e.kind === "open-punch").id]: { value: "time", minutes: 1800 } }, ex).error));
check("decisions about things that do not exist are ignored", Object.keys(checkResolutions({ "open:P999": { value: "scheduled" } }, ex).resolutions).length === 0);
{
  let out;
  await weekApi({ method: "POST", body: { policy: { kitchenPct: "lots" } } }, { setHeader() {}, status: (code) => ({ end: (b) => { out = { code, ...JSON.parse(b) }; } }) });
  check("the endpoint answers a bad policy with 400, not a crash", out.code === 400 && Boolean(out.error));
}

console.log("\nthe decisions do what they say");
{
  const id = ex.find((e) => e.kind === "open-punch").id;
  const a = week(data, { resolutions: decideAll() });
  const b = week(data, { resolutions: { ...decideAll(), [id]: { value: "time", minutes: 23 * 60 } } });
  const priya = (w) => w.sites.find((s) => s.site === "harbour").people.find((p) => p.personId === "E103");
  check("a later clock-out gives Priya more hours and more tips", priya(b).minutes > priya(a).minutes && priya(b).cents > priya(a).cents);
  check("and the room still adds up", add(b.sites));
  const ov = ex.find((e) => e.kind === "overlap");
  const sam = (w, site) => w.sites.find((s) => s.site === site).people.find((p) => p.personId === "E204")?.minutes ?? 0;
  const first = week(data, { resolutions: { ...decideAll(), [ov.id]: { value: "first-ends" } } });
  const second = week(data, { resolutions: { ...decideAll(), [ov.id]: { value: "second-starts" } } });
  const overlapMin = data.punches.find((p) => p.id === ov.first).out - data.punches.find((p) => p.id === ov.second).in;
  check("the overlap is counted once, whichever side is trimmed",
    sam(first, "lonsdale") + sam(first, "oakridge") === sam(second, "lonsdale") + sam(second, "oakridge")
    && sam(first, "lonsdale") === sam(second, "lonsdale") - overlapMin);
  const cashId = ex.find((e) => e.kind === "no-cash").id;
  const withCash = week(data, { resolutions: { ...decideAll(), [cashId]: { value: "amount", cents: 4200 } } });
  check("$42 of declared cash adds exactly $42 to Langley", withCash.sites.find((s) => s.site === "langley").tipsCents - a.sites.find((s) => s.site === "langley").tipsCents === 4200);
  const batchId = ex.find((e) => e.kind === "stray-batch").id;
  const am = week(data, { resolutions: { ...decideAll(), [batchId]: { value: "same-am" } } });
  check("the batch lands in whichever shift is chosen, and nowhere twice",
    am.sites.find((s) => s.site === "oakridge").tipsCents === a.sites.find((s) => s.site === "oakridge").tipsCents);
}

console.log("\nthe arithmetic, under every policy the page allows");
{
  let all = true; let neg = false; let ranges = true; let count = 0;
  for (const period of ["shift", "day", "week"]) for (const kitchenPct of [0, 25, 50]) for (const managersShare of [false, true]) {
    const w = week(data, { resolutions: decideAll(), policy: checkPolicy({ period, kitchenPct, managersShare }).policy });
    count += 1;
    if (!add(w.sites) || w.totals.heldCents !== 0) all = false;
    if (w.sites.some((s) => s.people.some((p) => p.cents < 0))) neg = true;
    if (w.sites.some((s) => s.people.some((p) => Math.abs(p.cents - p.exactCents) >= 1))) ranges = false;
  }
  check(`split = tips to the cent in all ${count} combinations`, all);
  check("nobody is ever paid a negative amount", !neg);
  check("rounding never moves anyone by a cent or more", ranges);
  const w = week(data, { resolutions: decideAll() });
  const oak = w.sites.find((s) => s.site === "oakridge");
  check("on a day with no kitchen on, the floor gets the whole pool", oak.people.some((p) => p.lines.some((l) => l.side === "foh" && l.note && /no kitchen/.test(l.note) && Math.abs(l.sideCents - l.poolCents) < 1e-6)));
  const sat = w.sites.find((s) => s.site === "harbour").people.flatMap((p) => p.lines).filter((l) => l.pool === "Sat evening");
  const fohShare = sat.filter((l) => l.side === "foh")[0].sideCents / sat[0].poolCents;
  check("with a kitchen on, the kitchen gets exactly its share", Math.abs(fohShare - 0.75) < 1e-9);
  const managers = week(data, { resolutions: decideAll(), policy: checkPolicy({ managersShare: true }).policy });
  check("salaried managers appear only when the policy puts them in",
    !w.sites.some((s) => s.people.some((p) => ["E101", "E201", "E401"].includes(p.personId)))
    && managers.sites.some((s) => s.people.some((p) => p.personId === "E101")));
}

console.log("\nevery person's page agrees with the payroll file");
{
  const res = decideAll();
  const w0 = week(data, { resolutions: res });
  const w = week(data, { resolutions: res, approvals: approveAll(w0) });
  const csvTotal = w.payroll.csv.trim().split("\n").slice(1).reduce((a, l) => a + Math.round(Number(l.split(",")[4]) * 100), 0);
  check("the file adds up to every tip taken", csvTotal === w.totals.tipsCents);
  check("one line per person per room", w.payroll.rows === w.sites.reduce((a, s) => a + s.people.length, 0));
  check("tips go under a non-vacationable code", w.payroll.csv.includes("TIPS-NV"));
  const people = [...new Set(w.sites.flatMap((s) => s.people.map((p) => p.personId)))];
  check("each statement totals that person's lines in the file", people.every((id) => {
    const fromCsv = w.payroll.csv.trim().split("\n").slice(1).filter((l) => l.startsWith(`${id},`)).reduce((a, l) => a + Math.round(Number(l.split(",")[4]) * 100), 0);
    return statement(w, id).totalCents === fromCsv;
  }));
  check("Sam, who worked two rooms, gets a line for each", w.payroll.csv.split("\n").filter((l) => l.startsWith("E204,")).length === 2);
  check("a statement's lines add up to its exact share", people.every((id) => w.sites.every((s) => {
    const p = s.people.find((x) => x.personId === id);
    return !p || Math.abs(p.lines.reduce((a, l) => a + l.exactCents, 0) - p.exactCents) < 1e-6;
  })));
}

console.log("\nit is deterministic, and the shared Harbour & Co");
check("the same week twice is the same week", JSON.stringify(week(load({ asOf }))) === JSON.stringify(week(load({ asOf }))));
{
  const later = week(load({ asOf: new Date("2026-11-18T12:00:00Z") }), { resolutions: {} });
  check("another week slides the dates and keeps the five exceptions", later.exceptions.length === 5 && later.week.from !== data.week.from);
  const dir = new URL("../lib/harbour/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
  const h = createHash("sha256");
  for (const f of files) h.update(f).update(readFileSync(new URL(f, dir)));
  check("the vendored dataset matches its VERSION", h.digest("hex").slice(0, 16) === readFileSync(new URL("VERSION", dir), "utf8").trim());
  check("fingerprints change when anyone's pay changes", fingerprint({ people: [{ personId: "a", cents: 1 }], heldCents: 0 }) !== fingerprint({ people: [{ personId: "a", cents: 2 }], heldCents: 0 }));
}

console.log("\nno model, no network, no storage on the server");
const server = ["lib/pool.js", "lib/fixtures.js", "lib/request.js", "lib/http.js", ...readdirSync(new URL("../api/", import.meta.url)).map((f) => `api/${f}`)]
  .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
check("no network calls", !/fetch\(|anthropic/i.test(server));
check("no writes or databases", !/writeFile|node:fs|supabase|redis|@vercel\/(kv|blob|postgres)/i.test(server));
check("no unseeded randomness", !/Math\.random/.test(server));

console.log("\nthe words");
const pub = readdirSync(new URL("../public/", import.meta.url)).filter((f) => f.endsWith(".html"))
  .concat(readdirSync(new URL("../public/js/", import.meta.url)).map((f) => `js/${f}`))
  .map((f) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8")).join("\n");
check("no em dashes anywhere a visitor reads", ![pub, server, JSON.stringify(week(data))].some((s) => s.includes("\u2014")));
check("the law is cited and linked", /s\.30\.3/.test(pub) && /s\.30\.4/.test(pub) && /esa-part-3-section-30-4/.test(pub));
check("it says it is not legal advice", /Not legal advice/.test(pub));
check("and that everyone in it is fictional", /fictional/i.test(pub));
check("the request builder refuses what the parts refuse", Boolean(build({ policy: { period: "year" } }, { asOf }).error));

console.log(failed ? `\n${failed} failure(s)` : "\nall passed");
process.exit(failed ? 1 : 0);
