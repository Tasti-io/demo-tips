/**
 * Step 5. The payroll file, which exists only when every room is signed off on
 * the numbers as they stand. The server builds it; this page only shows it and
 * hands it over.
 */
import { api, frame, fail, badge, $, esc, money, APPROVER, LAW } from "./common.js";

frame({
  title: "The payroll file",
  sub: "One file, one line per person per room, ready to import. It does not exist until nothing is waiting and every room's manager has signed off on the current numbers, because a file that can be produced early will be.",
});

async function render() {
  const w = await api("/api/week");
  badge(w.totals.openExceptions);
  const ic = (ok) => `<span class="ic ${ok ? "ok" : "no"}">${ok ? "&#10003;" : "!"}</span>`;
  const gate = `
    <ul class="gate">
      <li>${ic(!w.totals.openExceptions)}<span>${w.totals.openExceptions ? `${w.totals.openExceptions} thing${w.totals.openExceptions === 1 ? "" : "s"} still to decide. <a href="/exceptions" style="color:var(--teal)">Decide</a>` : "Nothing waiting for a decision"}</span></li>
      ${w.sites.map((s) => `<li>${ic(s.approval?.current && s.canApprove)}<span>${esc(s.name)}: ${s.approval?.current ? `signed off by ${esc(APPROVER[s.site])}` : s.approval ? `sign-off lapsed after a change. <a href="/distribution?site=${esc(s.site)}" style="color:var(--teal)">Review</a>` : `not signed off yet. <a href="/distribution?site=${esc(s.site)}" style="color:var(--teal)">Review</a>`}</span><span class="muted" style="margin-left:auto">${money(s.distributedCents)}</span></li>`).join("")}
      <li>${ic(true)}<span>No card processing fees or costs deducted from any tip <span class="law">ESA s.30.3</span></span></li>
    </ul>`;

  if (!w.payroll) {
    $("main").innerHTML = `
      <div class="card"><div class="card-head"><h2>Not yet</h2><span class="stamp">${w.totals.approved} of ${w.sites.length} rooms signed off</span></div>${gate}</div>
      ${LAW}`;
    return;
  }

  const p = w.payroll;
  const preview = p.csv.split("\n").slice(0, 14).join("\n");
  $("main").innerHTML = `
    <div class="card"><div class="card-head"><h2>Ready</h2><span class="stamp">${p.rows} lines &middot; ${money(p.totalCents)}</span></div>${gate}</div>
    <div class="card">
      <div class="card-head"><h2>${esc(p.filename)}</h2><button class="btn primary small" id="dl">Download the file</button></div>
      <div class="card-body">
        <pre class="csv">${esc(preview)}${p.rows > 13 ? `\n... ${p.rows - 13} more lines` : ""}</pre>
        <p class="lede" style="margin-top:12px">The columns most Canadian payroll tools import. Tips go in under their own earnings code,
          <b>TIPS-NV</b>, set up as not vacationable: the Employment Standards Branch's guidance is that employees are not entitled to
          vacation pay on tips. Somebody working in two rooms gets a line for each, so each manager's sign-off maps to its own lines.</p>
      </div>
      <div class="tablewrap" style="border-top:1px solid var(--rule)"><table>
        <thead><tr><th>Room</th><th class="num">People</th><th class="num">Tips</th><th>Signed off by</th></tr></thead>
        <tbody>${w.sites.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${s.people.length}</td><td class="num">${money(s.distributedCents)}</td><td>${esc(APPROVER[s.site])}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td><b>All rooms</b></td><td class="num"></td><td class="num"><b>${money(p.totalCents)}</b></td><td class="muted">equals every tip taken this week</td></tr></tfoot>
      </table></div>
    </div>
    <div class="card"><div class="card-body"><div class="actions"><a class="btn ghost" href="/me">See it as a member of staff would</a>
      <span class="lede">Everyone gets a link to their own week, with the working, so the number on the payslip is never a mystery.</span></div></div></div>
    ${LAW}`;

  $("dl").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([p.csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: p.filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

render().catch(fail);
