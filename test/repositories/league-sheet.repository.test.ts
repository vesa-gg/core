import { LeagueSheetRepository } from "../../src/repositories/league-sheet.repository";
import {
  SignupData,
  SubRequestData,
  RosterChangeData,
} from "../../src/repositories/league-data.repository";
import {
  LeaguePlayer,
  PlayerRank,
  Platform,
  SheetsPlayer,
  VesaDivision,
} from "../../src/models/league-models";
import { GuildMember } from "discord.js";
import * as GoogleSheets from "@googleapis/sheets";
import { GaxiosResponseWithHTTP2, GoogleAuth } from "googleapis-common";
import { Readable } from "stream";
import { DbMock } from "../mocks/db.mock";
import SpyInstance = jest.SpyInstance;
import Resource$Spreadsheets = GoogleSheets.sheets_v4.Resource$Spreadsheets;
import Sheets = GoogleSheets.sheets_v4.Sheets;
import Params$Resource$Spreadsheets$Values$Append = GoogleSheets.sheets_v4.Params$Resource$Spreadsheets$Values$Append;

class MockGoogleAuth {
  getClient() {
    return undefined;
  }
}

describe("LeagueSheetRepository", () => {
  let googleSheetsRequestSpy: SpyInstance<
    Promise<GaxiosResponseWithHTTP2<Readable>>,
    [request: Params$Resource$Spreadsheets$Values$Append],
    string
  >;
  let googleSheetsSpy: SpyInstance;
  let dbGetActiveLeagueSeasonSpy: SpyInstance;
  let mockDb: DbMock;
  let repo: LeagueSheetRepository;

  const player1: SheetsPlayer = {
    name: "Player 1",
    discordId: "player1id",
    elo: undefined,
    rank: PlayerRank.Bronze,
    previous_season_vesa_division: VesaDivision.Division1,
    platform: Platform.pc,
    overstatLink: "https://overstat.gg/1",
  };

  const player2: SheetsPlayer = {
    name: "Player 2",
    discordId: "player2id",
    elo: undefined,
    rank: PlayerRank.Silver,
    previous_season_vesa_division: VesaDivision.Division2,
    platform: Platform.playstation,
    overstatLink: "https://overstat.gg/2",
  };

  const player3: SheetsPlayer = {
    name: "Player 3",
    discordId: "player3id",
    elo: undefined,
    rank: PlayerRank.Gold,
    previous_season_vesa_division: VesaDivision.None,
    platform: Platform.xbox,
    overstatLink: undefined,
  };

  beforeAll(() => {
    mockDb = new DbMock();
    repo = new LeagueSheetRepository(mockDb);

    const googleValuesMethods = {
      append: (
        request: Params$Resource$Spreadsheets$Values$Append,
      ): Promise<GaxiosResponseWithHTTP2<Readable>> =>
        Promise.resolve({
          data: {
            updates: {
              updatedRange: "'Discord Submittals'!A1:Y1",
            },
            request: "Request data " + request.key,
          },
        } as GaxiosResponseWithHTTP2),
    };
    googleSheetsRequestSpy = jest.spyOn(googleValuesMethods, "append");
    googleSheetsSpy = jest.spyOn(GoogleSheets, "sheets").mockReturnValue({
      spreadsheets: {
        values: googleValuesMethods,
      } as unknown as Resource$Spreadsheets,
    } as Sheets);
    jest
      .spyOn(GoogleSheets.auth, "GoogleAuth")
      .mockReturnValue(new MockGoogleAuth() as unknown as GoogleAuth);

    dbGetActiveLeagueSeasonSpy = jest.spyOn(mockDb, "getActiveLeagueSeason");
    dbGetActiveLeagueSeasonSpy.mockReturnValue(
      Promise.resolve({
        id: "1",
        signupSheet: {
          spreadsheetId: "google_sheet_id",
          tabName: "tab_name",
          rangeStart: "A1",
        },
        subSheet: {
          spreadsheetId: "sub_sheet_id",
          tabName: "DIV 1 Log",
          rangeStart: "A1",
        },
        rosterChangeSheet: {
          spreadsheetId: "roster_sheet_id",
          tabName: "roster_tab_name",
          rangeStart: "A1",
        },
        rosterSheet: {
          spreadsheetId: "league_roster_sheet_id",
          tabName: "unused",
          rangeStart: "A2",
        },
        signupPrioEndDate: "2025-12-25T00:00:00Z",
        startDate: "2026-01-01T00:00:00Z",
      }),
    );
  });

  beforeEach(() => {
    googleSheetsRequestSpy.mockClear();
    dbGetActiveLeagueSeasonSpy.mockClear();
    googleSheetsSpy.mockClear();
  });

  describe("writeSignup", () => {
    const signupData: SignupData = {
      teamName: "team name",
      teamNoDays: "Mondays",
      teamCompKnowledge: "2 days a week, 2 years, EEC",
      player1,
      player2,
      player3,
      additionalComments: "Additional comments provided by the user",
    };

    it("Should correctly parse and post spreadsheet value", async () => {
      const date = new Date("2025-12-26T18:55:23.264Z");
      jest.useFakeTimers();
      jest.setSystemTime(date);

      const result = await repo.writeSignup(signupData);

      expect(result?.rowNumber).toBe(0); // Assuming the row number mock returns 1 - 1 = 0
      expect(googleSheetsRequestSpy).toHaveBeenCalledWith({
        auth: undefined,
        range: "tab_name!A1",
        requestBody: {
          values: [
            [
              date.toISOString(),
              "team name",
              "Mondays",
              "2 days a week, 2 years, EEC",
              "2 returning players",
              player1.name,
              player1.discordId,
              player1.overstatLink,
              "Division1",
              "Bronze",
              "pc",
              "No elo on record",
              player2.name,
              player2.discordId,
              player2.overstatLink,
              "Division2",
              "Silver",
              "playstation",
              "No elo on record",
              player3.name,
              player3.discordId,
              "No overstat",
              "None",
              "Gold",
              "xbox",
              "No elo on record",
              "Additional comments provided by the user",
            ],
          ],
        },
        spreadsheetId: "google_sheet_id",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
      });

      jest.useRealTimers();
    });

    it("Should throw error if google did a bad", async () => {
      googleSheetsRequestSpy.mockImplementationOnce(async () => {
        throw Error("Sheets Failure");
      });

      await expect(repo.writeSignup(signupData)).rejects.toThrow(
        "Sheets Failure",
      );
    });

    it("Should throw error if no active league season", async () => {
      dbGetActiveLeagueSeasonSpy.mockReturnValueOnce(Promise.resolve(null));
      await expect(repo.writeSignup(signupData)).rejects.toThrow(
        "No season found with active signups.",
      );
    });

    it("Should return null if response can't be parsed", async () => {
      const localGoogleValueMethods = {
        append: (
          request: Params$Resource$Spreadsheets$Values$Append,
        ): Promise<GaxiosResponseWithHTTP2<Readable>> =>
          Promise.resolve({
            data: {
              updates: {
                updatedRange: "weird unparseable string",
              },
              request: "Request data " + request.key,
            },
          } as GaxiosResponseWithHTTP2),
      };
      googleSheetsSpy.mockReturnValueOnce({
        spreadsheets: {
          values: localGoogleValueMethods,
        } as unknown as Resource$Spreadsheets,
      } as Sheets);

      const result = await repo.writeSignup(signupData);
      expect(result).toBeNull();
    });
  });

  describe("writeSubRequest", () => {
    const playerOut: LeaguePlayer = {
      name: "Player Out",
      discordId: "playeroutid",
      overstatLink: "https://overstat.gg/out",
    };

    const playerIn: LeaguePlayer = {
      name: "Player In",
      discordId: "playerinid",
      overstatLink: undefined,
    };

    const commandUser = {
      displayName: "Commander",
      id: "commanderid",
    } as GuildMember;

    const subRequestData: SubRequestData = {
      teamDivision: "Division4",
      teamName: "Dude Cube",
      weekNumber: "Week1",
      playerOut,
      playerIn,
      playerInDivision: "Division2",
      commandUser,
      additionalComments: "Some comments",
    };

    it("Should correctly parse and post spreadsheet value", async () => {
      const date = new Date("2025-12-26T18:55:23.264Z");
      jest.useFakeTimers();
      jest.setSystemTime(date);

      const result = await repo.writeSubRequest(subRequestData);

      expect(result).toEqual({
        rowNumber: 1,
        url: "https://docs.google.com/spreadsheets/d/sub_sheet_id",
        tabName: "DIV 4 Log",
      });
      expect(googleSheetsRequestSpy).toHaveBeenCalledWith({
        auth: undefined,
        range: "DIV 4 Log!A1",
        requestBody: {
          values: [
            [
              date.toISOString(),
              "Division4",
              "Dude Cube",
              "Week1",
              `${playerOut.name} (${playerOut.discordId})`,
              playerOut.overstatLink,
              `${playerIn.name} (${playerIn.discordId})`,
              "No overstat",
              "Division2",
              "Some comments",
              `${commandUser.displayName} (${commandUser.id})`,
            ],
          ],
        },
        spreadsheetId: "sub_sheet_id",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
      });

      jest.useRealTimers();
    });

    it("Should throw error if google did a bad", async () => {
      googleSheetsRequestSpy.mockImplementationOnce(async () => {
        throw Error("Sheets Failure");
      });

      await expect(repo.writeSubRequest(subRequestData)).rejects.toThrow(
        "Sheets Failure",
      );
    });

    it("Should throw error if no active league season", async () => {
      dbGetActiveLeagueSeasonSpy.mockReturnValueOnce(Promise.resolve(null));

      await expect(repo.writeSubRequest(subRequestData)).rejects.toThrow(
        "No season found with active signups.",
      );
    });

    it("Should return null rowNumber if response can't be parsed", async () => {
      const localGoogleValueMethods = {
        append: (
          request: Params$Resource$Spreadsheets$Values$Append,
        ): Promise<GaxiosResponseWithHTTP2<Readable>> =>
          Promise.resolve({
            data: {
              updates: {
                updatedRange: "weird unparseable string",
              },
              request: "Request data " + request.key,
            },
          } as GaxiosResponseWithHTTP2),
      };
      googleSheetsSpy.mockReturnValueOnce({
        spreadsheets: {
          values: localGoogleValueMethods,
        } as unknown as Resource$Spreadsheets,
      } as Sheets);

      const result = await repo.writeSubRequest(subRequestData);
      expect(result).toEqual({
        rowNumber: null,
        url: "https://docs.google.com/spreadsheets/d/sub_sheet_id",
        tabName: "DIV 4 Log",
      });
    });
  });

  describe("writeRosterChange", () => {
    const playerOut: LeaguePlayer = {
      name: "Player Out",
      discordId: "playeroutid",
      overstatLink: "https://overstat.gg/out",
    };

    const playerIn: LeaguePlayer = {
      name: "Player In",
      discordId: "playerinid",
      overstatLink: undefined,
    };

    const commandUser = {
      displayName: "Commander",
      id: "commanderid",
    } as GuildMember;

    const rosterChangeData: RosterChangeData = {
      teamDivision: "Division4",
      teamName: "Dude Cube",
      playerOut,
      playerIn,
      commandUser,
      additionalComments: "Some comments",
    };

    it("Should correctly parse and post spreadsheet value", async () => {
      const date = new Date("2025-12-26T18:55:23.264Z");
      jest.useFakeTimers();
      jest.setSystemTime(date);

      const result = await repo.writeRosterChange(rosterChangeData);

      expect(result).toEqual({
        rowNumber: 1,
        url: "https://docs.google.com/spreadsheets/d/roster_sheet_id",
        tabName: "roster_tab_name",
      });
      expect(googleSheetsRequestSpy).toHaveBeenCalledWith({
        auth: undefined,
        range: "roster_tab_name!A1",
        requestBody: {
          values: [
            [
              date.toISOString(),
              "Division4",
              "Dude Cube",
              `${playerOut.name} (${playerOut.discordId})`,
              playerOut.overstatLink,
              `${playerIn.name} (${playerIn.discordId})`,
              "No overstat",
              "Some comments",
              `${commandUser.displayName} (${commandUser.id})`,
            ],
          ],
        },
        spreadsheetId: "roster_sheet_id",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
      });

      jest.useRealTimers();
    });

    it("Should throw error if google did a bad", async () => {
      googleSheetsRequestSpy.mockImplementationOnce(async () => {
        throw Error("Sheets Failure");
      });

      await expect(repo.writeRosterChange(rosterChangeData)).rejects.toThrow(
        "Sheets Failure",
      );
    });

    it("Should throw error if no active league season", async () => {
      dbGetActiveLeagueSeasonSpy.mockReturnValueOnce(Promise.resolve(null));

      await expect(repo.writeRosterChange(rosterChangeData)).rejects.toThrow(
        "No season found with active signups.",
      );
    });

    it("Should return null rowNumber if response can't be parsed", async () => {
      const localGoogleValueMethods = {
        append: (
          request: Params$Resource$Spreadsheets$Values$Append,
        ): Promise<GaxiosResponseWithHTTP2<Readable>> =>
          Promise.resolve({
            data: {
              updates: {
                updatedRange: "weird unparseable string",
              },
              request: "Request data " + request.key,
            },
          } as GaxiosResponseWithHTTP2),
      };
      googleSheetsSpy.mockReturnValueOnce({
        spreadsheets: {
          values: localGoogleValueMethods,
        } as unknown as Resource$Spreadsheets,
      } as Sheets);

      const result = await repo.writeRosterChange(rosterChangeData);
      expect(result).toEqual({
        rowNumber: null,
        url: "https://docs.google.com/spreadsheets/d/roster_sheet_id",
        tabName: "roster_tab_name",
      });
    });
  });

  describe("getRosterDiscordIds", () => {
    it("Should return roster map built from all DIV tabs", async () => {
      const mockGetSpreadsheet = jest.fn().mockResolvedValue({
        data: {
          sheets: [
            { properties: { title: "DIV 1" } },
            { properties: { title: "DIV 2" } },
            { properties: { title: "Not a div" } },
          ],
        },
      });
      const mockGetValues = jest
        .fn()
        .mockResolvedValueOnce({
          data: {
            values: [
              [
                "Team Alpha",
                "captainDiscord",
                "P1Name",
                "alpha1",
                "os1",
                "P2Name",
                "alpha2",
                "os2",
                "P3Name",
                "alpha3",
                "os3",
              ],
              [
                "Team Beta",
                "captainDiscord2",
                "P4Name",
                "beta1",
                "os4",
                "P5Name",
                "beta2",
                "os5",
                "P6Name",
                "beta3",
                "os6",
              ],
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            values: [
              [
                "Team Gamma",
                "captainDiscord3",
                "P7Name",
                "gamma1",
                "os7",
                "P8Name",
                "gamma2",
                "os8",
                "P9Name",
                "gamma3",
                "os9",
              ],
            ],
          },
        });
      googleSheetsSpy.mockReturnValueOnce({
        spreadsheets: {
          get: mockGetSpreadsheet,
          values: {
            append: googleSheetsRequestSpy,
            get: mockGetValues,
          },
        } as unknown as Resource$Spreadsheets,
      } as Sheets);

      const result = await repo.getRosterDiscordIds();

      expect(result.get("alpha1")).toBe("Team Alpha");
      expect(result.get("alpha2")).toBe("Team Alpha");
      expect(result.get("alpha3")).toBe("Team Alpha");
      expect(result.get("beta1")).toBe("Team Beta");
      expect(result.get("beta2")).toBe("Team Beta");
      expect(result.get("beta3")).toBe("Team Beta");
      expect(result.get("gamma1")).toBe("Team Gamma");
      expect(result.get("gamma2")).toBe("Team Gamma");
      expect(result.get("gamma3")).toBe("Team Gamma");
      expect(result.size).toBe(9);
      expect(mockGetSpreadsheet).toHaveBeenCalledWith({
        spreadsheetId: "league_roster_sheet_id",
        auth: undefined,
        fields: "sheets.properties.title",
      });
      expect(mockGetValues).toHaveBeenCalledWith({
        spreadsheetId: "league_roster_sheet_id",
        range: "DIV 1!A2:J",
        auth: undefined,
      });
      expect(mockGetValues).toHaveBeenCalledWith({
        spreadsheetId: "league_roster_sheet_id",
        range: "DIV 2!A2:J",
        auth: undefined,
      });
    });

    it("Should return empty map when no roster sheet configured", async () => {
      dbGetActiveLeagueSeasonSpy.mockReturnValueOnce(
        Promise.resolve({
          id: "1",
          signupSheet: {
            spreadsheetId: "google_sheet_id",
            tabName: "tab_name",
            rangeStart: "A1",
          },
          subSheet: {
            spreadsheetId: "sub_sheet_id",
            tabName: "DIV 1 Log",
            rangeStart: "A1",
          },
          rosterChangeSheet: {
            spreadsheetId: "roster_sheet_id",
            tabName: "roster_tab_name",
            rangeStart: "A1",
          },
          rosterSheet: null,
          signupPrioEndDate: "2025-12-25T00:00:00Z",
          startDate: "2026-01-01T00:00:00Z",
        }),
      );

      const result = await repo.getRosterDiscordIds();
      expect(result.size).toBe(0);
      expect(googleSheetsSpy).not.toHaveBeenCalled();
    });

    it("Should return empty map when no active season", async () => {
      dbGetActiveLeagueSeasonSpy.mockReturnValueOnce(Promise.resolve(null));

      const result = await repo.getRosterDiscordIds();
      expect(result.size).toBe(0);
    });
  });
});
