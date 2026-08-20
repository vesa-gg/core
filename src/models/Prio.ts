// a map of player.discordId -> accumulated prio
export type PlayerMap = Map<string, { amount: number; reason: string }>;
// a player id and its associated prio
export type PlayerPrio = {
  id: string;
  discordId: string;
  amount: number;
  reason: string;
};
// a player discord id, with amount and endDate
export type ExpungedPlayerPrio = {
  playerDiscordId: string;
  playerDisplayName: string;
  amount: number;
  endDate: Date;
};
