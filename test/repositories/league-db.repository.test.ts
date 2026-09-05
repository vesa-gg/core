import { LeagueDbRepository } from "../../src/repositories/league-db.repository";
import {
  RosterChangeData,
  SignupData,
  SubRequestData,
} from "../../src/repositories/league-data.repository";
import {
  PlayerRank,
  Platform,
  SheetsPlayer,
  VesaDivision,
} from "../../src/models/league-models";
import { DiscordUserRef } from "../../src/types/discord-ref";
import { DbMock } from "../mocks/db.mock";
import { Player } from "../../src/models/Player";
import { LeagueTeamPlayerInsert } from "../../src/db/table.interfaces";
import { OverstatService } from "../../src/services/overstat";
import { provideMagickalMock } from "../mocks/magickal-mock";
import SpyInstance = jest.SpyInstance;

describe("LeagueDbRepository", () => {
  let mockDb: DbMock;
  let repo: LeagueDbRepository;
  let getActiveLeagueSeasonSpy: SpyInstance;
  let insertPlayersSpy: SpyInstance;
  let insertLeagueSignupSpy: SpyInstance;
  let getLeagueTeamIdByNameSpy: SpyInstance;
  let insertLeagueSubRequestSpy: SpyInstance;
  let insertLeagueRosterChangeSpy: SpyInstance;
  let getLeagueRosterMapSpy: SpyInstance;

  const activeSeason = {
    id: "season-uuid",
    signupPrioEndDate: "2025-12-25T00:00:00Z",
    startDate: "2026-01-01T00:00:00Z",
    signupSheet: {
      spreadsheetId: "sheet_id",
      tabName: "tab",
      rangeStart: "A1",
    },
    subSheet: {
      spreadsheetId: "sub_id",
      tabName: "sub_tab",
      rangeStart: "A1",
    },
    rosterChangeSheet: {
      spreadsheetId: "roster_id",
      tabName: "roster_tab",
      rangeStart: "A1",
    },
    rosterSheet: null,
  };

  const dbPlayer1: Player = {
    id: "p1-uuid",
    discordId: "player1id",
    displayName: "Player 1",
    overstatId: "111",
  };
  const dbPlayer2: Player = {
    id: "p2-uuid",
    discordId: "player2id",
    displayName: "Player 2",
    overstatId: "222",
  };
  const dbPlayer3: Player = {
    id: "p3-uuid",
    discordId: "player3id",
    displayName: "Player 3",
  };

  const player1: SheetsPlayer = {
    name: "Player 1",
    discordId: "player1id",
    elo: undefined,
    rank: PlayerRank.Bronze,
    previous_season_vesa_division: VesaDivision.Division1,
    platform: Platform.pc,
    overstatLink: "https://overstat.gg/player/111/overview",
  };
  const player2: SheetsPlayer = {
    name: "Player 2",
    discordId: "player2id",
    elo: undefined,
    rank: PlayerRank.Silver,
    previous_season_vesa_division: VesaDivision.Division2,
    platform: Platform.playstation,
    overstatLink: "https://overstat.gg/player/222/overview",
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

  const signupData: SignupData = {
    teamName: "Team Alpha",
    teamNoDays: "Mondays",
    teamCompKnowledge: "2 days a week, 2 years, EEC",
    player1,
    player2,
    player3,
    additionalComments: "Some comments",
  };

  beforeEach(() => {
    mockDb = new DbMock();
    const overstatService = provideMagickalMock(OverstatService);
    jest
      .spyOn(overstatService, "validateLinkUrl")
      .mockImplementation((link) => {
        const match = link.match(/\/player\/([0-9]+)\//);
        if (!match) throw new Error("Not a valid overstat link");
        return match[1];
      });
    repo = new LeagueDbRepository(mockDb, overstatService);

    getActiveLeagueSeasonSpy = jest
      .spyOn(mockDb, "getActiveLeagueSeason")
      .mockResolvedValue(activeSeason);

    insertPlayersSpy = jest
      .spyOn(mockDb, "insertPlayers")
      .mockResolvedValue([dbPlayer1, dbPlayer2, dbPlayer3]);

    insertLeagueSignupSpy = jest
      .spyOn(mockDb, "insertLeagueSignup")
      .mockResolvedValue({ teamId: "team-uuid", signupNumber: 1 });

    getLeagueTeamIdByNameSpy = jest
      .spyOn(mockDb, "getLeagueTeamIdByName")
      .mockResolvedValue(null);

    insertLeagueSubRequestSpy = jest
      .spyOn(mockDb, "insertLeagueSubRequest")
      .mockResolvedValue("sub-uuid");

    insertLeagueRosterChangeSpy = jest
      .spyOn(mockDb, "insertLeagueRosterChange")
      .mockResolvedValue("rc-uuid");

    getLeagueRosterMapSpy = jest
      .spyOn(mockDb, "getLeagueRosterMap")
      .mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("writeSignup", () => {
    it("Should call insertPlayers with all three players and extracted overstat IDs", async () => {
      await repo.writeSignup(signupData);

      expect(insertPlayersSpy).toHaveBeenCalledTimes(1);
      expect(insertPlayersSpy).toHaveBeenCalledWith([
        {
          discordId: "player1id",
          displayName: "Player 1",
          overstatId: "111",
          elo: undefined,
        },
        {
          discordId: "player2id",
          displayName: "Player 2",
          overstatId: "222",
          elo: undefined,
        },
        {
          discordId: "player3id",
          displayName: "Player 3",
          overstatId: undefined,
          elo: undefined,
        },
      ]);
    });

    it("Should call insertLeagueSignup with correct team and player data", async () => {
      await repo.writeSignup(signupData);

      const expectedPlayers: LeagueTeamPlayerInsert[] = [
        {
          playerId: "p1-uuid",
          slot: 1,
          apexRank: "Bronze",
          platform: "pc",
          prevSeasonDivision: "Division1",
          elo: null,
        },
        {
          playerId: "p2-uuid",
          slot: 2,
          apexRank: "Silver",
          platform: "playstation",
          prevSeasonDivision: "Division2",
          elo: null,
        },
        {
          playerId: "p3-uuid",
          slot: 3,
          apexRank: "Gold",
          platform: "xbox",
          prevSeasonDivision: "None",
          elo: null,
        },
      ];

      expect(insertLeagueSignupSpy).toHaveBeenCalledWith(
        "season-uuid",
        {
          teamName: "Team Alpha",
          daysUnableToPlay: "Mondays",
          compKnowledge: "2 days a week, 2 years, EEC",
          additionalComments: "Some comments",
        },
        expectedPlayers,
      );
    });

    it("Should return the signupNumber from insertLeagueSignup", async () => {
      insertLeagueSignupSpy.mockResolvedValue({
        teamId: "team-uuid",
        signupNumber: 5,
      });

      const result = await repo.writeSignup(signupData);

      expect(result?.rowNumber).toBe(5);
    });

    it("Should return correct seasonInfo", async () => {
      const result = await repo.writeSignup(signupData);

      expect(result?.seasonInfo).toEqual({
        signupPrioEndDate: "2025-12-25T00:00:00Z",
        startDate: "2026-01-01T00:00:00Z",
      });
    });

    it("Should pass null for additionalComments when empty string", async () => {
      const dataWithNoComments: SignupData = {
        ...signupData,
        additionalComments: "",
      };

      await repo.writeSignup(dataWithNoComments);

      const teamArg = insertLeagueSignupSpy.mock.calls[0][1];
      expect(teamArg.additionalComments).toBeNull();
    });

    it("Should throw if no active season", async () => {
      getActiveLeagueSeasonSpy.mockResolvedValueOnce(null);

      await expect(repo.writeSignup(signupData)).rejects.toThrow(
        "No season found with active signups.",
      );
    });
  });

  describe("writeSubRequest", () => {
    const playerOut = {
      name: "Player Out",
      discordId: "playeroutid",
      overstatLink: "https://overstat.gg/player/999/overview",
    };
    const playerIn = {
      name: "Player In",
      discordId: "playerinid",
      overstatLink: undefined,
    };
    const commandUser: DiscordUserRef = {
      id: "commanderid",
      displayName: "Commander",
    };

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

    const dbPlayerOut: Player = {
      id: "out-uuid",
      discordId: "playeroutid",
      displayName: "Player Out",
    };
    const dbPlayerIn: Player = {
      id: "in-uuid",
      discordId: "playerinid",
      displayName: "Player In",
    };
    const dbCommandUser: Player = {
      id: "cmd-uuid",
      discordId: "commanderid",
      displayName: "Commander",
    };

    beforeEach(() => {
      insertPlayersSpy
        .mockReset()
        .mockResolvedValue([dbPlayerOut, dbPlayerIn, dbCommandUser]);
    });

    it("Should call insertPlayers with playerOut, playerIn, and commandUser", async () => {
      await repo.writeSubRequest(subRequestData);

      expect(insertPlayersSpy).toHaveBeenCalledTimes(1);
      expect(insertPlayersSpy).toHaveBeenCalledWith([
        {
          discordId: "playeroutid",
          displayName: "Player Out",
          overstatId: "999",
        },
        {
          discordId: "playerinid",
          displayName: "Player In",
          overstatId: undefined,
        },
        { discordId: "commanderid", displayName: "Commander" },
      ]);
    });

    it("Should call getLeagueTeamIdByName to resolve team_id", async () => {
      await repo.writeSubRequest(subRequestData);

      expect(getLeagueTeamIdByNameSpy).toHaveBeenCalledWith(
        "season-uuid",
        "Dude Cube",
      );
    });

    it("Should call insertLeagueSubRequest with resolved team_id when team exists", async () => {
      getLeagueTeamIdByNameSpy.mockResolvedValueOnce("known-team-uuid");

      await repo.writeSubRequest(subRequestData);

      expect(insertLeagueSubRequestSpy).toHaveBeenCalledWith({
        seasonId: "season-uuid",
        teamId: "known-team-uuid",
        teamName: "Dude Cube",
        division: "Division4",
        weekNumber: "Week1",
        playerOutId: "out-uuid",
        playerInId: "in-uuid",
        playerInDivision: "Division2",
        requestedById: "cmd-uuid",
        additionalComments: "Some comments",
      });
    });

    it("Should call insertLeagueSubRequest with team_id null when team is not found", async () => {
      getLeagueTeamIdByNameSpy.mockResolvedValueOnce(null);

      await repo.writeSubRequest(subRequestData);

      const insertArg = insertLeagueSubRequestSpy.mock.calls[0][0];
      expect(insertArg.teamId).toBeNull();
      expect(insertArg.teamName).toBe("Dude Cube");
    });

    it("Should return rowNumber null and null url/tabName", async () => {
      const result = await repo.writeSubRequest(subRequestData);

      expect(result).toEqual({ rowNumber: null, url: null, tabName: null });
    });

    it("Should throw if no active season", async () => {
      getActiveLeagueSeasonSpy.mockResolvedValueOnce(null);

      await expect(repo.writeSubRequest(subRequestData)).rejects.toThrow(
        "No season found with active signups.",
      );
    });
  });

  describe("writeRosterChange", () => {
    const playerOut = {
      name: "Player Out",
      discordId: "playeroutid",
      overstatLink: "https://overstat.gg/player/999/overview",
    };
    const playerIn = {
      name: "Player In",
      discordId: "playerinid",
      overstatLink: undefined,
    };
    const commandUser: DiscordUserRef = {
      id: "commanderid",
      displayName: "Commander",
    };

    const rosterChangeData: RosterChangeData = {
      teamDivision: "Division4",
      teamName: "Dude Cube",
      playerOut,
      playerIn,
      commandUser,
      additionalComments: "Some comments",
    };

    const dbPlayerOut: Player = {
      id: "out-uuid",
      discordId: "playeroutid",
      displayName: "Player Out",
    };
    const dbPlayerIn: Player = {
      id: "in-uuid",
      discordId: "playerinid",
      displayName: "Player In",
    };
    const dbCommandUser: Player = {
      id: "cmd-uuid",
      discordId: "commanderid",
      displayName: "Commander",
    };

    beforeEach(() => {
      insertPlayersSpy
        .mockReset()
        .mockResolvedValue([dbPlayerOut, dbPlayerIn, dbCommandUser]);
    });

    it("Should call insertLeagueRosterChange with correct fields", async () => {
      getLeagueTeamIdByNameSpy.mockResolvedValueOnce("known-team-uuid");

      await repo.writeRosterChange(rosterChangeData);

      expect(insertLeagueRosterChangeSpy).toHaveBeenCalledWith({
        seasonId: "season-uuid",
        teamId: "known-team-uuid",
        teamName: "Dude Cube",
        division: "Division4",
        playerOutId: "out-uuid",
        playerInId: "in-uuid",
        requestedById: "cmd-uuid",
        additionalComments: "Some comments",
      });
    });

    it("Should call insertLeagueRosterChange with team_id null when team is not found", async () => {
      getLeagueTeamIdByNameSpy.mockResolvedValueOnce(null);

      await repo.writeRosterChange(rosterChangeData);

      const insertArg = insertLeagueRosterChangeSpy.mock.calls[0][0];
      expect(insertArg.teamId).toBeNull();
    });

    it("Should return rowNumber null and null url/tabName", async () => {
      const result = await repo.writeRosterChange(rosterChangeData);

      expect(result).toEqual({ rowNumber: null, url: null, tabName: null });
    });

    it("Should throw if no active season", async () => {
      getActiveLeagueSeasonSpy.mockResolvedValueOnce(null);

      await expect(repo.writeRosterChange(rosterChangeData)).rejects.toThrow(
        "No season found with active signups.",
      );
    });
  });

  describe("getRosterDiscordIds", () => {
    it("Should call getLeagueRosterMap with the active season id", async () => {
      await repo.getRosterDiscordIds();

      expect(getLeagueRosterMapSpy).toHaveBeenCalledWith("season-uuid");
    });

    it("Should return the map from getLeagueRosterMap", async () => {
      const expectedMap = new Map([
        ["alpha1", "Team Alpha"],
        ["alpha2", "Team Alpha"],
        ["beta1", "Team Beta"],
      ]);
      getLeagueRosterMapSpy.mockResolvedValueOnce(expectedMap);

      const result = await repo.getRosterDiscordIds();

      expect(result).toBe(expectedMap);
    });

    it("Should return empty map when no active season", async () => {
      getActiveLeagueSeasonSpy.mockResolvedValueOnce(null);

      const result = await repo.getRosterDiscordIds();

      expect(result.size).toBe(0);
      expect(getLeagueRosterMapSpy).not.toHaveBeenCalled();
    });
  });
});
