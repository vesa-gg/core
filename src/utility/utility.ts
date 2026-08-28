import { Channel, ForumChannel, GuildMember } from "discord.js";
import type { APIInteractionGuildMember } from "../../node_modules/discord-api-types/payloads/v10/_interactions/base.d.ts";
import { ChannelType } from "discord-api-types/v10";

export function isGuildMember(
  value: GuildMember | APIInteractionGuildMember | null,
): value is GuildMember {
  return (value as GuildMember)?.roles !== undefined;
}

export function isForumChannel(value: Channel): value is ForumChannel {
  return (value as ForumChannel)?.type === ChannelType.GuildForum;
}

export function replaceScrimVariables(
  text: string,
  replacements: {
    scrimTime: string;
    scrimDate: string;
    draftTime: string;
    lobbyPostTime: string;
    lowPrioTime: string;
    signupCount: string;
    rosterLockTime: string;
  },
) {
  return text
    .replace("${scrimTime}", replacements.scrimTime)
    .replace("${scrimDate}", replacements.scrimDate)
    .replace("${draftTime}", replacements.draftTime)
    .replace("${lobbyPostTime}", replacements.lobbyPostTime)
    .replace("${lowPrioTime}", replacements.lowPrioTime)
    .replace("${signupCount}", replacements.signupCount)
    .replace("${rosterLockTime}", replacements.rosterLockTime)
    .replace(/\\n/g, "\n");
}

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
