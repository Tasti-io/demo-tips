/**
 * Step 1. The week at a glance: what came in, where it stands, what is waiting.
 */
import { api, frame, fail, badge, $, esc, money, whole, hours, day, APPROVER, LAW } from "./common.js";

frame({
  title: "A week of tips, ready for payroll",
  sub: "Every Monday a manager at each room pulls the tips from the till, the hours from the time clock, argues with a spreadsheet, and sends a number to payroll that nobody else can check. This does it for four rooms at once, stops on anything a person has to decide, and shows every person exactly how their share was worked out.",
});

async function render() {
  const w = await api("/api/week");
  badge(w.totals.openExceptions);
  const t = w.totals;
  const approvedNow = w.sites.filter((s) => s.approval?.current).length;
  const lapsed = w.sites.filter((s) => s.approval && !s.approval.current).length;

  const step = (href, k, v, s, state) => `<a href="${href}" class="${state}"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></a>`;
  const progress = `
    <div class="progress">
      ${step("/", "1 &middot; Sources", `${whole(t.tipsCents)} in tips`, `${w.sites.length} rooms, ${t.people} people in the pools`, "done")}
      ${step("/exceptions", "2 &middot; Decide", t.openExceptions ? `${t.openExceptions} waiting` : "Nothing waiting", t.openExceptions ? `${whole(t.heldCents)} held until then` : "every pool can be split", t.openExceptions ? "todo" : "done")}
      ${step("/policy", "3 &middot; Pool rules", w.policy.period === "shift" ? "Pooled by shift" : w.policy.period === "day" ? "Pooled by day" : "Pooled by week", `kitchen ${w.policy.kitchenPct}% &middot; managers ${w.policy.managersShare ? "in" : "out"}`, "done")}
      ${step("/distribution", "4 &middot; Sign-off", `${approvedNow} of ${w.sites.length} rooms`, lapsed ? `${lapsed} sign-off${lapsed === 1 ? "" : "s"} lapsed after a change` : "each by its own manager", approvedNow === w.sites.length ? "done" : t.openExceptions ? "wait" : "todo")}
      ${step("/payroll", "5 &middot; Payroll", w.payroll ? "File ready" : "Not yet", w.payroll ? `${w.payroll.rows} lines, ${money(w.payroll.totalCents)}` : "after every room is signed off", w.payroll ? "done" : "wait")}
    </div>`;

  const cards = w.sites.map((s) => {
    const dPct = s.tipsCents ? (s.distributedCents / s.tipsCents) * 100 : 0;
    const hPct = s.tipsCents ? (s.heldCents / s.tipsCents) * 100 : 0;
    const state = s.approval?.current ? `<span class="kind ok">signed off</span>`
      : s.approval ? `<span class="kind bad">sign-off lapsed</span>`
      : s.openExceptions ? `<span class="kind bad">${s.openExceptions} to decide</span>`
      : `<span class="kind">ready for ${esc(APPROVER[s.site].split(" ")[0])}</span>`;
    return `
      <a class="site" href="/distribution?site=${esc(s.site)}">
        <h3>${esc(s.name)}</h3>
        <div class="fmt">${s.people.length} people &middot; ${hours(s.minutes)} in the pool</div>
        <div class="big">${money(s.tipsCents)}</div>
        <div class="split">card ${whole(s.cardCents)} &middot; cash ${whole(s.cashCents)}</div>
        <div class="bar" title="paid out and held"><span class="d" style="width:${dPct}%"></span><span class="h" style="width:${hPct}%"></span></div>
        <div class="split" style="margin-bottom:10px">${money(s.distributedCents)} split${s.heldCents ? ` &middot; <span class="warn">${money(s.heldCents)} held</span>` : ""}</div>
        <div class="meta">${state}</div>
      </a>`;
  }).join("");

  const next = t.openExceptions
    ? { href: "/exceptions", label: `Decide the ${t.openExceptions} thing${t.openExceptions === 1 ? "" : "s"} waiting`, why: "Until then those pools are held, not guessed at." }
    : approvedNow < w.sites.length
      ? { href: "/distribution", label: "See who gets what, and sign off", why: "Each room is signed off by its own manager." }
      : { href: "/payroll", label: "Get the payroll file", why: "Every room is signed off on the current numbers." };

  $("main").innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Week of ${day(w.week.from)} to ${day(w.week.to)}</h2><span class="stamp">${esc(w.legalName)} &middot; sample data</span></div>
      ${progress}
    </div>
    <div class="sites">${cards}</div>
    <div class="card">
      <div class="card-body"><div class="actions"><a class="btn primary" href="${next.href}">${next.label}</a><span class="lede">${next.why}</span></div></div>
    </div>
    <p class="note"><b>About these numbers.</b> One invented week at the same fictional group as the other Tasti demos: four rooms,
      ${t.people} people, the opening hours from its website. Tips come from the till in half-day blocks, card and cash; hours come
      from the time clock. Nothing is stored on the server: your decisions live in this browser, and the week is rebuilt from them on
      every page.</p>
    ${LAW}`;
}

render().catch(fail);
