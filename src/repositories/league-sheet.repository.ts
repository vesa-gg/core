import { OAuth2Client } from "googleapis-common";
import { GoogleAuth, AnyAuthClient } from "google-auth-library";
import { auth, sheets } from "@googleapis/sheets";
import { SheetHelper } from "../utility/sheet-helper";
import { DB } from "../db/db";
import {
  LeaguePlayer,
  PlayerRank,
  Platform,
  SheetsPlayer,
  VesaDivision,
} from "../models/league-models";
import {
  LeagueDataRepository,
  RosterChangeData,
  SignupData,
  SignupResult,
  SubRequestData,
  WriteResult,
} from "./league-data.repository";

export class LeagueSheetRepository implements LeagueDataRepository {
  constructor(private db: DB) {}

  async writeSignup(data: SignupData): Promise<SignupResult | null> {
    const {
      teamName,
      teamNoDays,
      teamCompKnowledge,
      player1,
      player2,
      player3,
      additionalComments,
    } = data;

    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason) {
      throw new Error("No season found with active signups.");
    }
    const authClient = await this.getAuthClient();

    const returningPlayersCount = [player1, player2, player3].reduce(
      (count, player) => {
        if (player.previous_season_vesa_division !== VesaDivision.None) {
          return count + 1;
        } else {
          return count;
        }
      },
      0,
    );

    const values = [
      [
        new Date().toISOString(),
        teamName,
        teamNoDays,
        teamCompKnowledge,
        `${returningPlayersCount} returning players`,
        ...this.convertSheetsPlayer(player1),
        ...this.convertSheetsPlayer(player2),
        ...this.convertSheetsPlayer(player3),
        additionalComments,
      ],
    ];

    const sheetsClient = sheets({ version: "v4" });
    const request = SheetHelper.BUILD_REQUEST(
      values,
      authClient as OAuth2Client,
      this.toSheetRange(activeSeason.signupSheet),
    );

    const response = await sheetsClient.spreadsheets.values.append(request);
    const rowNumber = SheetHelper.GET_ROW_NUMBER_FROM_UPDATE_RESPONSE(
      response.data.updates,
    );

    if (rowNumber === null) {
      return null;
    }

    return {
      rowNumber: rowNumber - SheetHelper.STARTING_CELL_OFFSET,
      seasonInfo: {
        signupPrioEndDate: activeSeason.signupPrioEndDate,
        startDate: activeSeason.startDate,
      },
    };
  }

  async writeSubRequest(data: SubRequestData): Promise<WriteResult> {
    const {
      teamDivision,
      teamName,
      weekNumber,
      playerOut,
      playerIn,
      playerInDivision,
      commandUser,
      additionalComments,
    } = data;

    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason) {
      throw new Error("No season found with active signups.");
    }
    const authClient = await this.getAuthClient();

    const values = [
      [
        new Date().toISOString(),
        teamDivision,
        teamName,
        weekNumber,
        ...this.convertSubRequestPlayer(playerOut),
        ...this.convertSubRequestPlayer(playerIn),
        playerInDivision,
        additionalComments,
        `${commandUser.displayName} (${commandUser.id})`,
      ],
    ];

    // tab name is derived from the division rather than subSheet.tabName, which is a single static value
    const tabName = `DIV ${teamDivision.replace("Division", "")} Log`;
    const request = SheetHelper.BUILD_REQUEST(
      values,
      authClient as OAuth2Client,
      {
        id: activeSeason.subSheet.spreadsheetId,
        range: `${tabName}!${activeSeason.subSheet.rangeStart}`,
      },
    );

    const sheetsClient = sheets({ version: "v4" });
    const response = await sheetsClient.spreadsheets.values.append(request);
    const rowNumber = SheetHelper.GET_ROW_NUMBER_FROM_UPDATE_RESPONSE(
      response.data.updates,
    );

    return {
      rowNumber: rowNumber ?? null,
      url: `https://docs.google.com/spreadsheets/d/${activeSeason.subSheet.spreadsheetId}`,
      tabName,
    };
  }

  async writeRosterChange(data: RosterChangeData): Promise<WriteResult> {
    const {
      teamDivision,
      teamName,
      playerOut,
      playerIn,
      commandUser,
      additionalComments,
    } = data;

    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason) {
      throw new Error("No season found with active signups.");
    }
    const authClient = await this.getAuthClient();

    const values = [
      [
        new Date().toISOString(),
        teamDivision,
        teamName,
        ...this.convertSubRequestPlayer(playerOut),
        ...this.convertSubRequestPlayer(playerIn),
        additionalComments,
        `${commandUser.displayName} (${commandUser.id})`,
      ],
    ];

    const request = SheetHelper.BUILD_REQUEST(
      values,
      authClient as OAuth2Client,
      this.toSheetRange(activeSeason.rosterChangeSheet),
    );

    const sheetsClient = sheets({ version: "v4" });
    const response = await sheetsClient.spreadsheets.values.append(request);
    const rowNumber = SheetHelper.GET_ROW_NUMBER_FROM_UPDATE_RESPONSE(
      response.data.updates,
    );

    return {
      rowNumber: rowNumber ?? null,
      url: `https://docs.google.com/spreadsheets/d/${activeSeason.rosterChangeSheet.spreadsheetId}`,
      tabName: activeSeason.rosterChangeSheet.tabName,
    };
  }

  async getRosterDiscordIds(): Promise<Map<string, string>> {
    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason?.rosterSheet) {
      return new Map();
    }

    const { spreadsheetId } = activeSeason.rosterSheet;
    const authClient = await this.getAuthClient();
    const sheetsClient = sheets({ version: "v4" });

    const metadata = await sheetsClient.spreadsheets.get({
      spreadsheetId,
      auth: authClient as OAuth2Client,
      fields: "sheets.properties.title",
    });

    const divTabs = (metadata.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((title): title is string => !!title && /^DIV \d+$/.test(title));

    const rosterMap = new Map<string, string>();

    for (const tab of divTabs) {
      const response = await sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: `${tab}!A2:J`,
        auth: authClient as OAuth2Client,
      });

      for (const row of response.data.values ?? []) {
        const teamName = row[0];
        if (!teamName) continue;
        const p1Id = row[3];
        const p2Id = row[6];
        const p3Id = row[9];
        if (p1Id) rosterMap.set(p1Id, teamName);
        if (p2Id) rosterMap.set(p2Id, teamName);
        if (p3Id) rosterMap.set(p3Id, teamName);
      }
    }

    return rosterMap;
  }

  private toSheetRange(sheet: {
    spreadsheetId: string;
    tabName: string;
    rangeStart: string;
  }): { id: string; range: string } {
    return {
      id: sheet.spreadsheetId,
      range: `${sheet.tabName}!${sheet.rangeStart}`,
    };
  }

  private convertSheetsPlayer(player: SheetsPlayer): (string | number)[] {
    return [
      player.name,
      player.discordId,
      player.overstatLink ?? "No overstat",
      VesaDivision[player.previous_season_vesa_division],
      PlayerRank[player.rank],
      Platform[player.platform],
      player.elo ?? "No elo on record",
    ];
  }

  private convertSubRequestPlayer(player: LeaguePlayer): (string | number)[] {
    return [
      `${player.name} (${player.discordId})`,
      player.overstatLink ?? "No overstat",
    ];
  }

  private getAuthClient(): Promise<AnyAuthClient> {
    const googleAuth = new auth.GoogleAuth({
      keyFile: "service-account-key.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }) as unknown as GoogleAuth;

    return googleAuth.getClient();
  }
}
