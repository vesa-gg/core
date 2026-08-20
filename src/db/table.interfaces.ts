type uuid = string;

export interface ScrimSignupsWithPlayers {
  scrim_id: uuid;
  date_time: string;
  team_name: string;
  signup_player_id: uuid;
  signup_player_discord_id: string;
  signup_player_display_name: string;
  player_one_id: uuid;
  player_one_discord_id: string;
  player_one_display_name: string;
  player_one_overstat_id: string;
  player_one_elo: number;
  player_two_id: uuid;
  player_two_discord_id: string;
  player_two_display_name: string;
  player_two_overstat_id: string;
  player_two_elo: number;
  player_three_id: uuid;
  player_three_discord_id: string;
  player_three_display_name: string;
  player_three_overstat_id: string;
  player_three_elo: number;
}

export interface Scrims {
  id: uuid;
  date_time_field: string;
  discord_channel: string;
  active: boolean;
  overstat_id?: string;
  scrim_type: string;
}

export interface LeagueTeamPlayerInsert {
  playerId: string;
  slot: number;
  apexRank: string;
  platform: string;
  prevSeasonDivision: string;
  elo: number | null;
}

export interface LeagueSubRequestInsert {
  seasonId: string;
  teamId: string | null;
  teamName: string;
  division: string;
  weekNumber: string;
  playerOutId: string;
  playerInId: string;
  playerInDivision: string;
  requestedById: string;
  additionalComments: string | null;
}

export interface LeagueRosterChangeInsert {
  seasonId: string;
  teamId: string | null;
  teamName: string;
  division: string;
  playerOutId: string;
  playerInId: string;
  requestedById: string;
  additionalComments: string | null;
}
