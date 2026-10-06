/**
 * Step 3. The pool rules, which in British Columbia are the employer's to set,
 * and the two things that are not.
 *
 * Every change shows, before anyone commits to it, exactly who gains and who
 * loses and by how much, against the rules Harbour runs today. A tip policy
 * changed without that table is a policy changed by whoever argued loudest.
 */
import { store, save, api, frame, fail, badge, $, esc, money, signed, LAW } from "./common.js";

frame({
  title: "Pool rules",
  sub: "Who shares, by what measure, and how much goes to the kitchen are the employer's to decide. Change any of it and see, person by person, what it does to this week before it does anything at all.",
});

const DEFAULT = { period: "shift", kitchenPct: 25, managersShare: false,
  points: { server: 1, bartender: 1, barista: 1, host: 0.6, runner: 0.8, "sous-chef": 1.2, cook: 1, prep: 0.8, dish: 0.7, manager: 1 } };
const ROLE = { server: "Server", bartender: "Bartender", barista: "Barista", host: "Host", runner: "Runner", "sous-chef": "Sous chef", cook: "Line cook", prep: "Prep cook", dish: "Dishwasher", manager: "Manager" };
const SIDE = { server: "floor", bartender: "floor", barista: "floor", host: "floor", runner: "floor", "sous-chef": "kitchen", cook: "kitchen", prep: "kitchen", dish: "kitchen", manager: "floor, if in" };

let policy = structuredClone(store.policy ?? DEFAULT);
let timer;

function commit() {
  store.policy = JSON.stringify(policy) === JSON.stringify(DEFAULT) ? null : structuredClone(policy);
  save();
  clearTimeout(timer);
  timer = setTimeout(() => impact().catch(fail), 120);
}

function controls() {
  const seg = (v, label) => `<button data-period="${v}" class="${policy.period === v ? "is-on" : ""}">${label}</button>`;
  const pts = (role) => `<div class="pt"><span>${ROLE[role]}<span class="side">${SIDE[role]}</span></span>
    <span class="step-btns"><button data-pt="${role}" data-d="-0.1" aria-label="less for ${ROLE[role]}">&minus;</button><b>${policy.points[role].toFixed(1)}</b><button data-pt="${role}" data-d="0.1" aria-label="more for ${ROLE[role]}">+</button></span></div>`;
  return `
    <div class="card">
      <div class="card-head"><h2>How the pool is cut</h2><span class="stamp">Harbour &amp; Co's choice</span></div>
      <div class="card-body">
        <div class="switch"><div><div class="t">Pool by</div><div class="d">Tips from a busy Friday night go to the people who worked it, or get averaged across the day or the week.</div></div>
          <div class="seg">${seg("shift", "Shift")}${seg("day", "Day")}${seg("week", "Week")}</div></div>
        <div class="switch" style="display:block"><div style="display:flex;justify-content:space-between"><div class="t">Kitchen share</div><b>${policy.kitchenPct}%</b></div>
          <div class="d" style="margin-bottom:8px">Of each pool, by hours. If nobody from the kitchen was on, the whole pool stays with the floor, and the other way round.</div>
          <input type="range" min="0" max="50" step="1" value="${policy.kitchenPct}" id="kitchen" aria-label="Kitchen share"></div>
        <div class="switch"><div><div class="t">Salaried managers share</div><div class="d">The Act lets the employer decide; plenty of groups leave salaried managers out. If in, they count as floor.</div></div>
          <input type="checkbox" class="toggle" id="managers" ${policy.managersShare ? "checked" : ""} aria-label="Salaried managers share"></div>
        <div class="switch locked"><div><div class="t">Deduct card processing fees from card tips <span class="law">ESA s.30.3</span></div>
          <div class="d">Not allowed in British Columbia: an employer may not deduct from tips, card tips included, or charge costs against a pool. This stays off, and the server refuses it if asked.</div></div>
          <input type="checkbox" class="toggle" disabled aria-label="Deduct card fees, not allowed"></div>
        <div class="switch locked"><div><div class="t">Owners and directors share <span class="law">ESA s.30.4</span></div>
          <div class="d">Not a setting. A director of a corporate employer shares only if he regularly does, to a substantial degree, the same work. That is decided per person, on the record, on the Decide page.</div></div>
          <input type="checkbox" class="toggle" disabled aria-label="Directors share, decided per person"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Points per hour, by role</h2><span class="stamp">an hour as a server = 1.0</span></div>
      <div class="card-body"><div class="points">${Object.keys(ROLE).map(pts).join("")}</div></div>
      <div class="card-body" style="border-top:1px solid var(--rule)"><div class="actions">
        <button class="btn ghost" id="reset-policy">Back to Harbour's current rules</button>
        <span class="lede">Changing the rules after a room is signed off un-signs that room. Its manager sees the new numbers before signing again.</span></div></div>
    </div>`;
}

async function impact() {
  const w = await api("/api/week", { compare: true });
  badge(w.totals.openExceptions);
  const side = (s) => w.sides.find((x) => x.side === s);
  const changed = w.movers.length > 0;
  const top = w.movers.slice(0, 10);
  $("impact").innerHTML = `
    <div class="card">
      <div class="card-head"><h2>What this does to the week</h2><span class="stamp">against today's rules</span></div>
      <div class="tiles" style="grid-template-columns:1fr 1fr">
        <div class="tile"><span>To the floor</span><b>${money(Math.round(side("foh").afterCents))}</b><small>${changed ? signed(Math.round(side("foh").afterCents - side("foh").beforeCents)) : "no change"}</small></div>
        <div class="tile"><span>To the kitchen</span><b>${money(Math.round(side("boh").afterCents))}</b><small>${changed ? signed(Math.round(side("boh").afterCents - side("boh").beforeCents)) : "no change"}</small></div>
      </div>
      ${changed ? `<div class="tablewrap" style="border-top:1px solid var(--rule)"><table>
        <thead><tr><th>Person</th><th class="num">Today</th><th class="num">Under these rules</th></tr></thead>
        <tbody>${top.map((m) => `<tr><td>${esc(m.name)}<span class="sub-note">${esc((m.roles ?? []).join(", "))}, ${esc(m.site)}</span></td>
          <td class="num muted">${money(m.beforeCents)}</td>
          <td class="num"><b>${money(m.afterCents)}</b><span class="sub-note ${m.deltaCents > 0 ? "good" : "warn"}">${signed(m.deltaCents)}</span></td></tr>`).join("")}</tbody>
      </table></div>
      ${w.movers.length > top.length ? `<div class="card-body lede" style="border-top:1px solid var(--rule)">and ${w.movers.length - top.length} more people move by smaller amounts.</div>` : ""}`
      : `<div class="card-body"><p class="lede">These are Harbour &amp; Co's current rules. Move anything on the left and every person whose share changes appears here, with the amount.</p></div>`}
      ${w.totals.heldCents ? `<div class="card-body" style="border-top:1px solid var(--rule)"><p class="lede"><span class="warn">${money(w.totals.heldCents)} more is held</span> until the things on the <a href="/exceptions" style="color:var(--teal)">Decide</a> page are decided, so it is in neither column yet.</p></div>` : ""}
      <div class="card-body" style="border-top:1px solid var(--rule)"><p class="lede">The total never changes: every dollar of tips is paid to someone, or held where you can see it. Rules only move it between people.</p></div>
    </div>`;
}

function draw() {
  $("main").innerHTML = `<div class="grid2" style="margin-top:0"><div>${controls()}</div><div class="sticky" id="impact"><div class="card"><div class="empty">Working it out</div></div></div></div>${LAW}`;
  for (const b of document.querySelectorAll("[data-period]")) b.addEventListener("click", () => { policy.period = b.dataset.period; commit(); draw(); });
  $("kitchen").addEventListener("input", (e) => { policy.kitchenPct = Number(e.target.value); e.target.closest(".switch").querySelector("b").textContent = `${policy.kitchenPct}%`; commit(); });
  $("managers").addEventListener("change", (e) => { policy.managersShare = e.target.checked; commit(); });
  for (const b of document.querySelectorAll("[data-pt]")) {
    b.addEventListener("click", () => {
      const r = b.dataset.pt;
      policy.points[r] = Math.round(Math.min(3, Math.max(0, policy.points[r] + Number(b.dataset.d))) * 10) / 10;
      b.parentElement.querySelector("b").textContent = policy.points[r].toFixed(1);
      commit();
    });
  }
  $("reset-policy").addEventListener("click", () => { policy = structuredClone(DEFAULT); commit(); draw(); });
  impact().catch(fail);
}

draw();
