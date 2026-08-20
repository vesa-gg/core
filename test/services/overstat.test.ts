import { OverstatService } from "../../src/services/overstat";
import { mockOverstatResponse } from "../mocks/overstat-response.mock";
import { User } from "discord.js";
import { Player } from "../../src/models/Player";
import { DbMock } from "../mocks/db.mock";

describe("Overstat", () => {
  let overstatService: OverstatService;
  let dbMock: DbMock;
  const overstatLink =
    "https://overstat.gg/tournament/vesa/9994.The_Void_Scrim_Lobby_1_8pm_11_/standings/overall/scoreboard";

  beforeEach(() => {
    dbMock = new DbMock();
    overstatService = new OverstatService(dbMock);
    global.fetch = jest.fn();
  });

  describe("get overstat data", () => {
    it("Should get data", async () => {
      // Set up mock fetch to resolve with the mock data
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => mockOverstatResponse,
      });
      const { stats } =
        await overstatService.getOverallStatsForLink(overstatLink);
      expect(stats.analytics).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        "https://overstat.gg/api/stats/9994/overall",
      );
    });

    describe("errors", () => {
      it("Should throw can't split error", async () => {
        const causeException = async () => {
          await overstatService.getOverallStatsForLink(
            "https://overstat.gg/_7zpee",
          );
        };
        await expect(causeException).rejects.toThrow(
          "URL Malformated, make sure you are using the fully built url and not the shortcode",
        );
      });

      it("Should throw no tournament code error", async () => {
        const causeException = async () => {
          await overstatService.getOverallStatsForLink(
            "https://overstat.gg/tournament/vesa/.The_Void_Scrim_Lobby_1_8pm_11_/standings/overall/scoreboard",
          );
        };
        await expect(causeException).rejects.toThrow(
          "URL Malformated no tournament id found, make sure you are using the fully built url and not the shortcode",
        );
      });
    });
  });

  describe("getLobbyName()", () => {
    it("Should return the lobby name with underscores replaced by spaces", () => {
      const result = overstatService.getLobbyName(overstatLink);
      expect(result).toEqual("The Void Scrim Lobby 1 8pm 11 ");
    });

    it("Should return the lobby name from a VESA scrim link with the date stripped", () => {
      const result = overstatService.getLobbyName(
        "https://overstat.gg/tournament/141/19989.VESA_Scrim_Lobby_1_4_18_2026/standings/overall/scoreboard",
      );
      expect(result).toEqual("VESA Scrim Lobby 1");
    });
  });

  it("Should link a players overstat", async () => {
    const insertPlayerSpy = jest.spyOn(dbMock, "insertPlayerIfNotExists");
    insertPlayerSpy.mockReturnValue(Promise.resolve({ id: "db id" } as Player));
    await overstatService.addPlayerOverstatLink(
      { id: "discord id", displayName: "TheHeuman" } as User,
      "https://overstat.gg/player/357606/overview",
    );
    expect(insertPlayerSpy).toHaveBeenCalledWith(
      "discord id",
      "TheHeuman",
      "357606",
    );
  });

  describe("Fail to link a players overstat", () => {
    it("Should fail because its not an valid link", async () => {
      const insertPlayerSpy = jest.spyOn(dbMock, "insertPlayerIfNotExists");
      insertPlayerSpy.mockReturnValue(
        Promise.resolve({ id: "db id" } as Player),
      );

      const causeException = async () => {
        await overstatService.addPlayerOverstatLink(
          { id: "discord id", displayName: "TheHeuman" } as User,
          "F5 | StabJackal",
        );
      };
      await expect(causeException).rejects.toThrow("Invalid URL");
      expect(insertPlayerSpy).not.toHaveBeenCalled();
    });

    it("Should fail because its not an overstat link", async () => {
      const insertPlayerSpy = jest.spyOn(dbMock, "insertPlayerIfNotExists");
      insertPlayerSpy.mockReturnValue(
        Promise.resolve({ id: "db id" } as Player),
      );

      const causeException = async () => {
        await overstatService.addPlayerOverstatLink(
          { id: "discord id", displayName: "TheHeuman" } as User,
          "https://google.com/player/357606/overview",
        );
      };
      await expect(causeException).rejects.toThrow("Not an overstat link");
      expect(insertPlayerSpy).not.toHaveBeenCalled();
    });

    it("Should fail because its not a player link", async () => {
      const insertPlayerSpy = jest.spyOn(dbMock, "insertPlayerIfNotExists");
      insertPlayerSpy.mockReturnValue(
        Promise.resolve({ id: "db id" } as Player),
      );

      const causeException = async () => {
        await overstatService.addPlayerOverstatLink(
          { id: "discord id", displayName: "TheHeuman" } as User,
          "https://overstat.gg/account/overview",
        );
      };
      await expect(causeException).rejects.toThrow(
        "Not a link to a player overview",
      );
      expect(insertPlayerSpy).not.toHaveBeenCalled();
    });

    it("Should fail because theres no player id", async () => {
      const insertPlayerSpy = jest.spyOn(dbMock, "insertPlayerIfNotExists");
      insertPlayerSpy.mockReturnValue(
        Promise.resolve({ id: "db id" } as Player),
      );

      const causeException = async () => {
        await overstatService.addPlayerOverstatLink(
          { id: "discord id", displayName: "TheHeuman" } as User,
          "https://overstat.gg/player/TheHeuman/overview",
        );
      };
      await expect(causeException).rejects.toThrow(
        "No player ID found in link.",
      );
      expect(insertPlayerSpy).not.toHaveBeenCalled();
    });
  });

  it("Should get a players overstat", async () => {
    const getPlayerSpy = jest.spyOn(dbMock, "getPlayerFromDiscordId");
    getPlayerSpy.mockReturnValue(
      Promise.resolve({
        id: "db id",
        displayName: "TheHeuman",
        overstatId: "357606",
        discordId: "discord id",
      }),
    );
    const overstatLink = await overstatService.getPlayerOverstat({
      id: "discord id",
      displayName: "TheHeuman",
    } as User);
    expect(getPlayerSpy).toHaveBeenCalledWith("discord id");
    expect(overstatLink).toEqual("https://overstat.gg/player/357606/overview");
  });
});
