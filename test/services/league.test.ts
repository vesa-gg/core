import { LeagueService, SheetsPlayer } from "../../src/services/league";
import {
  LeagueDataRepository,
  RosterChangeData,
  SignupData,
  SignupResult,
  SubRequestData,
  WriteResult,
} from "../../src/repositories/league-data.repository";
import {
  LeaguePlayer,
  PlayerRank,
  Platform,
  VesaDivision,
} from "../../src/models/league-models";
import { GuildMember } from "discord.js";

const mockRepository: jest.Mocked<LeagueDataRepository> = {
  writeSignup: jest.fn(),
  writeSubRequest: jest.fn(),
  writeRosterChange: jest.fn(),
  getRosterDiscordIds: jest.fn(),
};

describe("League Service", () => {
  let leagueService: LeagueService;

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

  const seasonInfo = {
    signupPrioEndDate: "2025-12-25T00:00:00Z",
    startDate: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    leagueService = new LeagueService(mockRepository);
    jest.clearAllMocks();
  });

  describe("signup", () => {
    const signupData: SignupData = {
      teamName: "team name",
      teamNoDays: "Mondays",
      teamCompKnowledge: "2 days a week, 2 years, EEC",
      player1,
      player2,
      player3,
      additionalComments: "Additional comments",
    };

    it("Should delegate to repository.writeSignup with correct args", async () => {
      const repoResult: SignupResult = { rowNumber: 5, seasonInfo };
      mockRepository.writeSignup.mockResolvedValueOnce(repoResult);

      const result = await leagueService.signup(
        signupData.teamName,
        signupData.teamNoDays,
        signupData.teamCompKnowledge,
        signupData.player1,
        signupData.player2,
        signupData.player3,
        signupData.additionalComments,
      );

      expect(mockRepository.writeSignup).toHaveBeenCalledWith(signupData);
      expect(result).toEqual(repoResult);
    });

    it("Should return null when repository returns null", async () => {
      mockRepository.writeSignup.mockResolvedValueOnce(null);

      const result = await leagueService.signup(
        signupData.teamName,
        signupData.teamNoDays,
        signupData.teamCompKnowledge,
        signupData.player1,
        signupData.player2,
        signupData.player3,
        signupData.additionalComments,
      );

      expect(result).toBeNull();
    });

    it("Should return null when repository returns rowNumber: null", async () => {
      mockRepository.writeSignup.mockResolvedValueOnce({
        rowNumber: null,
        seasonInfo,
      });

      const result = await leagueService.signup(
        signupData.teamName,
        signupData.teamNoDays,
        signupData.teamCompKnowledge,
        signupData.player1,
        signupData.player2,
        signupData.player3,
        signupData.additionalComments,
      );

      expect(result).toBeNull();
    });

    it("Should propagate errors thrown by the repository", async () => {
      mockRepository.writeSignup.mockRejectedValueOnce(
        new Error("No season found with active signups."),
      );

      await expect(
        leagueService.signup(
          signupData.teamName,
          signupData.teamNoDays,
          signupData.teamCompKnowledge,
          signupData.player1,
          signupData.player2,
          signupData.player3,
          signupData.additionalComments,
        ),
      ).rejects.toThrow("No season found with active signups.");
    });
  });

  describe("subRequest", () => {
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

    it("Should delegate to repository.writeSubRequest and map url to sheetUrl", async () => {
      const repoResult: WriteResult = {
        rowNumber: 3,
        url: "https://docs.google.com/spreadsheets/d/sub_sheet_id",
        tabName: "DIV 4 Log",
      };
      mockRepository.writeSubRequest.mockResolvedValueOnce(repoResult);

      const result = await leagueService.subRequest(
        subRequestData.teamDivision,
        subRequestData.teamName,
        subRequestData.weekNumber,
        subRequestData.playerOut,
        subRequestData.playerIn,
        subRequestData.playerInDivision,
        subRequestData.commandUser,
        subRequestData.additionalComments,
      );

      expect(mockRepository.writeSubRequest).toHaveBeenCalledWith(
        subRequestData,
      );
      expect(result).toEqual({
        rowNumber: 3,
        sheetUrl: "https://docs.google.com/spreadsheets/d/sub_sheet_id",
        tabName: "DIV 4 Log",
      });
    });

    it("Should pass through null rowNumber from repository", async () => {
      mockRepository.writeSubRequest.mockResolvedValueOnce({
        rowNumber: null,
        url: "https://docs.google.com/spreadsheets/d/sub_sheet_id",
        tabName: "DIV 4 Log",
      });

      const result = await leagueService.subRequest(
        subRequestData.teamDivision,
        subRequestData.teamName,
        subRequestData.weekNumber,
        subRequestData.playerOut,
        subRequestData.playerIn,
        subRequestData.playerInDivision,
        subRequestData.commandUser,
        subRequestData.additionalComments,
      );

      expect(result.rowNumber).toBeNull();
    });

    it("Should propagate errors thrown by the repository", async () => {
      mockRepository.writeSubRequest.mockRejectedValueOnce(
        new Error("No season found with active signups."),
      );

      await expect(
        leagueService.subRequest(
          subRequestData.teamDivision,
          subRequestData.teamName,
          subRequestData.weekNumber,
          subRequestData.playerOut,
          subRequestData.playerIn,
          subRequestData.playerInDivision,
          subRequestData.commandUser,
          subRequestData.additionalComments,
        ),
      ).rejects.toThrow("No season found with active signups.");
    });
  });

  describe("rosterChange", () => {
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

    it("Should delegate to repository.writeRosterChange and map url to sheetUrl", async () => {
      const repoResult: WriteResult = {
        rowNumber: 7,
        url: "https://docs.google.com/spreadsheets/d/roster_sheet_id",
        tabName: "roster_tab_name",
      };
      mockRepository.writeRosterChange.mockResolvedValueOnce(repoResult);

      const result = await leagueService.rosterChange(
        rosterChangeData.teamDivision,
        rosterChangeData.teamName,
        rosterChangeData.playerOut,
        rosterChangeData.playerIn,
        rosterChangeData.commandUser,
        rosterChangeData.additionalComments,
      );

      expect(mockRepository.writeRosterChange).toHaveBeenCalledWith(
        rosterChangeData,
      );
      expect(result).toEqual({
        rowNumber: 7,
        sheetUrl: "https://docs.google.com/spreadsheets/d/roster_sheet_id",
        tabName: "roster_tab_name",
      });
    });

    it("Should pass through null rowNumber from repository", async () => {
      mockRepository.writeRosterChange.mockResolvedValueOnce({
        rowNumber: null,
        url: "https://docs.google.com/spreadsheets/d/roster_sheet_id",
        tabName: "roster_tab_name",
      });

      const result = await leagueService.rosterChange(
        rosterChangeData.teamDivision,
        rosterChangeData.teamName,
        rosterChangeData.playerOut,
        rosterChangeData.playerIn,
        rosterChangeData.commandUser,
        rosterChangeData.additionalComments,
      );

      expect(result.rowNumber).toBeNull();
    });

    it("Should propagate errors thrown by the repository", async () => {
      mockRepository.writeRosterChange.mockRejectedValueOnce(
        new Error("No season found with active signups."),
      );

      await expect(
        leagueService.rosterChange(
          rosterChangeData.teamDivision,
          rosterChangeData.teamName,
          rosterChangeData.playerOut,
          rosterChangeData.playerIn,
          rosterChangeData.commandUser,
          rosterChangeData.additionalComments,
        ),
      ).rejects.toThrow("No season found with active signups.");
    });
  });

  describe("getRosterDiscordIds", () => {
    it("Should delegate to repository.getRosterDiscordIds and return the map", async () => {
      const rosterMap = new Map([
        ["player1id", "Team Alpha"],
        ["player2id", "Team Beta"],
      ]);
      mockRepository.getRosterDiscordIds.mockResolvedValueOnce(rosterMap);

      const result = await leagueService.getRosterDiscordIds();

      expect(mockRepository.getRosterDiscordIds).toHaveBeenCalledTimes(1);
      expect(result).toBe(rosterMap);
    });

    it("Should return empty map when repository returns empty map", async () => {
      mockRepository.getRosterDiscordIds.mockResolvedValueOnce(new Map());

      const result = await leagueService.getRosterDiscordIds();

      expect(result.size).toBe(0);
    });
  });
});
