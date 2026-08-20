// Framework-agnostic helpers only. Discord.js-coupled helpers (isGuildMember,
// isForumChannel) stay in scrim-bot's own utility module since this package
// does not depend on discord.js.

export function omitKey<T extends object, K extends keyof T>(
  obj: T,
  key: K,
): Omit<T, K> {
  const { [key]: _, ...rest } = obj;
  return rest;
}

export const OVERSTAT_LINK_CHANNEL_URL =
  "https://discord.com/channels/1043350338574495764/1341877592139104376";

export function buildOverstatWarningMessage(
  playerNames: string[],
  requireOverstat: boolean,
): string {
  const playerList = playerNames.join(", ");
  return requireOverstat
    ? `Your admin role overrode missing overstats for: ${playerList}`
    : `The following players have not linked their Overstat: ${playerList}. To accurately sort your team in the future, please let them know to link their Overstat by following the pinned instructions in ${OVERSTAT_LINK_CHANNEL_URL}`;
}

export function isJson(objectToCheck: unknown): objectToCheck is JSON {
  return (
    typeof objectToCheck === "object" &&
    objectToCheck !== null &&
    !Array.isArray(objectToCheck)
  );
}
