import { SignupService } from "../../src/services/signups";
import { DbMock } from "../mocks/db.mock";
import { Player } from "../../src/models/Player";
import { DiscordUserRef } from "../../src/types/discord-ref";
import { AlertSink, ScrimNotifier } from "../../src/types/notifications";
import { ScrimType, ScrimSignup } from "../../src/models/Scrims";
import { PrioService } from "../../src/services/prio";
import { ScrimSignupsWithPlayers } from "../../src/db/table.interfaces";
import SpyInstance = jest.SpyInstance;
import { AuthService } from "../../src/services/auth";
import { BanService } from "../../src/services/ban";
import { ScrimService } from "../../src/services/scrim-service";
import { StaticValueService } from "../../src/services/static-values";
import { provideMagickalMock } from "../mocks/magickal-mock";

describe("Signups", () => {
  let dbMock: DbMock;
  let signups: SignupService;
  let prioServiceMock: PrioService;
  let authServiceMock: AuthService;
  let mockBanService: BanService;
  let scrimServiceMock: ScrimService;
  let staticValueServiceMock: StaticValueService;
  let discordServiceMock: jest.Mocked<ScrimNotifier>;
  let alertServiceMock: jest.Mocked<AlertSink>;
  const correctDiscordChannelId = "a forum post";
  const correctScrimId = "32451";
  // was appConfig.lobbySize before the move to this package; now injected
  // directly by whoever constructs SignupService.
  const lobbySize = 3;

  // AuthService no longer takes a Discord member object — it takes the
  // caller's role ids. These two fixtures stand in for "the roles that
  // happen to include VESA's admin role" and "no admin role", replacing the
  // old `member === theheuman` identity check.
  const adminRoleIds = ["admin-role"];
  const nonAdminRoleIds: string[] = [];

  let insertPlayersSpy: SpyInstance;

  beforeEach(() => {
    dbMock = new DbMock();
    prioServiceMock = provideMagickalMock(PrioService);
    mockBanService = provideMagickalMock(BanService);
    authServiceMock = provideMagickalMock(AuthService);
    scrimServiceMock = provideMagickalMock(ScrimService);
    staticValueServiceMock = provideMagickalMock(StaticValueService);
    // DiscordService/AlertService are concrete, Discord-Client-coupled
    // classes that stay in scrim-bot. SignupService only depends on the
    // ScrimNotifier/AlertSink interfaces they implement, so here we can mock
    // those interfaces directly instead of pulling in discord.js.
    discordServiceMock = {
      updateSignupPostDescription: jest.fn(),
      sendScoresComputedMessage: jest.fn(),
    };
    alertServiceMock = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    jest
      .spyOn(staticValueServiceMock, "requireOverstatForSignup")
      .mockResolvedValue(true);
    signups = new SignupService(
      dbMock,
      prioServiceMock,
      authServiceMock,
      discordServiceMock,
      mockBanService,
      scrimServiceMock,
      alertServiceMock,
      staticValueServiceMock,
      lobbySize,
    );
    jest
      .spyOn(mockBanService, "teamHasBan")
      .mockResolvedValue({ hasBan: false, reason: "" });
    insertPlayersSpy = jest.spyOn(dbMock, "insertPlayers");
    insertPlayersSpy.mockReturnValue(
      Promise.resolve([
        {
          id: "111",
          discordId: "123",
          displayName: "TheHeuman",
        },
        {
          id: "111",
          discordId: "123",
          displayName: "TheHeuman",
          overstatId: "123",
        },
        { id: "444", discordId: "456", displayName: "Zboy", overstatId: "456" },
        {
          id: "777",
          discordId: "789",
          displayName: "Supreme",
          overstatId: "789",
        },
      ]),
    );
    jest
      .spyOn(authServiceMock, "memberIsAdmin")
      .mockImplementation((roleIds: string[]) =>
        Promise.resolve(roleIds.includes("admin-role")),
      );

    jest.spyOn(scrimServiceMock, "getScrim").mockReturnValue(
      Promise.resolve({
        id: correctScrimId,
        dateTime: new Date("2026-01-01T20:00:00"),
        discordChannel: correctDiscordChannelId,
        active: false,
        scrimType: ScrimType.regular,
      }),
    );
  });

  const theheuman: DiscordUserRef = { id: "123", displayName: "TheHeuman" };
  const zboy: DiscordUserRef = { id: "456", displayName: "Zboy" };
  const supreme: DiscordUserRef = { id: "789", displayName: "Supreme" };
  const revy: DiscordUserRef = { id: "4368", displayName: "revy2hands" };
  const cTreazy: DiscordUserRef = { id: "452386", displayName: "treazy" };
  const mikey: DiscordUserRef = { id: "32576", displayName: "//baev" };

  describe("addTeam()", () => {
    let getScrimSignupsWithPlayersSpy: SpyInstance<
      Promise<ScrimSignupsWithPlayers[]>
    >;

    beforeEach(() => {
      getScrimSignupsWithPlayersSpy = jest.spyOn(
        dbMock,
        "getScrimSignupsWithPlayers",
      );
    });

    it("Should add a team", async () => {
      jest.useFakeTimers();
      const now = new Date();
      jest.setSystemTime(now);
      const expectedSignup = {
        teamName: "Fineapples",
        scrimId: "32451",
        signupId: "4685",
        discordChannelId: correctDiscordChannelId,
      };

      jest
        .spyOn(dbMock, "addScrimSignup")
        .mockImplementation(
          (
            teamName: string,
            scrimId: string,
            userId: string,
            playerId: string,
            playerIdTwo: string,
            playerIdThree: string,
          ) => {
            expect(teamName).toEqual(expectedSignup.teamName);
            expect(scrimId).toEqual(expectedSignup.scrimId);
            expect(userId).toEqual("111");
            expect(playerId).toEqual("111");
            expect(playerIdTwo).toEqual("444");
            expect(playerIdThree).toEqual("777");
            return Promise.resolve(expectedSignup.signupId);
          },
        );

      const actualScrimSignup = await signups.addTeam(
        expectedSignup.discordChannelId,
        expectedSignup.teamName,
        theheuman,
        adminRoleIds,
        [theheuman, zboy, supreme],
      );
      const expectedReturnSignup: ScrimSignup = {
        date: now,
        teamName: expectedSignup.teamName,
        signupId: expectedSignup.signupId,
        players: [
          {
            id: "111",
            discordId: theheuman.id,
            displayName: theheuman.displayName,
            overstatId: theheuman.id,
          },
          {
            id: "444",
            discordId: zboy.id,
            displayName: zboy.displayName,
            overstatId: zboy.id,
          },
          {
            id: "777",
            discordId: supreme.id,
            displayName: supreme.displayName,
            overstatId: supreme.id,
          },
        ],
        signupPlayer: {
          id: "111",
          discordId: theheuman.id,
          displayName: theheuman.displayName,
        },
      };
      expect(actualScrimSignup).toEqual(expectedReturnSignup);
      expect(insertPlayersSpy).toHaveBeenCalledWith([
        { discordId: "123", displayName: "TheHeuman" },
        { discordId: "123", displayName: "TheHeuman" },
        { discordId: "456", displayName: "Zboy" },
        { discordId: "789", displayName: "Supreme" },
      ]);
      expect.assertions(8);
    });

    it("Should not add a team because there is no scrim for that channel", async () => {
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValueOnce(Promise.resolve(null));
      const causeException = async () => {
        await signups.addTeam("", "", theheuman, adminRoleIds, []);
      };

      await expect(causeException).rejects.toThrow(
        "No scrim found for that channel",
      );
    });

    it("Should not add a team because duplicate team name", async () => {
      const expectedSignup = {
        scrimId: correctScrimId,
        signupId: "4685",
        discordChannelId: correctDiscordChannelId,
      };

      getScrimSignupsWithPlayersSpy.mockReturnValueOnce(
        Promise.resolve([
          {
            scrim_id: "",
            date_time: "2026-01-01T20:00:00",
            team_name: "Fineapples",
            signup_player_id: "111",
            signup_player_discord_id: theheuman.id,
            signup_player_display_name: theheuman.displayName,
            player_one_id: "111",
            player_one_discord_id: theheuman.id,
            player_one_display_name: theheuman.displayName,
            player_one_overstat_id: "111",
            player_one_elo: 0,
            player_two_id: "222",
            player_two_discord_id: revy.id,
            player_two_display_name: revy.displayName,
            player_two_overstat_id: "222",
            player_two_elo: 0,
            player_three_id: "333",
            player_three_discord_id: cTreazy.id,
            player_three_display_name: cTreazy.displayName,
            player_three_overstat_id: "333",
            player_three_elo: 0,
          },
        ]),
      );

      const causeException = async () => {
        await signups.addTeam(
          expectedSignup.discordChannelId,
          "Fineapples",
          theheuman,
          adminRoleIds,
          [zboy, supreme, mikey],
        );
      };

      await expect(causeException).rejects.toThrow("Duplicate team name");
    });

    it("Should not add a team because duplicate player", async () => {
      const expectedSignup = {
        scrimId: correctScrimId,
        signupId: "4685",
        discordChannelId: correctDiscordChannelId,
      };

      getScrimSignupsWithPlayersSpy.mockReturnValueOnce(
        Promise.resolve([
          {
            scrim_id: "",
            date_time: "2026-01-01T20:00:00",
            team_name: "Fineapples",
            signup_player_id: "111",
            signup_player_discord_id: theheuman.id,
            signup_player_display_name: theheuman.displayName,
            player_one_id: "111",
            player_one_discord_id: theheuman.id,
            player_one_display_name: theheuman.displayName,
            player_one_overstat_id: "111",
            player_one_elo: 0,
            player_two_id: "222",
            player_two_discord_id: revy.id,
            player_two_display_name: revy.displayName,
            player_two_overstat_id: "222",
            player_two_elo: 0,
            player_three_id: "333",
            player_three_discord_id: cTreazy.id,
            player_three_display_name: cTreazy.displayName,
            player_three_overstat_id: "333",
            player_three_elo: 0,
          },
        ]),
      );

      const causeException = async () => {
        await signups.addTeam(
          expectedSignup.discordChannelId,
          "Dude Cube",
          theheuman,
          adminRoleIds,
          [theheuman, supreme, mikey],
        );
      };

      await expect(causeException).rejects.toThrow(
        "Player already signed up on different team: TheHeuman <@123> on team Fineapples",
      );
    });

    it("Should not add a team because there aren't three players", async () => {
      const expectedSignup = {
        scrimId: "32451",
        signupId: "4685",
        discordChannelId: "a forum post",
      };

      const causeException = async () => {
        await signups.addTeam(
          expectedSignup.discordChannelId,
          "",
          theheuman,
          adminRoleIds,
          [],
        );
      };

      await expect(causeException).rejects.toThrow(
        "Exactly three players must be provided",
      );
    });

    it("Should not add a team because there are 2 of the same player on a team", async () => {
      const causeException = async () => {
        await signups.addTeam(
          "scrim 1",
          "Fineapples",
          supreme,
          nonAdminRoleIds,
          [supreme, supreme, mikey],
        );
      };

      await expect(causeException).rejects.toThrow("");
    });

    describe("Missing overstat id", () => {
      beforeEach(() => {
        insertPlayersSpy.mockReturnValueOnce(
          Promise.resolve([
            {
              id: "111",
              discordId: "123",
              displayName: "TheHeuman",
              overstatId: "123",
            },
            {
              id: "111",
              discordId: "123",
              displayName: "TheHeuman",
            },
            {
              id: "444",
              discordId: "456",
              displayName: "Zboy",
              overstatId: "456",
            },
            {
              id: "777",
              discordId: "789",
              displayName: "Supreme",
              overstatId: "789",
            },
          ]),
        );
      });

      it("Should add a team because signup member is an admin overriding missing overstat id", async () => {
        const actualSignup = await signups.addTeam(
          correctDiscordChannelId,
          "Dude Cube",
          theheuman,
          adminRoleIds,
          [theheuman, supreme, mikey],
        );

        expect(actualSignup).toBeDefined();
      });

      it("Should add a team because overstat is not required (set by db feature flag)", async () => {
        jest
          .spyOn(staticValueServiceMock, "requireOverstatForSignup")
          .mockResolvedValueOnce(false);

        const actualSignup = await signups.addTeam(
          correctDiscordChannelId,
          "Dude Cube",
          supreme,
          nonAdminRoleIds,
          [theheuman, supreme, mikey],
        );

        expect(actualSignup).toBeDefined();
      });

      it("Should not add a team because a player doesn't have an overstat id", async () => {
        const causeException = async () => {
          await signups.addTeam(
            correctDiscordChannelId,
            "Dude Cube",
            supreme,
            nonAdminRoleIds,
            [theheuman, supreme, mikey],
          );
        };

        await expect(causeException).rejects.toThrow(
          "No overstat linked for TheHeuman",
        );
      });

      it("Should not add a team because a player is scrim banned", async () => {
        const causeException = async () => {
          await signups.addTeam(
            correctDiscordChannelId,
            "Dude Cube",
            supreme,
            nonAdminRoleIds,
            [theheuman, supreme, mikey],
          );
        };

        jest.spyOn(mockBanService, "teamHasBan").mockReturnValue(
          Promise.resolve({
            hasBan: true,
            reason: "Supreme: A valid reason for scrim ban",
          }),
        );

        await expect(causeException).rejects.toThrow(
          "One or more players are scrim banned. Supreme: A valid reason for scrim ban",
        );
      });
    });
  });

  describe("getSignups()", () => {
    it("Should sort teams correctly by prio and signup date", async () => {
      // both positive and negative prio
      // two teams tied for prio with different dates
      const highPrioTeam: ScrimSignupsWithPlayers = {
        date_time: "2024-10-28T20:10:35.706+00:00",
        team_name: "High Prio",
      } as ScrimSignupsWithPlayers;
      const lowPrioTeam: ScrimSignupsWithPlayers = {
        date_time: "2024-10-10T20:10:35.706+00:00",
        team_name: "Low Prio",
      } as ScrimSignupsWithPlayers;
      const mediumPrioTeam1: ScrimSignupsWithPlayers = {
        date_time: "2024-10-13T20:10:35.706+00:00",
        team_name: "Medium Prio 1",
      } as ScrimSignupsWithPlayers;
      const mediumPrioTeam2: ScrimSignupsWithPlayers = {
        date_time: "2024-10-14T20:10:35.706+00:00",
        team_name: "Medium Prio 2",
      } as ScrimSignupsWithPlayers;

      jest
        .spyOn(prioServiceMock, "getTeamPrioForScrim")
        .mockImplementation((_, teams: ScrimSignup[]) => {
          for (const team of teams) {
            switch (team.teamName) {
              case highPrioTeam.team_name:
                team.prio = {
                  amount: 1,
                  reasons: "Player 1 has league prio",
                };
                break;
              case mediumPrioTeam1.team_name:
                team.prio = {
                  amount: 0,
                  reasons: "",
                };
                break;
              case mediumPrioTeam2.team_name:
                team.prio = {
                  amount: 0,
                  reasons: "",
                };
                break;
              case lowPrioTeam.team_name:
                team.prio = {
                  amount: -5,
                  reasons: "Player 1 is an enemy of the people",
                };
                break;
            }
          }
          return Promise.resolve(teams);
        });
      jest
        .spyOn(dbMock, "getScrimSignupsWithPlayers")
        .mockReturnValue(
          Promise.resolve([
            lowPrioTeam,
            mediumPrioTeam2,
            highPrioTeam,
            mediumPrioTeam1,
          ]),
        );

      const generateUndefinedPlayer = (): Player => {
        return {
          discordId: undefined,
          displayName: undefined,
          elo: undefined,
          id: undefined,
          overstatId: undefined,
        } as unknown as Player;
      };
      const generateScrimSignupWithPlayers = (
        team: ScrimSignupsWithPlayers,
        prio: {
          amount: number;
          reasons: string;
        },
      ): ScrimSignup => {
        return {
          teamName: team.team_name,
          players: [
            generateUndefinedPlayer(),
            generateUndefinedPlayer(),
            generateUndefinedPlayer(),
          ],
          signupId: "for now we dont get the id",
          signupPlayer: generateUndefinedPlayer(),
          date: new Date(team.date_time),
          prio,
        };
      };
      const expectedMainTeams: ScrimSignup[] = [
        generateScrimSignupWithPlayers(highPrioTeam, {
          amount: 1,
          reasons: "Player 1 has league prio",
        }),
        generateScrimSignupWithPlayers(mediumPrioTeam1, {
          amount: 0,
          reasons: "",
        }),
        generateScrimSignupWithPlayers(mediumPrioTeam2, {
          amount: 0,
          reasons: "",
        }),
      ];
      const expectedWaitTeams: ScrimSignup[] = [
        generateScrimSignupWithPlayers(lowPrioTeam, {
          amount: -5,
          reasons: "Player 1 is an enemy of the people",
        }),
      ];
      const teamsSignedUp = await signups.getSignups(correctDiscordChannelId);
      expect(teamsSignedUp).toEqual({
        mainList: expectedMainTeams,
        waitList: expectedWaitTeams,
      });
    });

    it("Should sort teams by signup date only when prio type is off", async () => {
      jest.spyOn(scrimServiceMock, "getScrim").mockReturnValueOnce(
        Promise.resolve({
          id: correctScrimId,
          dateTime: new Date("2026-01-01T20:00:00"),
          discordChannel: correctDiscordChannelId,
          active: false,
          scrimType: ScrimType.tournament,
        }),
      );

      const highPrioTeam: ScrimSignupsWithPlayers = {
        date_time: "2024-10-28T20:10:35.706+00:00",
        team_name: "High Prio",
      } as ScrimSignupsWithPlayers;
      const lowPrioTeam: ScrimSignupsWithPlayers = {
        date_time: "2024-10-10T20:10:35.706+00:00",
        team_name: "Low Prio",
      } as ScrimSignupsWithPlayers;
      const mediumPrioTeam: ScrimSignupsWithPlayers = {
        date_time: "2024-10-13T20:10:35.706+00:00",
        team_name: "Medium Prio",
      } as ScrimSignupsWithPlayers;

      jest
        .spyOn(prioServiceMock, "getTeamPrioForScrim")
        .mockImplementation((_, teams: ScrimSignup[]) =>
          Promise.resolve(teams),
        );
      jest
        .spyOn(dbMock, "getScrimSignupsWithPlayers")
        .mockReturnValue(
          Promise.resolve([highPrioTeam, mediumPrioTeam, lowPrioTeam]),
        );

      const { mainList, waitList } = await signups.getSignups(
        correctDiscordChannelId,
      );
      const allTeams = [...mainList, ...waitList];
      expect(allTeams.map((t) => t.teamName)).toEqual([
        "Low Prio",
        "Medium Prio",
        "High Prio",
      ]);
    });

    it("Should throw error when no scrim", async () => {
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValueOnce(Promise.resolve(null));
      const causeException = async () => {
        await signups.getSignups("");
      };

      await expect(causeException).rejects.toThrow(
        "No scrim found for that channel",
      );
    });
  });
});
