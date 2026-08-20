import { DiscordUserRef } from "../../src/types/discord-ref";
import { AlertSink } from "../../src/types/notifications";
import { Player, PlayerInsert } from "../../src/models/Player";
import { PrioService } from "../../src/services/prio";
import { DbMock } from "../mocks/db.mock";
import SpyInstance = jest.SpyInstance;
import { Scrim, ScrimSignup, ScrimType } from "../../src/models/Scrims";
import { LeagueService } from "../../src/services/league";
import { provideMagickalMock } from "../mocks/magickal-mock";

describe("Prio", () => {
  let prioService: PrioService;
  let dbMock: DbMock;
  let leagueServiceMock: LeagueService;
  let alertServiceMock: jest.Mocked<AlertSink>;
  let dbInsertPlayerSpy: SpyInstance<
    Promise<Player[]>,
    [players: PlayerInsert[]],
    string
  >;
  let setPlayerSpy: SpyInstance<
    void,
    [playerId: string, player: Player],
    string
  >;
  const player: Player = {
    discordId: "discordId",
    displayName: "mockPlayer",
    id: "dbId",
  };
  const prioUser: DiscordUserRef = {
    id: "discordId",
    displayName: "mockUserName",
  };

  beforeEach(() => {
    dbMock = new DbMock();
    leagueServiceMock = provideMagickalMock(LeagueService);
    alertServiceMock = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    prioService = new PrioService(dbMock, leagueServiceMock, alertServiceMock);
    dbInsertPlayerSpy = jest.spyOn(dbMock, "insertPlayers");
    dbInsertPlayerSpy.mockReturnValue(Promise.resolve([player]));
  });

  describe("setPlayerPrio()", () => {
    const startDate = new Date();
    const endDate = new Date();
    const amount = 1;
    const reason = "inting on peoples foreheads";

    describe("correctly set prio", () => {
      let insertSpy: SpyInstance<
        Promise<Player[]>,
        [players: PlayerInsert[]],
        string
      >;
      let dbSetPrioSpy: SpyInstance<
        Promise<string[]>,
        [
          playerIds: string[],
          startDate: Date,
          endDate: Date,
          amount: number,
          reason: string,
        ],
        string
      >;

      beforeEach(() => {
        dbSetPrioSpy = jest.spyOn(dbMock, "setPrio");
        dbSetPrioSpy.mockClear();
      });

      it("should set prio for players", async () => {
        dbInsertPlayerSpy.mockClear();
        await prioService.setPlayerPrio(
          [prioUser],
          startDate,
          endDate,
          amount,
          reason,
        );
        expect(dbSetPrioSpy).toHaveBeenCalledWith(
          [player.id],
          startDate,
          endDate,
          amount,
          reason,
        );
        expect(dbInsertPlayerSpy).toHaveBeenCalledWith([
          {
            discordId: prioUser.id,
            displayName: prioUser.displayName,
          },
        ]);
      });
    });
  });

  describe("getTeamPrioForScrim - league type", () => {
    const leagueScrim: Scrim = {
      scrimType: ScrimType.league,
      dateTime: new Date(),
    } as Scrim;

    const makePlayer = (discordId: string): Player => ({
      discordId,
      displayName: discordId,
      id: discordId,
    });

    const makeTeam = (discordIds: [string, string, string]): ScrimSignup => ({
      date: new Date(),
      players: [
        makePlayer(discordIds[0]),
        makePlayer(discordIds[1]),
        makePlayer(discordIds[2]),
      ],
      signupId: "",
      signupPlayer: makePlayer(""),
      teamName: "",
    });

    it("should assign tier 5 when all 3 on same league team", async () => {
      jest
        .spyOn(leagueServiceMock, "getRosterDiscordIds")
        .mockResolvedValueOnce(
          new Map([
            ["alpha1", "Alpha"],
            ["alpha2", "Alpha"],
            ["alpha3", "Alpha"],
          ]),
        );
      const team = makeTeam(["alpha1", "alpha2", "alpha3"]);
      await prioService.getTeamPrioForScrim(leagueScrim, [team], []);
      expect(team.prio).toEqual({
        amount: 5,
        reasons: "3/3 players from Alpha",
      });
    });

    it("should assign tier 4 when 2 on same team and 1 on different league team", async () => {
      jest
        .spyOn(leagueServiceMock, "getRosterDiscordIds")
        .mockResolvedValueOnce(
          new Map([
            ["alpha1", "Alpha"],
            ["alpha2", "Alpha"],
            ["beta1", "Beta"],
          ]),
        );
      const team = makeTeam(["alpha1", "alpha2", "beta1"]);
      await prioService.getTeamPrioForScrim(leagueScrim, [team], []);
      expect(team.prio).toEqual({
        amount: 4,
        reasons: "2/3 players from Alpha, 1 from Beta",
      });
    });

    it("should assign tier 3 when 2 on same team and 1 not in league", async () => {
      jest
        .spyOn(leagueServiceMock, "getRosterDiscordIds")
        .mockResolvedValueOnce(
          new Map([
            ["alpha1", "Alpha"],
            ["alpha2", "Alpha"],
          ]),
        );
      const team = makeTeam(["alpha1", "alpha2", "outsider"]);
      await prioService.getTeamPrioForScrim(leagueScrim, [team], []);
      expect(team.prio).toEqual({
        amount: 3,
        reasons: "2/3 players from Alpha, 1 not in league",
      });
    });

    it("should assign tier 2 when all 3 on different league teams", async () => {
      jest
        .spyOn(leagueServiceMock, "getRosterDiscordIds")
        .mockResolvedValueOnce(
          new Map([
            ["alpha1", "Alpha"],
            ["beta1", "Beta"],
            ["gamma1", "Gamma"],
          ]),
        );
      const team = makeTeam(["alpha1", "beta1", "gamma1"]);
      await prioService.getTeamPrioForScrim(leagueScrim, [team], []);
      expect(team.prio).toEqual({
        amount: 2,
        reasons:
          "all 3 players from different league teams: Alpha, Beta, Gamma",
      });
    });

    it("should assign tier 1 when fewer than 2 on same league team", async () => {
      jest
        .spyOn(leagueServiceMock, "getRosterDiscordIds")
        .mockResolvedValueOnce(
          new Map([
            ["alpha1", "Alpha"],
            ["beta1", "Beta"],
          ]),
        );
      const team = makeTeam(["alpha1", "beta1", "outsider"]);
      await prioService.getTeamPrioForScrim(leagueScrim, [team], []);
      expect(team.prio).toEqual({
        amount: 1,
        reasons: "fewer than 2 players from same league team",
      });
    });

    it("should override to low prio when a player has low prio, ignoring league tier", async () => {
      jest
        .spyOn(leagueServiceMock, "getRosterDiscordIds")
        .mockResolvedValueOnce(
          new Map([
            ["alpha1", "Alpha"],
            ["alpha2", "Alpha"],
            ["alpha3", "Alpha"],
          ]),
        );
      const team = makeTeam(["alpha1", "alpha2", "alpha3"]);
      team.players[2].displayName = "BadBoi";
      jest.spyOn(dbMock, "getPrio").mockResolvedValueOnce([
        {
          id: "alpha3",
          discordId: "alpha3",
          amount: -1,
          reason: "griefing",
        },
      ]);
      await prioService.getTeamPrioForScrim(leagueScrim, [team], []);
      expect(team.prio).toEqual({
        amount: -1,
        reasons: "BadBoi: griefing; 3/3 players from Alpha",
      });
    });

    it("should not apply positive regular prio for league scrims", async () => {
      jest
        .spyOn(leagueServiceMock, "getRosterDiscordIds")
        .mockResolvedValueOnce(
          new Map([
            ["alpha1", "Alpha"],
            ["alpha2", "Alpha"],
            ["alpha3", "Alpha"],
          ]),
        );
      const team = makeTeam(["alpha1", "alpha2", "alpha3"]);
      jest.spyOn(dbMock, "getPrio").mockResolvedValueOnce([
        {
          id: "alpha1",
          discordId: "alpha1",
          amount: 1,
          reason: "good behavior",
        },
      ]);
      await prioService.getTeamPrioForScrim(leagueScrim, [team], []);
      // Positive regular prio is ignored; league tier still applies
      expect(team.prio).toEqual({
        amount: 5,
        reasons: "3/3 players from Alpha",
      });
    });
  });

  describe("getTeamPrioForScrim - tournament type", () => {
    it("should not set prio when scrim type is tournament", async () => {
      const tournamentScrim: Scrim = {
        scrimType: ScrimType.tournament,
        dateTime: new Date(),
      } as Scrim;
      const team: ScrimSignup = {
        date: new Date(),
        players: [],
        signupId: "",
        signupPlayer: { id: "", discordId: "", displayName: "" },
        teamName: "",
      };
      await prioService.getTeamPrioForScrim(tournamentScrim, [team], []);
      expect(team.prio).toBeUndefined();
    });
  });

  describe("setTeamPrioForScrim()", () => {
    describe("correctly set prio", () => {
      beforeEach(() => {});

      it("should set low prio for teams from its players", async () => {
        const today = new Date();
        const scrim: Scrim = {
          dateTime: today,
        } as Scrim;
        const lowPrioPlayerOnTeam: Player = {
          discordId: "on team discord id",
          displayName: "Bad Boi",
          id: "1",
        };
        const highPrioPlayerOnTeam: Player = {
          discordId: "on team discord id 2",
          displayName: "Good Boi",
          id: "2",
        };
        const lowPrioPlayerFreeAgent: Player = {
          discordId: "free agent discord id",
          displayName: "free agent",
          id: "3",
        };
        const scrimPassHolder: Player = {
          discordId: "on team discord id 4",
          displayName: "Rich boi",
          id: "4",
        };
        const team: ScrimSignup = {
          date: today,
          players: [lowPrioPlayerOnTeam, highPrioPlayerOnTeam, scrimPassHolder],
          signupId: "",
          signupPlayer: {
            id: "",
            discordId: "",
            displayName: "",
          },
          teamName: "",
        };
        const teams = [team];
        const dbSpy = jest.spyOn(dbMock, "getPrio");
        dbSpy.mockReturnValue(
          // return low prio for 1, and two high prio ticks for another, also return low prio for someone not participating in the scrim
          Promise.resolve([
            {
              id: lowPrioPlayerOnTeam.id,
              discordId: lowPrioPlayerOnTeam.discordId,
              amount: -1,
              reason: "bad boi",
            },
            {
              id: lowPrioPlayerOnTeam.id,
              discordId: lowPrioPlayerOnTeam.discordId,
              amount: 1,
              reason: "Scrim got messed up",
            },
            {
              id: lowPrioPlayerOnTeam.id,
              discordId: lowPrioPlayerOnTeam.discordId,
              amount: -1,
              reason: "bad boi",
            },
            {
              id: highPrioPlayerOnTeam.id,
              discordId: highPrioPlayerOnTeam.discordId,
              amount: 1,
              reason: "good boi",
            },
            {
              id: highPrioPlayerOnTeam.id,
              discordId: highPrioPlayerOnTeam.discordId,
              amount: 1,
              reason: "good boi",
            },
            {
              id: scrimPassHolder.id,
              discordId: scrimPassHolder.discordId,
              amount: 1,
              reason: "good boi",
            },
            {
              id: lowPrioPlayerFreeAgent.id,
              discordId: lowPrioPlayerFreeAgent.discordId,
              amount: -400,
              reason: "SMH Tried to nuke the entire server",
            },
          ]),
        );
        const prioTeams = await prioService.getTeamPrioForScrim(scrim, teams, [
          scrimPassHolder.discordId,
          lowPrioPlayerOnTeam.discordId,
        ]);
        // team should have
        //   +2 prio from the high prio player since they have two +1 prio entries
        //   +1 prio from the scrim pass holder
        //   -1 prio from the low prio player (They have a scrim pass but that is ignored when they have low prio)
        // For a total of +2 prio
        // but with Sly's override one low prio player overrides the whole squad, so -1
        expect(prioTeams).toEqual([
          {
            date: today,
            players: [
              lowPrioPlayerOnTeam,
              highPrioPlayerOnTeam,
              scrimPassHolder,
            ],
            signupId: "",
            signupPlayer: {
              id: "",
              discordId: "",
              displayName: "",
            },
            teamName: "",
            prio: {
              amount: -1,
              reasons:
                "Bad Boi: bad boi, Scrim got messed up, bad boi, Scrim pass; Good Boi: good boi, good boi; Rich boi: good boi, Scrim pass",
            },
          },
        ]);
      });

      it("should set high prio for teams from its players", async () => {
        const today = new Date();
        const scrim: Scrim = {
          dateTime: today,
        } as Scrim;
        const highPrioPlayerOnTeam: Player = {
          discordId: "on team discord id 2",
          displayName: "Good Boi",
          id: "2",
        };
        const lowPrioPlayerFreeAgent: Player = {
          discordId: "free agent discord id",
          displayName: "free agent",
          id: "3",
        };
        const scrimPassHolder: Player = {
          discordId: "on team discord id 4",
          displayName: "Rich boi",
          id: "4",
        };
        const team: ScrimSignup = {
          date: today,
          players: [highPrioPlayerOnTeam, scrimPassHolder],
          signupId: "",
          signupPlayer: {
            id: "",
            discordId: "",
            displayName: "",
          },
          teamName: "",
        };
        const teams = [team];
        const dbSpy = jest.spyOn(dbMock, "getPrio");
        dbSpy.mockReturnValue(
          // return low prio for 1, and two high prio ticks for another, also return low prio for someone not participating in the scrim
          Promise.resolve([
            {
              id: highPrioPlayerOnTeam.id,
              discordId: highPrioPlayerOnTeam.discordId,
              amount: 1,
              reason: "good boi",
            },
            {
              id: highPrioPlayerOnTeam.id,
              discordId: highPrioPlayerOnTeam.discordId,
              amount: 1,
              reason: "good boi",
            },
            {
              id: lowPrioPlayerFreeAgent.id,
              discordId: lowPrioPlayerFreeAgent.discordId,
              amount: -400,
              reason: "SMH Tried to nuke the entire server",
            },
          ]),
        );
        const prioTeams = await prioService.getTeamPrioForScrim(scrim, teams, [
          scrimPassHolder.discordId,
        ]);
        // team should have
        //   +2 prio from the high prio player since they have two +1 prio entries
        //   +1 prio from the scrim pass holder
        // For a total of +3 prio
        // but with Sly's override one prios do not stack so only +1
        expect(prioTeams).toEqual([
          {
            date: today,
            players: [highPrioPlayerOnTeam, scrimPassHolder],
            signupId: "",
            signupPlayer: {
              id: "",
              discordId: "",
              displayName: "",
            },
            teamName: "",
            prio: {
              amount: 1,
              reasons: "Good Boi: good boi, good boi; Rich boi: Scrim pass",
            },
          },
        ]);
      });
    });
  });
});
