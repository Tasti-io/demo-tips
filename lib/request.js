/**
 * Turn what a browser sent into a validated week. Every endpoint goes through
 * here, so a bad decision, an illegal policy or a forged approval is refused the
 * same way everywhere.
 */
import { load } from "./fixtures.js";
import { week, detect, checkPolicy, checkResolutions, checkApprovals } from "./pool.js";

export function build(body, { asOf } = {}) {
  const data = load(asOf ? { asOf } : {});
  const pol = checkPolicy(body.policy);
  if (pol.error) return { error: pol.error };
  const res = checkResolutions(body.resolutions, detect(data));
  if (res.error) return { error: res.error };
  const w = week(data, { policy: pol.policy, resolutions: res.resolutions, approvals: checkApprovals(body.approvals) });
  return { data, w, notes: pol.notes, resolutions: res.resolutions };
}
