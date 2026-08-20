/**
 * A minimal, framework-agnostic stand-in for a Discord user/member.
 *
 * scrim-bot has this "for free" from discord.js (`User`/`GuildMember` objects),
 * so it can pass those directly wherever a `DiscordUserRef` is expected — they
 * satisfy this shape structurally. Any future non-Discord.js caller (e.g. a
 * server-side action triggered from VESAWeb) builds one of these from whatever
 * identity data it has (a verified Nhost JWT, a Discord REST API response, etc.)
 * instead of depending on discord.js, which this package intentionally does not.
 */
export interface DiscordUserRef {
  id: string;
  displayName: string;
}
