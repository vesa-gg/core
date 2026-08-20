export interface Player {
  id: string;
  discordId: string;
  displayName: string;
  overstatId?: string;
  elo?: number;
  prio?: {
    amount: number;
    reason: string;
  };
}

export interface PlayerInsert {
  discordId: string;
  displayName: string;
  overstatId?: string;
  elo?: number;
}

export interface PlayerStatInsert {
  player_id: string;
  scrim_id: string;

  name: string;
  kills: number;
  revives_given: number;
  assists: number;
  survival_time: number;
  respawns_given: number;
  damage_dealt: number;
  knockdowns: number;
  grenades_thrown: number;
  ultimates_used: number;
  tacticals_used: number;
  damage_taken: number;
  score: number;
  characters: string;
  games_played: number;
}
