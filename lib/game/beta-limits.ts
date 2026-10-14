// Controlled hosted/private beta limits. Raise deliberately after load evidence.
export const BETA_GAME_CARD_LIMIT = 100;

export function betaCardLimitMessage() {
  return `Beta games are limited to ${BETA_GAME_CARD_LIMIT} total cards per game.`;
}
