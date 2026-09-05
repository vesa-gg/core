import { DiscordUserRef } from "../types/discord-ref";
import { LeaguePlayer, SheetsPlayer } from "../models/league-models";
import {
  LeagueDataRepository,
  SignupResult,
} from "../repositories/league-data.repository";

export { SheetsPlayer, SignupResult };

export class LeagueService {
  constructor(private repository: LeagueDataRepository) {}

  async signup(
    teamName: string,
    teamNoDays: string,
    teamCompKnowledge: string,
    player1: SheetsPlayer,
    player2: SheetsPlayer,
    player3: SheetsPlayer,
    additionalComments: string,
  ): Promise<SignupResult | null> {
    const result = await this.repository.writeSignup({
      teamName,
      teamNoDays,
      teamCompKnowledge,
      player1,
      player2,
      player3,
      additionalComments,
    });
    if (!result || result.rowNumber === null) {
      return null;
    }
    return result;
  }

  async subRequest(
    teamDivision: string,
    teamName: string,
    weekNumber: string,
    playerOut: LeaguePlayer,
    playerIn: LeaguePlayer,
    playerInDivision: string,
    commandUser: DiscordUserRef,
    additionalComments: string,
  ): Promise<{
    rowNumber: number | null;
    sheetUrl: string | null;
    tabName: string | null;
  }> {
    const result = await this.repository.writeSubRequest({
      teamDivision,
      teamName,
      weekNumber,
      playerOut,
      playerIn,
      playerInDivision,
      commandUser,
      additionalComments,
    });
    return {
      rowNumber: result.rowNumber,
      sheetUrl: result.url,
      tabName: result.tabName,
    };
  }

  async rosterChange(
    teamDivision: string,
    teamName: string,
    playerOut: LeaguePlayer,
    playerIn: LeaguePlayer,
    commandUser: DiscordUserRef,
    additionalComments: string,
  ): Promise<{
    rowNumber: number | null;
    sheetUrl: string | null;
    tabName: string | null;
  }> {
    const result = await this.repository.writeRosterChange({
      teamDivision,
      teamName,
      playerOut,
      playerIn,
      commandUser,
      additionalComments,
    });
    return {
      rowNumber: result.rowNumber,
      sheetUrl: result.url,
      tabName: result.tabName,
    };
  }

  async getRosterDiscordIds(): Promise<Map<string, string>> {
    return this.repository.getRosterDiscordIds();
  }
}
