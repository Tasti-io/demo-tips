/**
 * Step 4. Who gets what, room by room, with the working one click away, and the
 * manager's sign-off.
 *
 * The sign-off is against a fingerprint of the exact numbers on screen. Change a
 * rule or a decision afterwards and the fingerprint no longer matches, so the
 * sign-off lapses and says so, instead of quietly approving numbers nobody saw.
 */
import { store, save, api, frame, fail, badge, $, esc, money, hours, when, APPROVER, LAW } from "./common.js";

frame({
  title: "Who gets what",
  sub: "Each room's tips, split by the rules, to the cent. Open anyone to see exactly how their share was worked out, pool by pool. Then the room's manager signs it off, and only signed rooms go to payroll.",
});

let site = new URLSearchParams(location.search).get("site") || "harbour";
const open = new Set();

async function render() {
  const w = await api("/api/week");
  badge(w.totals.openExceptions);
  const s = w.sites.find((x) => x.site === site) ?? w.sites[0];
  site = s.site;
  const maxPh = Math.max(...s.people.map((p) => p.perHourCents), 1);

  const tabs = `<div class="tabs-sites">${w.sites.map((x) => `<button data-site="${esc(x.site)}" class="${x.site === site ? "is-on" : ""}">${esc(x.name)}<span class="dot ${x.approval?.current ? "ok" : x.openExceptions || (x.approval && !x.approval.current) ? "bad" : ""}"></span></button>`).join("")}</div>`;

  const working = (p) => `
    <tr class="working"><td colspan="5"><div class="work">
      ${esc(p.name.split(" ")[0])}'s share is worked out pool by pool. In each, the floor and the kitchen split the tips
      (${w.policy.kitchenPct}% to the kitchen), then each side splits its part by hours times points.
      <div class="tablewrap"><table>
        <thead><tr><th>Pool</th><th class="num">Tips</th><th>Side</th><th class="num">Side's part</th><th class="num">Hours &times; points</th><th class="num">Of all on that side</th><th class="num">Share</th></tr></thead>
        <tbody>${p.lines.map((l) => `<tr><td>${esc(l.pool)}${l.note ? `<span class="sub-note">${esc(l.note)}</span>` : ""}</td>
          <td class="num">${money(l.poolCents)}</td><td>${l.side === "foh" ? "floor" : "kitchen"}</td>
          <td class="num">${money(Math.round(l.sideCents))}</td>
          <td class="num">${(l.minutes / 60).toFixed(2)} h &rarr; ${l.weight.toFixed(2)}</td>
          <td class="num">${l.weight.toFixed(2)} of ${l.sideWeight.toFixed(2)}</td>
          <td class="num"><b>${money(Math.round(l.exactCents))}</b></td></tr>`).join("")}</tbody>
      </table></div>
      <div style="margin-top:6px">Exact total ${money(p.exactCents)}, paid as <b>${money(p.cents)}</b>. Rounding to the cent never moves anyone by more than a cent, and the room adds up exactly.</div>
    </div></td></tr>`;

  const rows = s.people.map((p) => `
    <tr class="person" data-p="${esc(p.personId)}">
      <td><b style="font-weight:500">${esc(p.name)}</b>${p.home !== site ? ' <span class="kind">from another room</span>' : ""}<span class="sub-note">${esc(p.roles.join(", "))}</span></td>
      <td class="num">${hours(p.minutes)}</td>
      <td class="num hide-sm">${p.lines.length} pool${p.lines.length === 1 ? "" : "s"}</td>
      <td class="num"><b>${money(p.cents)}</b></td>
      <td class="num">${money(Math.round(p.perHourCents))}/h<span class="ph"><span style="width:${(p.perHourCents / maxPh) * 100}%"></span></span></td>
    </tr>${open.has(p.personId) ? working(p) : ""}`).join("");

  const appr = s.approval;
  const approver = APPROVER[site];
  const sign = appr?.current
    ? `<div class="okbar" style="margin-top:0">Signed off by ${esc(approver)} at ${esc(when(appr.at))}, on exactly these numbers.</div>
       <div class="actions" style="margin-top:10px"><button class="btn ghost small" id="unsign">Withdraw the sign-off</button></div>`
    : `${appr ? `<div class="notice" style="margin-top:0"><b>The sign-off from ${esc(when(appr.at))} has lapsed.</b> A rule or a decision changed after it, so these are not the numbers ${esc(approver.split(" ")[0])} approved.</div>` : ""}
       <div class="actions" style="margin-top:${appr ? 12 : 0}px">
         <button class="btn primary" id="sign" ${s.canApprove ? "" : "disabled"}>Sign off as ${esc(approver)}</button>
         <span class="lede">${s.canApprove ? `${money(s.distributedCents)} to ${s.people.length} people. Payroll gets exactly this.` : s.openExceptions ? `${s.openExceptions} thing${s.openExceptions === 1 ? "" : "s"} to decide first, on the <a href="/exceptions" style="color:var(--teal)">Decide</a> page.` : "Some tips are still held."}</span>
       </div>`;

  $("main").innerHTML = `
    ${tabs}
    <div class="card">
      <div class="tiles">
        <div class="tile"><span>Tips this week</span><b>${money(s.tipsCents)}</b><small>card ${money(s.cardCents)}, cash ${money(s.cashCents)}</small></div>
        <div class="tile"><span>Split</span><b>${money(s.distributedCents)}</b><small>to ${s.people.length} people, ${hours(s.minutes)}</small></div>
        <div class="tile"><span>Held</span><b class="${s.heldCents ? "warn" : ""}">${money(s.heldCents)}</b><small>${s.heldCents ? "until a person decides" : "nothing waiting"}</small></div>
        <div class="tile"><span>Check</span><b class="${s.distributedCents + s.heldCents === s.tipsCents ? "good" : "warn"}">${s.distributedCents + s.heldCents === s.tipsCents ? "Adds up" : "Does not add up"}</b><small>split + held = tips, to the cent</small></div>
      </div>
    </div>
    ${s.heldPools.length ? `<div class="card"><div class="card-head"><h2>Held, and why</h2><a class="btn ghost small" href="/exceptions">Decide</a></div>
      <ul class="list">${s.heldPools.map((h) => `<li><span><b>${esc(h.label)}</b>: ${esc(h.reason)}</span><span class="warn">${money(h.cents)}</span></li>`).join("")}</ul></div>` : ""}
    <div class="card">
      <div class="card-head"><h2>${esc(s.name)}</h2><span class="stamp">click anyone for the working</span></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Person</th><th class="num">In the pool</th><th class="num hide-sm">Pools</th><th class="num">Tips</th><th class="num">Per hour</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">Nothing split yet.</td></tr>`}</tbody>
      </table></div>
      ${s.excluded.length ? `<div class="card-body" style="border-top:1px solid var(--rule)"><p class="lede"><b>On the clock, not in the pool:</b> ${s.excluded.map((e) => `${esc(e.name)} (${esc(e.reason)})`).join("; ")}.</p></div>` : ""}
    </div>
    <div class="card"><div class="card-head"><h2>Sign-off</h2><span class="stamp">fingerprint ${esc(s.fingerprint)}</span></div><div class="card-body">${sign}</div></div>
    ${LAW}`;

  for (const b of document.querySelectorAll("[data-site]")) b.addEventListener("click", () => { site = b.dataset.site; open.clear(); history.replaceState(null, "", `/distribution?site=${site}`); render().catch(fail); });
  for (const tr of document.querySelectorAll("tr.person")) tr.addEventListener("click", () => { const id = tr.dataset.p; open.has(id) ? open.delete(id) : open.add(id); render().catch(fail); });
  $("sign")?.addEventListener("click", () => { store.approvals[site] = { fingerprint: s.fingerprint, at: new Date().toISOString() }; save(); render().catch(fail); });
  $("unsign")?.addEventListener("click", () => { delete store.approvals[site]; save(); render().catch(fail); });
}

render().catch(fail);
