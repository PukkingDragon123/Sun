// This game is solo and real-time, so there are no server-authoritative rules;
// all gameplay lives client-side in ./js/. This module is just a small stub.
export const meta = { game: 'sunfish-useless-odyssey', minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
