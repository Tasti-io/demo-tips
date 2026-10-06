/**
 * The small amount of plumbing every endpoint shares: read a JSON body, cap its
 * size, answer JSON. Bodies are small (a list of pushes), so 64 KB is generous.
 */
const MAX_BODY = 64 * 1024;

export async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > MAX_BODY) throw new Error("too large");
  }
  return JSON.parse(data || "{}");
}

export function send(res, code, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(code).end(JSON.stringify(body));
}

/** Wrap a handler: POST only, JSON in, JSON out, and a bad body is a 400, not a crash. */
export const endpoint = (fn) => async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: "could not read the request" }); }
  const out = fn(body ?? {});
  return send(res, out.error ? 400 : 200, out);
};
