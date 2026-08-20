export enum PlayerRank {
  Bronze,
  Silver,
  Gold,
  Plat,
  LowDiamond,
  HighDiamond,
  Masters,
  Pred,
}

export enum VesaDivision {
  None,
  Division1,
  Division2,
  Division3,
  Division4,
  Division5,
  Division6,
  Division7,
  Division8,
  // Division9,
  // Division10,
}

export enum Platform {
  pc,
  playstation,
  xbox,
  switch,
}

export interface LeaguePlayer {
  name: string;
  discordId: string;
  overstatLink?: string;
}

export interface SheetsPlayer extends LeaguePlayer {
  elo: number | undefined;
  rank: PlayerRank;
  previous_season_vesa_division: VesaDivision;
  platform: Platform;
}
