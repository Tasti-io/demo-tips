/** POST /api/statement: one person's week, with the working for every pool they were in. */
import { endpoint } from "../lib/http.js";
import { build } from "../lib/request.js";
import { statement, EVERYONE } from "../lib/pool.js";

export default endpoint((body) => {
  const b = build(body);
  if (b.error) return b;
  if (!body.personId) return { people: EVERYONE };
  const s = statement(b.w, String(body.personId));
  return s ? { ...s, people: EVERYONE } : { error: "nobody by that id" };
});
