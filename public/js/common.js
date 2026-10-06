/**
 * What every page shares: this visitor's decisions, the call to the server, and
 * the frame around each page.
 *
 * The browser keeps three things: the decisions made on the exceptions page, the
 * pool policy, and which rooms a manager has signed off. The server rebuilds the
 * whole week from them on every request and keeps nothing. "Reset the demo"
 * forgets all three.
 */

const KEY = "tasti-tips.v1";
const blank = () => ({ resolutions: {}, policy: null, approvals: {} });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && typeof s.resolutions === "object" && typeof s.approvals === "object") return { ...blank(), ...s };
  } catch { /* private window or blocked storage: the demo still runs, it just forgets */ }
  return blank();
}

export const store = load();
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* see load() */ }
}

export async function api(path, extra = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resolutions: store.resolutions, policy: store.policy, approvals: store.approvals, ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `request failed (${res.status})`);
  return json;
}

/* ---------- formatting ---------- */

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (c) => (c == null ? "" : `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const whole = (c) => `$${Math.round(c / 100).toLocaleString("en-CA")}`;
export const signed = (c) => `${c > 0 ? "+" : c < 0 ? "-" : ""}${money(Math.abs(c))}`;
export const hours = (min) => `${(min / 60).toFixed(1)} h`;
export const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
export const when = (iso) => new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** Who signs off each room. Oakridge has no manager of its own; Lonsdale's runs it. */
export const APPROVER = { harbour: "Alana Reyes", lonsdale: "Chloe Martin", oakridge: "Chloe Martin", langley: "Rachel Dubois" };

/* ---------- the frame ---------- */

const PAGES = [
  { href: "/", n: 1, label: "The week" },
  { href: "/exceptions", n: 2, label: "Decide", badge: true },
  { href: "/policy", n: 3, label: "Pool rules" },
  { href: "/distribution", n: 4, label: "Who gets what" },
  { href: "/payroll", n: 5, label: "Payroll" },
];

export function frame({ title, sub }) {
  const here = location.pathname.replace(/\.html$/, "").replace(/\/index$/, "/") || "/";
  document.title = `${title} · Tips · a working demo by Tasti.io`;
  $("top").innerHTML = `
    <div class="eyebrow">A working demo &middot; Tasti.io &middot; Tips for Harbour &amp; Co</div>
    <h1>${esc(title)}</h1>
    <p class="sub">${sub}</p>`;
  $("nav").innerHTML = PAGES.map((pg) => `
      <a href="${pg.href}" class="${here === pg.href ? "is-on" : ""}" ${here === pg.href ? 'aria-current="page"' : ""}>
        <span class="n">${pg.n}</span>${esc(pg.label)}${pg.badge ? '<span class="badge" id="open-badge" hidden></span>' : ""}
      </a>`).join("") +
    `<span class="gap"></span><a href="/me" class="${here === "/me" ? "is-on" : ""}">My tips</a><a href="/how" class="${here === "/how" ? "is-on" : ""}">How it works</a>`;
  $("foot").innerHTML = `
    <span>Built by Yuriy Romanyuk</span>
    <a href="https://www.tasti.io">tasti.io</a>
    <a href="https://demo.tasti.io">all demos</a>
    <a href="mailto:yuriy@tasti.io">yuriy@tasti.io</a>
    <button id="reset" title="Forget every decision made in this browser">Reset the demo</button>`;
  $("reset").addEventListener("click", () => {
    if (!confirm("Forget every decision, the policy and the sign-offs, and start the week again?")) return;
    try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
    location.href = "/";
  });
}

/** The number on "Decide" in the nav: what is still waiting for a person. */
export function badge(n) {
  const b = $("open-badge");
  if (!b) return;
  b.hidden = !n;
  b.textContent = String(n);
}

export function fail(err) {
  $("main").innerHTML = `<div class="card"><div class="empty">Something went wrong: ${esc(err.message)}.<br>Reload the page, or reset the demo from the footer.</div></div>`;
}

/** "Not legal advice" footnote, with the sections it rests on. */
export const LAW = `<p class="note"><b>Not legal advice.</b> The two rules built in here come from British Columbia's Employment Standards Act,
  <a href="https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-3-section-30-3" style="color:var(--teal)" target="_blank" rel="noopener">s.30.3</a> and
  <a href="https://www2.gov.bc.ca/gov/content/employment-business/employment-standards-advice/employment-standards/forms-resources/igm/esa-part-3-section-30-4" style="color:var(--teal)" target="_blank" rel="noopener">s.30.4</a>,
  and the Employment Standards Branch's interpretation of them. Harbour &amp; Co, its people and its tips are fictional.</p>`;
