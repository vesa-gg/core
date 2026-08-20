import { DbMock } from "../mocks/db.mock";
import { Player } from "../../src/models/Player";
import { DiscordUserRef } from "../../src/types/discord-ref";
import { AlertSink, ScrimNotifier } from "../../src/types/notifications";
import { RosterService } from "../../src/services/rosters";
import { ScrimType, Scrim, ScrimSignup } from "../../src/models/Scrims";
import { AuthService } from "../../src/services/auth";
import { BanService } from "../../src/services/ban";
import { StaticValueService } from "../../src/services/static-values";
import { ScrimService } from "../../src/services/scrim-service";
import { SignupService } from "../../src/services/signups";
import { provideMagickalMock } from "../mocks/magickal-mock";

describe("Rosters", () => {
  let dbMock: DbMock;
  let rosters: RosterService;
  let authService: AuthService;
  let banServiceMock: BanService;
  let staticValueService: StaticValueService;
  let scrimServiceMock: ScrimService;
  let signupServiceMock: SignupService;
  let discordServiceMock: jest.Mocked<ScrimNotifier>;
  let alertServiceMock: jest.Mocked<AlertSink>;
  const discordChannel = "034528";

  // Every call site below previously passed a live discord.js GuildMember;
  // RosterService only ever forwards the role ids to AuthService.memberIsAdmin,
  // whose mock (below) is stubbed by return value per-test, so the actual
  // contents of this array don't drive test behavior.
  const roleIds: string[] = [];

  beforeEach(() => {
    dbMock = new DbMock();
    authService = provideMagickalMock(AuthService);
    banServiceMock = provideMagickalMock(BanService);
    staticValueService = provideMagickalMock(StaticValueService);
    jest
      .spyOn(staticValueService, "requireOverstatForSignup")
      .mockResolvedValue(true);
    jest
      .spyOn(staticValueService, "getScrimInfoTimes")
      .mockImplementation(async (scrimDate: Date) => {
        const lobbyPostDate = new Date(
          scrimDate.valueOf() - 2 * 60 * 60 * 1000,
        );
        const lowPrioDate = new Date(
          scrimDate.valueOf() - 1.5 * 60 * 60 * 1000,
        );
        const draftDate = new Date(scrimDate.valueOf() - 30 * 60 * 1000);
        return {
          lobbyPostDate,
          lowPrioDate,
          draftDate,
          rosterLockDate: lobbyPostDate,
        };
      });
    scrimServiceMock = provideMagickalMock(ScrimService);
    signupServiceMock = provideMagickalMock(SignupService);
    // DiscordService/AlertService are concrete, Discord-Client-coupled
    // classes that stay in scrim-bot. RosterService only depends on the
    // ScrimNotifier/AlertSink interfaces they implement.
    discordServiceMock = {
      updateSignupPostDescription: jest.fn(),
      sendScoresComputedMessage: jest.fn(),
    };
    alertServiceMock = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    rosters = new RosterService(
      dbMock,
      authService,
      discordServiceMock,
      banServiceMock,
      staticValueService,
      scrimServiceMock,
      signupServiceMock,
      alertServiceMock,
    );
    jest
      .spyOn(authService, "memberIsAdmin")
      .mockReturnValue(Promise.resolve(true));
    jest
      .spyOn(banServiceMock, "teamHasBan")
      .mockResolvedValue({ hasBan: false, reason: "" });
    jest
      .spyOn(scrimServiceMock, "getScrim")
      .mockReturnValue(Promise.resolve(null));
    jest
      .spyOn(signupServiceMock, "getRawSignups")
      .mockReturnValue(Promise.resolve([]));
  });

  const zboy: { user: DiscordUserRef; member: DiscordUserRef; player: Player } =
    {
      user: { id: "0", displayName: "Zboy" },
      member: { id: "0", displayName: "Zboy" },
      player: {
        discordId: "0",
        id: "1987254",
        displayName: "Zboy",
        overstatId: "1234",
      },
    };
  const theheuman: {
    user: DiscordUserRef;
    member: DiscordUserRef;
    player: Player;
  } = {
    user: { id: "1", displayName: "TheHeuman" },
    member: { id: "1", displayName: "TheHeuman" },
    player: { discordId: "1", id: "123", displayName: "TheHeuman" },
  };

  const supreme: Player = { discordId: "2", id: "789", displayName: "Supreme" };
  const revy: Player = {
    discordId: "3",
    id: "4368",
    displayName: "revy2hands",
  };
  const cTreazy: Player = {
    discordId: "4",
    id: "452386",
    displayName: "treazy",
  };
  const mikey: Player = { discordId: "5", id: "32576", displayName: "//baev" };

  const getFineapples = (): ScrimSignup => ({
    teamName: "Fineapples",
    players: [revy, theheuman.player, cTreazy],
    signupId: "213",
    signupPlayer: zboy.player,
    date: new Date(),
  });

  describe("removeSignup()", () => {
    it("Should remove a team", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([getFineapples()]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      const dbSpy = jest.spyOn(dbMock, "removeScrimSignup");
      await rosters.removeSignup(
        zboy.member,
        roleIds,
        discordChannel,
        getFineapples().teamName,
      );
      expect(dbSpy).toHaveBeenCalledWith("Fineapples", scrim.id);
    });

    it("Should not remove a team because there is no scrim with that id", async () => {
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(null));

      const causeException = async () => {
        await rosters.removeSignup(
          zboy.member,
          roleIds,
          "034528",
          getFineapples().teamName,
        );
      };

      await expect(causeException).rejects.toThrow(
        "No scrim matching that scrim channel present, contact admin",
      );
    });

    it("Should not remove a team because there is no team with that name", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };

      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([getFineapples()]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));
      const causeException = async () => {
        await rosters.removeSignup(
          zboy.member,
          roleIds,
          discordChannel,
          "random other name",
        );
      };

      await expect(causeException).rejects.toThrow("No team with that name");
    });

    it("Should not remove a team because user is not authorized", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const differentFineapples: ScrimSignup = {
        teamName: "Different Fineapples",
        players: [revy, theheuman.player, cTreazy],
        signupId: "213",
        signupPlayer: theheuman.player,
        date: new Date(),
      };

      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([differentFineapples]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      jest
        .spyOn(authService, "memberIsAdmin")
        .mockReturnValue(Promise.resolve(false));
      const causeException = async () => {
        await rosters.removeSignup(
          zboy.member,
          roleIds,
          discordChannel,
          differentFineapples.teamName,
        );
      };

      await expect(causeException).rejects.toThrow(
        "User issuing command not authorized to make changes",
      );
    });
  });

  describe("changeTeamName()", () => {
    it("Should change team name", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };

      const dbSpy = jest.spyOn(dbMock, "changeTeamNameNoAuth");

      const fineapples = getFineapples();
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([fineapples]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      await rosters.changeTeamName(
        zboy.member,
        roleIds,
        discordChannel,
        fineapples.teamName,
        "Dude Cube",
      );
      expect(dbSpy).toHaveBeenCalledWith(scrim.id, "Fineapples", "Dude Cube");
    });

    it("Should not change team name because team name already taken", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [revy, theheuman.player, cTreazy],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };

      const fineapples = getFineapples();
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([fineapples, dudeCube]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));
      const causeException = async () => {
        await rosters.changeTeamName(
          zboy.member,
          roleIds,
          discordChannel,
          fineapples.teamName,
          dudeCube.teamName,
        );
      };

      await expect(causeException).rejects.toThrow(
        "Team name already taken in this scrim set",
      );
    });
  });

  describe("replaceTeammate()", () => {
    it("Should replace teammate", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [revy, theheuman.player, cTreazy],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };

      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([dudeCube]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      const dbSpy = jest.spyOn(dbMock, "replaceTeammateNoAuth");
      jest
        .spyOn(dbMock, "insertPlayerIfNotExists")
        .mockReturnValue(Promise.resolve(zboy.player));

      await rosters.replaceTeammate(
        theheuman.member,
        roleIds,
        discordChannel,
        dudeCube.teamName,
        theheuman.user,
        zboy.user,
      );
      expect(dbSpy).toHaveBeenCalledWith(
        scrim.id,
        dudeCube.teamName,
        theheuman.player.id,
        zboy.player.id,
      );
    });

    it("Should not replace teammate because player already on another team", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [zboy.player, supreme, mikey],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([dudeCube, getFineapples()]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      const dbSpy = jest.spyOn(dbMock, "replaceTeammateNoAuth");
      jest
        .spyOn(dbMock, "insertPlayerIfNotExists")
        .mockReturnValue(Promise.resolve(zboy.player));

      const causeException = async () => {
        await rosters.replaceTeammate(
          theheuman.member,
          roleIds,
          discordChannel,
          getFineapples().teamName,
          theheuman.user,
          zboy.user,
        );
      };

      await expect(causeException).rejects.toThrow(
        "New player is already on a team in this scrim",
      );

      expect(dbSpy).toHaveBeenCalledTimes(0);
    });

    it("Should not replace teammate because player being replaced is not on the team", async () => {
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [revy, supreme, mikey],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([dudeCube]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      const dbSpy = jest.spyOn(dbMock, "replaceTeammateNoAuth");

      const causeException = async () => {
        await rosters.replaceTeammate(
          theheuman.member,
          roleIds,
          discordChannel,
          dudeCube.teamName,
          zboy.user,
          theheuman.user,
        );
      };

      await expect(causeException).rejects.toThrow(
        "Player being replaced is not on this team",
      );

      expect(dbSpy).toHaveBeenCalledTimes(0);
    });

    it("Should not replace teammate because new player does not have an overstat id", async () => {
      jest
        .spyOn(authService, "memberIsAdmin")
        .mockReturnValueOnce(Promise.resolve(false));
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [zboy.player, supreme, mikey],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([dudeCube]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      const dbSpy = jest.spyOn(dbMock, "replaceTeammateNoAuth");

      const causeException = async () => {
        await rosters.replaceTeammate(
          theheuman.member,
          roleIds,
          discordChannel,
          dudeCube.teamName,
          zboy.user,
          theheuman.user,
        );
      };

      await expect(causeException).rejects.toThrow(
        "New player has no overstat set",
      );

      expect(dbSpy).toHaveBeenCalledTimes(0);
    });

    it("Should replace teammate without overstat when overstat is not required", async () => {
      jest
        .spyOn(staticValueService, "requireOverstatForSignup")
        .mockResolvedValueOnce(false);
      jest
        .spyOn(authService, "memberIsAdmin")
        .mockReturnValueOnce(Promise.resolve(false));
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const scrim: Scrim = {
        id: "231478",
        dateTime: futureDate,
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [zboy.player, supreme, mikey],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([dudeCube]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));
      jest
        .spyOn(dbMock, "insertPlayerIfNotExists")
        .mockReturnValue(Promise.resolve(theheuman.player));

      const dbSpy = jest.spyOn(dbMock, "replaceTeammateNoAuth");

      await rosters.replaceTeammate(
        theheuman.member,
        roleIds,
        discordChannel,
        dudeCube.teamName,
        zboy.user,
        theheuman.user,
      );

      expect(dbSpy).toHaveBeenCalledTimes(1);
    });

    it("Should not replace teammate because new player is scrim banned", async () => {
      jest
        .spyOn(authService, "memberIsAdmin")
        .mockReturnValueOnce(Promise.resolve(true));
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [theheuman.player, supreme, mikey],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };
      jest
        .spyOn(dbMock, "insertPlayerIfNotExists")
        .mockReturnValue(Promise.resolve(zboy.player));

      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([dudeCube]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));
      const dbSpy = jest.spyOn(dbMock, "replaceTeammateNoAuth");
      jest.spyOn(banServiceMock, "teamHasBan").mockReturnValue(
        Promise.resolve({
          hasBan: true,
          reason: "Zboy: A valid reason for scrim ban",
        }),
      );

      const causeException = async () => {
        await rosters.replaceTeammate(
          theheuman.member,
          roleIds,
          discordChannel,
          dudeCube.teamName,
          theheuman.user,
          zboy.user,
        );
      };

      await expect(causeException).rejects.toThrow(
        "New player is scrim banned. Zboy: A valid reason for scrim ban",
      );

      expect(dbSpy).toHaveBeenCalledTimes(0);
    });

    it("Should not replace teammate because is is past roster lock date", async () => {
      jest
        .spyOn(authService, "memberIsAdmin")
        .mockReturnValueOnce(Promise.resolve(false));
      const scrim: Scrim = {
        id: "231478",
        dateTime: new Date("2024-10-14T20:10:35.706+00:00"),
        active: true,
        discordChannel,
        scrimType: ScrimType.regular,
      };
      const dudeCube: ScrimSignup = {
        teamName: "Dude Cube",
        players: [theheuman.player, supreme, mikey],
        signupId: "214",
        signupPlayer: theheuman.player,
        date: new Date(),
      };
      jest
        .spyOn(signupServiceMock, "getRawSignups")
        .mockReturnValue(Promise.resolve([dudeCube]));
      jest
        .spyOn(scrimServiceMock, "getScrim")
        .mockReturnValue(Promise.resolve(scrim));

      const dbSpy = jest.spyOn(dbMock, "replaceTeammateNoAuth");
      jest.spyOn(banServiceMock, "teamHasBan").mockReturnValue(
        Promise.resolve({
          hasBan: false,
          reason: "",
        }),
      );
      jest
        .spyOn(dbMock, "insertPlayerIfNotExists")
        .mockReturnValue(Promise.resolve(zboy.player));

      const causeException = async () => {
        await rosters.replaceTeammate(
          theheuman.member,
          roleIds,
          discordChannel,
          dudeCube.teamName,
          theheuman.user,
          zboy.user,
        );
      };

      await expect(causeException).rejects.toThrow(
        "It is past the roster lock time. Rosters are locked, please create a ticket if you need to sub",
      );

      expect(dbSpy).toHaveBeenCalledTimes(0);
    });
  });
});
