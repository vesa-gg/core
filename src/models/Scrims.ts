import { Player } from "./Player";

export enum ScrimType {
  regular = "regular",
  tournament = "tournament",
  league = "league",
}

export function parseScrimType(value: string): ScrimType {
  return Object.values(ScrimType).includes(value as ScrimType)
    ? (value as ScrimType)
    : ScrimType.regular;
}

export interface Scrim {
  id: string;
  dateTime: Date;
  discordChannel: string;
  active: boolean;
  overstatId?: string;
  scrimType: ScrimType;
}

export interface ScrimSignup {
  teamName: string;
  players: Player[];
  signupId: string;
  signupPlayer: Player;
  prio?: {
    amount: number;
    reasons: string;
  };
  date: Date;
}
