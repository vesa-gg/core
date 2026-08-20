type DataSource = "statscode" | "livedata"; // TODO not sure if its "live" or maybe something like "livedata"

export interface OverstatTournamentResponse extends JSON {
  total: number;
  source: DataSource;
  games: GameResponse[];
  teams: TeamTournamentResponse[];
  analytics: {
    qualityScore: number;
  };
}

export interface GameResponse {
  id: number;
  game: number;
  match_start: number;
  mid: string;
  map_name: "mp_rr_desertlands_hu" | "" | "" | "";
  aim_assist_allowed: boolean;
  match_id: number;
  source: DataSource;
  teams: TeamGameResponse[];
}

export interface TeamGameResponse {
  teamId: number;
  name: string;
  overall_stats: TeamGameStats;
  player_stats: PlayerGameStats[];
}

export interface TeamGameStats {
  id: number;
  teamId: number;
  gameId: number;
  teamPlacement: number;
  name: string;
  score: number;
  kills: number;
  revivesGiven: number;
  headshots: number;
  assists: number;
  respawnsGiven: number;
  damageDealt: number;
  knockdowns: number;
  shots: number;
  hits: number;
  survivalTime: number;
  grenadesThrown: number;
  ultimatesUsed: number;
  tacticalsUsed: number;
  damageTaken: number;
  matchId: number;
  characters: string[];
}

export interface PlayerGameStats {
  id: number;
  playerId: number;
  name: string;
  gameId: number;
  teamId: number;
  teamName: string;
  shots: number;
  hits: number;
  knockdowns: number;
  revivesGiven: number;
  respawnsGiven: number;
  survivalTime: number;
  assists: number;
  damageDealt: number;
  teamPlacement: number;
  hardware: string;
  kills: number;
  characterName: string;
  headshots: number;
  grenadesThrown: number | null;
  ultimatesUsed: number | null;
  tacticalsUsed: number | null;
  skin: string | null;
  damageTaken: number | null;
  matchId: number;
  score: number;
}

export interface TeamTournamentResponse {
  teamId: number;
  name: string;
  overall_stats: TeamTournamentStats;
  player_stats: PlayerTournamentStats[];
}

export interface TeamTournamentStats {
  position: number;
  score: number;
  bestGame: number;
  bestPlacement: number;
  bestKills: number;
  id: string;
  kills: number;
  revivesGiven: number;
  headshots: number;
  assists: number;
  survivalTime: number;
  respawnsGiven: number;
  damageDealt: number;
  hits: number;
  knockdowns: number;
  shots: number;
  grenadesThrown: number;
  ultimatesUsed: number;
  tacticalsUsed: number;
  damageTaken: number;
  name: string;
  accuracy: number;
}

export interface PlayerTournamentStats {
  name: string;
  playerId: number;
  kills: number;
  revivesGiven: number;
  headshots: number;
  assists: number;
  survivalTime: number;
  respawnsGiven: number;
  damageDealt: number;
  hits: number;
  knockdowns: number;
  shots: number;
  grenadesThrown: number;
  ultimatesUsed: number;
  tacticalsUsed: number;
  damageTaken: number;
  score: number;
  accuracy: number;
  characters: string[];
}
