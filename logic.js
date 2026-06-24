// Solo real-time game: no server-authoritative rules are needed, but the
// apps-engine requires a code module at the zip root. This is the documented
// solo stub (build-game.md §1) — all gameplay lives client-side in ./js/.
export const meta = { game: 'sunfish-useless-odyssey', minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
