import { DiscordUserRef } from "../types/discord-ref";
import { LeaguePlayer, SheetsPlayer } from "../models/league-models";

export interface SignupData {
  teamName: string;
  teamNoDays: string;
  teamCompKnowledge: string;
  player1: SheetsPlayer;
  player2: SheetsPlayer;
  player3: SheetsPlayer;
  additionalComments: string;
}

export interface SignupResult {
  rowNumber: number | null;
  seasonInfo: {
    signupPrioEndDate: string;
    startDate: string;
  };
}

export interface SubRequestData {
  teamDivision: string;
  teamName: string;
  weekNumber: string;
  playerOut: LeaguePlayer;
  playerIn: LeaguePlayer;
  playerInDivision: string;
  commandUser: DiscordUserRef;
  additionalComments: string;
}

export interface RosterChangeData {
  teamDivision: string;
  teamName: string;
  playerOut: LeaguePlayer;
  playerIn: LeaguePlayer;
  commandUser: DiscordUserRef;
  additionalComments: string;
}

export interface WriteResult {
  rowNumber: number | null;
  url: string | null;
  tabName: string | null;
}

export interface LeagueDataRepository {
  getRosterDiscordIds(): Promise<Map<string, string>>;
  writeSignup(data: SignupData): Promise<SignupResult | null>;
  writeSubRequest(data: SubRequestData): Promise<WriteResult>;
  writeRosterChange(data: RosterChangeData): Promise<WriteResult>;
}
