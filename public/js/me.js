/**
 * The page a member of staff opens on their phone: their week, their money, and
 * exactly how it was worked out, in words a person reads in a minute.
 */
import { api, frame, fail, badge, $, esc, money, hours, day } from "./common.js";

frame({
  title: "My tips",
  sub: "What each person sees: their total, their hours, and the working for every pool they were in. No spreadsheet to ask for, no number to take on trust.",
});

const params = new URLSearchParams(location.search);
let who = params.get("id") || "E102";

async function render() {
  const s = await api("/api/statement", { personId: who });
  const w = await api("/api/week");
  badge(w.totals.openExceptions);
  const people = s.people.slice().sort((a, b) => a.name.localeCompare(b.name));
  const picker = `<div class="picker"><label for="who" class="lede">Viewing as</label>
    <select id="who">${people.map((p) => `<option value="${esc(p.id)}" ${p.id === who ? "selected" : ""}>${esc(p.name)}, ${esc(p.role)}</option>`).join("")}</select></div>`;

  const status = s.approved && s.rooms.length
    ? `Signed off by your manager. This is what payroll pays.`
    : s.rooms.length ? `Not final yet: your manager has not signed off this week, so these numbers can still change.` : "";

  const lines = s.rooms.flatMap((r) => r.row.lines.map((l) => ({ ...l, room: r.name })));
  const body = s.rooms.length ? `
      <div class="lines">${lines.map((l) => `<div class="line"><span>${esc(l.pool)}${s.rooms.length > 1 ? `, ${esc(l.room)}` : ""}
          <small>${(l.minutes / 60).toFixed(2)} h on the ${l.side === "foh" ? "floor" : "kitchen"} side, ${l.pointsPerHour.toFixed(1)} points an hour.
          The ${l.side === "foh" ? "floor's" : "kitchen's"} part of ${money(l.poolCents)} was ${money(Math.round(l.sideCents))};
          you had ${l.weight.toFixed(2)} of its ${l.sideWeight.toFixed(2)} weighted hours.${l.note ? ` ${esc(l.note.charAt(0).toUpperCase() + l.note.slice(1))}.` : ""}</small></span>
          <b>${money(Math.round(l.exactCents))}</b></div>`).join("")}</div>` :
    `<div class="lines"><div class="line"><span>Nothing from the pool this week.${s.excluded.length ? `<small>${esc(s.excluded.map((e) => `${e.site}: ${e.reason}`).join("; "))}.</small>` : ""}</span></div></div>`;

  $("main").innerHTML = `
    ${picker}
    <div class="receipt">
      <div class="top">
        <div class="stamp">Week of ${day(s.week.from)} to ${day(s.week.to)}</div>
        <div class="who" style="margin-top:8px">${esc(s.name)}</div>
        <div class="role">${esc(s.role)}, ${esc(s.home)}</div>
        <div class="amount">${money(s.totalCents)}</div>
        <div class="per">${s.minutes ? `${hours(s.minutes)} in the pool, ${money(Math.round(s.perHourCents))} an hour on top of your wage` : "no pooled hours this week"}</div>
      </div>
      ${body}
      <div class="foot">
        ${status ? `<b>${esc(status)}</b><br>` : ""}
        How the pool works this week: tips are pooled by ${s.policy.period === "shift" ? "shift (morning and evening separately)" : s.policy.period}; the kitchen gets ${s.policy.kitchenPct}% of each pool,
        and each side splits its part by hours times points for your role. Rounding to the cent never moves anyone by more than a cent.
        Nothing is deducted from tips: not card fees, not breakage, not anything.
        ${s.held.length ? `<br><span class="warn">Some of your room's tips are held until a manager decides something, so this may go up.</span>` : ""}
      </div>
    </div>
    <p class="note" style="max-width:460px;margin-left:auto;margin-right:auto">Harbour &amp; Co and everyone in it are fictional. Pick anyone above to see their week; a real account sends each person a link to their own, and only theirs.</p>`;

  $("who").addEventListener("change", (e) => { who = e.target.value; history.replaceState(null, "", `/me?id=${who}`); render().catch(fail); });
}

render().catch(fail);
