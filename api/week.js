/**
 * POST /api/week: the whole pay week under the policy and decisions the browser
 * sends. With `compare: true`, also who moves and by how much against Harbour's
 * current policy, for the policy page. Nothing is stored.
 */
import { endpoint } from "../lib/http.js";
import { build } from "../lib/request.js";
import { week, DEFAULT_POLICY } from "../lib/pool.js";

export default endpoint((body) => {
  const b = build(body);
  if (b.error) return b;
  const out = { ...b.w, notes: b.notes };
  if (body.compare) {
    const base = week(b.data, { policy: DEFAULT_POLICY, resolutions: b.resolutions });
    const before = new Map(base.sites.flatMap((s) => s.people.map((p) => [`${s.site}:${p.personId}`, p.cents])));
    const after = new Map(b.w.sites.flatMap((s) => s.people.map((p) => [`${s.site}:${p.personId}`, p.cents])));
    const keys = new Set([...before.keys(), ...after.keys()]);
    const names = new Map([...base.sites, ...b.w.sites].flatMap((s) => s.people.map((p) => [`${s.site}:${p.personId}`, { name: p.name, site: s.name, roles: p.roles }])));
    out.movers = [...keys].map((k) => ({ key: k, ...names.get(k), beforeCents: before.get(k) ?? 0, afterCents: after.get(k) ?? 0 }))
      .map((m) => ({ ...m, deltaCents: m.afterCents - m.beforeCents }))
      .filter((m) => m.deltaCents !== 0)
      .sort((x, y) => Math.abs(y.deltaCents) - Math.abs(x.deltaCents));
    out.sides = ["foh", "boh"].map((side) => ({ side,
      beforeCents: base.sites.flatMap((s) => s.people).reduce((a, p) => a + p.lines.filter((l) => l.side === side).reduce((x, l) => x + l.exactCents, 0), 0),
      afterCents: b.w.sites.flatMap((s) => s.people).reduce((a, p) => a + p.lines.filter((l) => l.side === side).reduce((x, l) => x + l.exactCents, 0), 0),
    }));
  }
  return out;
});
