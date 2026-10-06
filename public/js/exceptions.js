/**
 * Step 2. What a person has to decide before any money moves.
 *
 * Each item says what happened, why the tool will not guess, and what is held
 * until someone decides. Deciding is one click; changing your mind is another.
 * Nothing on this page moves money by itself: it unblocks pools, which the next
 * pages split and a manager signs off.
 */
import { store, save, api, frame, fail, badge, $, esc, money, day, LAW } from "./common.js";

frame({
  title: "Decide what the clock cannot",
  sub: "A spreadsheet guesses at these quietly, and the guess ends up in someone's pay. Here each one stops its pool until a person decides, says how much is waiting on it, and records what was decided.",
});

const pad = (n) => String(n).padStart(2, "0");
const t = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const SITE = { harbour: "Harbour Street", lonsdale: "Lonsdale", oakridge: "Oakridge food hall", langley: "Langley" };
const draft = {}; // choices clicked but not yet confirmed

async function render() {
  const w = await api("/api/week");
  badge(w.totals.openExceptions);
  const heldFor = (id) => w.sites.flatMap((s) => s.heldPools).filter((h) => h.exceptionId === id).reduce((a, h) => a + h.cents, 0);
  const open = w.exceptions.filter((e) => !e.decided);
  const done = w.exceptions.filter((e) => e.decided);

  const card = (e) => {
    const held = heldFor(e.id);
    const where = `${e.sites.map((s) => SITE[s]).join(" and ")} &middot; ${day(e.date)}`;
    const law = e.law ? `<a class="law" href="https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-3-section-30-4" target="_blank" rel="noopener">ESA ${esc(e.law)}</a>` : "";
    if (e.decided) {
      const opt = e.options.find((o) => o.value === e.decided.value);
      const extra = e.decided.minutes != null ? `, ${t(e.decided.minutes)}` : e.decided.cents != null ? `, ${money(e.decided.cents)}` : "";
      return `<div class="ex"><div class="where">${where}</div><h3>${esc(e.title)}${law}</h3>
        <div class="decided"><span class="kind ok">decided</span><span>${esc(opt?.label ?? e.decided.value)}${esc(extra)}</span>
        <button class="btn ghost small" data-undo="${esc(e.id)}">Change</button></div></div>`;
    }
    const chosen = draft[e.id]?.value ?? e.suggested;
    const opts = e.options.map((o) => {
      let extra = "";
      if (o.input === "time") {
        const from = Math.ceil(((e.inAt ?? 0) + 30) / 15) * 15;
        const choices = [];
        for (let m = from; m <= 23 * 60 + 45; m += 15) choices.push(m);
        const cur = draft[e.id]?.minutes ?? choices[Math.min(choices.length - 1, 24)];
        extra = `<div class="extra"><select data-time="${esc(e.id)}" aria-label="Clock-out time">${choices.map((m) => `<option value="${m}" ${m === cur ? "selected" : ""}>${t(m)}</option>`).join("")}</select></div>`;
      }
      if (o.input === "money") {
        const cur = draft[e.id]?.cents != null ? (draft[e.id].cents / 100).toFixed(2) : "";
        extra = `<div class="extra">$ <input type="number" min="0" max="2000" step="0.01" placeholder="0.00" value="${cur}" data-money="${esc(e.id)}" aria-label="Cash tips declared"></div>`;
      }
      return `<label class="choice ${chosen === o.value ? "is-on" : ""}">
        <input type="radio" name="c-${esc(e.id)}" value="${esc(o.value)}" ${chosen === o.value ? "checked" : ""} data-pick="${esc(e.id)}">
        <span>${esc(o.label)}${e.suggested === o.value ? ' <span class="muted">(suggested)</span>' : ""}${extra}</span></label>`;
    }).join("");
    return `<div class="ex"><div class="where">${where}</div><h3>${esc(e.title)}${law}</h3>
      <p>${esc(e.detail)}</p>
      ${held ? `<div class="held">${money(held)} in tips is held until this is decided.</div>` : ""}
      <div class="choices">${opts}</div>
      <div class="actions" style="margin-top:12px"><button class="btn primary small" data-decide="${esc(e.id)}" ${chosen ? "" : "disabled"}>Decide</button></div>
    </div>`;
  };

  $("main").innerHTML = `
    <div class="card">
      <div class="card-head"><h2>${open.length ? `${open.length} waiting for a person` : "Nothing waiting"}</h2>
        <span class="stamp">${open.length ? `${money(w.totals.heldCents)} held` : "every pool can be split"}</span></div>
      ${open.length ? open.map(card).join("") : `<div class="card-body"><div class="okbar" style="margin-top:0">Every exception this week is decided. <a href="/distribution" style="color:inherit;font-weight:500">See who gets what</a>.</div></div>`}
    </div>
    ${done.length ? `<div class="card"><div class="card-head"><h2>Decided</h2><span class="stamp">kept with the week</span></div>${done.map(card).join("")}</div>` : ""}
    ${LAW}`;

  for (const r of document.querySelectorAll("[data-pick]")) {
    r.addEventListener("change", () => { draft[r.dataset.pick] = { ...(draft[r.dataset.pick] ?? {}), value: r.value }; render().catch(fail); });
  }
  for (const s of document.querySelectorAll("[data-time]")) {
    s.addEventListener("change", () => { draft[s.dataset.time] = { ...(draft[s.dataset.time] ?? {}), value: "time", minutes: Number(s.value) }; render().catch(fail); });
  }
  for (const i of document.querySelectorAll("[data-money]")) {
    i.addEventListener("change", () => { draft[i.dataset.money] = { ...(draft[i.dataset.money] ?? {}), value: "amount", cents: Math.round(Number(i.value || 0) * 100) }; render().catch(fail); });
  }
  for (const b of document.querySelectorAll("[data-decide]")) {
    b.addEventListener("click", async () => {
      const e = w.exceptions.find((x) => x.id === b.dataset.decide);
      const d = { value: draft[e.id]?.value ?? e.suggested };
      const opt = e.options.find((o) => o.value === d.value);
      if (opt?.input === "time") d.minutes = draft[e.id]?.minutes ?? Number(document.querySelector(`[data-time="${CSS.escape(e.id)}"]`)?.value);
      if (opt?.input === "money") {
        const v = draft[e.id]?.cents ?? Math.round(Number(document.querySelector(`[data-money="${CSS.escape(e.id)}"]`)?.value || NaN) * 100);
        if (!Number.isFinite(v)) { alert("Enter the cash that was declared, or choose $0."); return; }
        d.cents = v;
      }
      store.resolutions[e.id] = d;
      save();
      try { await render(); } catch (err) {
        // The server refused it: take it back rather than keep a decision it will not accept.
        delete store.resolutions[e.id]; save(); alert(err.message); render().catch(fail);
      }
    });
  }
  for (const b of document.querySelectorAll("[data-undo]")) {
    b.addEventListener("click", () => { delete store.resolutions[b.dataset.undo]; save(); render().catch(fail); });
  }
}

render().catch(fail);
