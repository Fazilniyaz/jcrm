/**
 * Cookie name for the sidebar rail preference.
 *
 * Kept in its own module (no "server-only") because both the server layout and
 * the client sidebar need it: the server reads it to render at the right width
 * on first paint, the client writes it when you squeeze or expand the rail.
 */
export const RAIL_COOKIE = "jadvix_rail";
