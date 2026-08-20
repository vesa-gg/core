import { DbMock } from "../mocks/db.mock";
import { GuildMember, User } from "discord.js";
import { OverstatService } from "../../src/services/overstat";
import { ScrimType, Scrim } from "../../src/models/Scrims";
import { OverstatTournamentResponse } from "../../src/models/overstatModels";
import SpyInstance = jest.SpyInstance;
import { HuggingFaceService } from "../../src/services/hugging-face";
import { ScrimService } from "../../src/services/scrim-service";
import { AlertService } from "../../src/services/alert";
import { provideMagickalMock } from "../mocks/magickal-mock";

jest.mock("../../src/config", () => {
  return {
    appConfig: {
      lobbySize: 3,
    },
  };
});

describe("ScrimService", () => {
  let dbMock: DbMock;
  let service: ScrimService;
  let overstatServiceMock: OverstatService;
  let mockHuggingFaceService: HuggingFaceService;

  let insertPlayersSpy: SpyInstance;
  let huggingFaceUploadSpy: SpyInstance<
    Promise<string>,
    [overstatId: string, dateTime: Date, stats: OverstatTournamentResponse],
    string
  >;

  beforeEach(() => {
    dbMock = new DbMock();
    overstatServiceMock = provideMagickalMock(OverstatService);
    mockHuggingFaceService = provideMagickalMock(HuggingFaceService);
    service = new ScrimService(
      dbMock,
      overstatServiceMock,
      mockHuggingFaceService,
      provideMagickalMock(AlertService),
    );
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
    huggingFaceUploadSpy = jest.spyOn(
      mockHuggingFaceService,
      "uploadOverstatJson",
    );
  });

  const theheuman = { id: "123", displayName: "TheHeuman" } as User;

  describe("createScrim()", () => {
    it("Should create scrim", async () => {
      const channelId = "a valid id";

      const createNewSpy = jest.spyOn(dbMock, "createNewScrim");
      createNewSpy.mockReturnValue(Promise.resolve("a valid scrim id"));

      const now = new Date();
      await service.createScrim(channelId, now);
      expect(createNewSpy).toHaveBeenCalledWith(
        now,
        channelId,
        null,
        null,
        undefined,
      );
    });
  });

  describe("closeScrim()", () => {
    it("Should delete a scrim", async () => {
      const channelId = "a valid id";
      jest.spyOn(dbMock, "getActiveScrims").mockReturnValue(
        Promise.resolve([
          {
            discordChannel: channelId,
            id: "123",
            dateTimeField: "2020-01-01",
            scrimType: ScrimType.regular,
          },
        ]),
      );
      const closeScrimSpy = jest.spyOn(dbMock, "closeScrim");
      closeScrimSpy.mockReturnValue(
        Promise.resolve(["deleted signup id", "deleted signup id 2"]),
      );

      await service.closeScrim(channelId);
      expect(closeScrimSpy).toHaveBeenCalledWith(channelId);
    });

    it("Should fail to close a scrim because it doesn't exist", async () => {
      const channelId = "a valid id";
      jest
        .spyOn(dbMock, "getActiveScrims")
        .mockReturnValue(Promise.resolve([]));
      const closeScrimSpy = jest.spyOn(dbMock, "closeScrim");

      const causeException = async () => {
        await service.closeScrim(channelId);
      };

      await expect(causeException).rejects.toThrow(
        "No scrim found for that channel",
      );

      expect(closeScrimSpy).not.toHaveBeenCalled();
    });
  });

  describe("computeScrim()", () => {
    const channelId = "a valid id";
    const scrimId = "32451-293p482439p8452397-fjg903q0pf9qh3verqhao";
    const overstatLink = "overstat.gg";
    const overstatId = "867235";
    const time = new Date();
    const tournamentStats: OverstatTournamentResponse = {
      total: 6,
      source: "statscode",
      games: [],
      teams: [],
      analytics: {
        qualityScore: 7.8947900682011936,
      },
    } as unknown as OverstatTournamentResponse;
    let overallStatsForIdSpy: jest.SpyInstance;
    let updateScrimSpy: jest.SpyInstance;
    let getTournamentIdSpy: jest.SpyInstance;
    let createNewScrimSpy: jest.SpyInstance;
    let getScrimsByDiscordChannel: jest.SpyInstance<
      Promise<Scrim[]>,
      [channelId: string],
      string
    >;

    beforeEach(() => {
      overallStatsForIdSpy = jest.spyOn(
        overstatServiceMock,
        "getOverallStatsForId",
      );
      updateScrimSpy = jest.spyOn(dbMock, "updateScrim");
      getTournamentIdSpy = jest.spyOn(overstatServiceMock, "getTournamentId");
      createNewScrimSpy = jest.spyOn(dbMock, "createNewScrim");
      getScrimsByDiscordChannel = jest.spyOn(
        dbMock,
        "getScrimsByDiscordChannel",
      );

      overallStatsForIdSpy.mockClear();
      updateScrimSpy.mockClear();
      getTournamentIdSpy.mockClear();
      getScrimsByDiscordChannel.mockClear();

      getTournamentIdSpy.mockReturnValue(overstatId);
      overallStatsForIdSpy.mockReturnValue(Promise.resolve(tournamentStats));
    });

    it("Should compute a scrim", async () => {
      getScrimsByDiscordChannel.mockReturnValue(
        Promise.resolve([
          {
            active: true,
            id: scrimId,
            discordChannel: channelId,
            dateTime: time,
            scrimType: ScrimType.regular,
          },
        ]),
      );
      const result = await service.computeScrim(channelId, [overstatLink]);
      expect(result).toEqual({ links: [overstatLink], dateTime: time });

      expect(overallStatsForIdSpy).toHaveBeenCalledWith(overstatId);
      expect(overallStatsForIdSpy).toHaveBeenCalledTimes(1);

      expect(updateScrimSpy).toHaveBeenCalledWith(scrimId, {
        overstatId,
        overstatJson: tournamentStats,
      });
      expect(updateScrimSpy).toHaveBeenCalledTimes(1);

      expect(huggingFaceUploadSpy).toHaveBeenCalledWith(
        overstatId,
        time,
        tournamentStats,
      );

      expect(createNewScrimSpy).not.toHaveBeenCalled();
    });

    it("Should compute multiple lobbies for a single scrim", async () => {
      getScrimsByDiscordChannel.mockReturnValue(
        Promise.resolve([
          {
            active: true,
            id: scrimId,
            discordChannel: channelId,
            dateTime: time,
            scrimType: ScrimType.regular,
          },
        ]),
      );

      const lobby2OverstatLink = "link-different";
      const lobby2OverstatId = "id-different";

      const lobby3OverstatLink = "link-2-different";
      const lobby3OverstatId = "id-2-different";

      // need to mock overstat id
      getTournamentIdSpy.mockImplementation((link) => {
        switch (link) {
          case overstatLink:
            return overstatId;
          case lobby2OverstatLink:
            return lobby2OverstatId;
          case lobby3OverstatLink:
            return lobby3OverstatId;
        }
      });
      const result = await service.computeScrim(channelId, [
        overstatLink,
        lobby2OverstatLink,
        lobby3OverstatLink,
      ]);
      expect(result).toEqual({
        links: [overstatLink, lobby2OverstatLink, lobby3OverstatLink],
        dateTime: time,
      });

      expect(getTournamentIdSpy.mock.calls).toEqual([
        [overstatLink],
        [lobby2OverstatLink],
        [lobby3OverstatLink],
      ]);
      expect(getTournamentIdSpy).toHaveBeenCalledTimes(3);

      expect(overallStatsForIdSpy.mock.calls).toEqual([
        [overstatId],
        [lobby2OverstatId],
        [lobby3OverstatId],
      ]);
      expect(overallStatsForIdSpy).toHaveBeenCalledTimes(3);

      expect(updateScrimSpy).toHaveBeenCalledWith(scrimId, {
        overstatId,
        overstatJson: tournamentStats,
      });
      expect(updateScrimSpy).toHaveBeenCalledTimes(1);

      expect(createNewScrimSpy.mock.calls).toEqual([
        [time, channelId, lobby2OverstatId, tournamentStats, ScrimType.regular],
        [time, channelId, lobby3OverstatId, tournamentStats, ScrimType.regular],
      ]);
      expect(createNewScrimSpy).toHaveBeenCalledTimes(2);
      expect(huggingFaceUploadSpy.mock.calls).toEqual([
        [overstatId, time, tournamentStats],
        [lobby2OverstatId, time, tournamentStats],
        [lobby3OverstatId, time, tournamentStats],
      ]);
    });

    it("Should create a new scrim to compute a lobby for a scrim that has already been computed with a different overstat", async () => {
      getScrimsByDiscordChannel.mockReturnValue(
        Promise.resolve([
          {
            active: true,
            id: scrimId,
            discordChannel: channelId,
            dateTime: time,
            overstatId,
            scrimType: ScrimType.regular,
          },
        ]),
      );

      const newLobbyOverstatLink = overstatLink + "-different";
      const newLobbyOverstatId = overstatId + "-different";

      getTournamentIdSpy.mockImplementation((link) => {
        switch (link) {
          case overstatLink:
            return overstatId;
          case newLobbyOverstatLink:
            return newLobbyOverstatId;
        }
      });

      const result = await service.computeScrim(channelId, [
        newLobbyOverstatLink,
      ]);
      expect(result).toEqual({ links: [newLobbyOverstatLink], dateTime: time });

      // need to spy on db.get
      expect(getTournamentIdSpy).toHaveBeenCalledWith(newLobbyOverstatLink);
      expect(getTournamentIdSpy).toHaveBeenCalledTimes(1);

      expect(overallStatsForIdSpy).toHaveBeenCalledWith(newLobbyOverstatId);
      expect(overallStatsForIdSpy).toHaveBeenCalledTimes(1);

      expect(updateScrimSpy).toHaveBeenCalledTimes(0);

      expect(createNewScrimSpy).toHaveBeenCalledWith(
        time,
        channelId,
        newLobbyOverstatId,
        tournamentStats,
        ScrimType.regular,
      );
    });

    it("Should update a scrim that has already been computed with the same overstat link", async () => {
      getScrimsByDiscordChannel.mockReturnValue(
        Promise.resolve([
          {
            active: true,
            id: scrimId,
            discordChannel: channelId,
            dateTime: time,
            overstatId,
            scrimType: ScrimType.regular,
          },
        ]),
      );

      const result = await service.computeScrim(channelId, [overstatLink]);
      expect(result).toEqual({ links: [overstatLink], dateTime: time });

      expect(overallStatsForIdSpy).toHaveBeenCalledWith(overstatId);

      expect(getTournamentIdSpy).toHaveBeenCalledWith(overstatLink);

      expect(updateScrimSpy).toHaveBeenCalledTimes(1);
      expect(updateScrimSpy).toHaveBeenCalledWith(scrimId, {
        overstatId,
        overstatJson: tournamentStats,
      });

      expect(createNewScrimSpy).not.toHaveBeenCalled();
    });

    it("should throw an error if no scrims are found", async () => {
      getScrimsByDiscordChannel.mockReturnValue(Promise.resolve([]));

      const causeException = async () => {
        await service.computeScrim(channelId, [overstatLink]);
      };

      await expect(causeException).rejects.toThrow(
        "No scrim found for that channel",
      );
      expect(getTournamentIdSpy).not.toHaveBeenCalled();
    });

    /* TODO: Update these tests to use the not yet implemented discord error reporting system 
        it("should throw an error if hf upload fails", async () => {
          huggingFaceUploadSpy.mockImplementationOnce(() => {
            throw Error("433 connection timeout");
          });
    
          const causeException = async () => {
            await service.computeScrim(channelId, [overstatLink]);
          };
    
          await expect(causeException).rejects.toThrow(
            "Completed computation, but upload to hugging face failed. Error: 433 connection timeout",
          );
          expect(updateScrimSpy).toHaveBeenCalledTimes(1);
        });
    
        it("should throw an error when multiple hf uploads fails", async () => {
          const lobby2OverstatLink = "link-different";
          const lobby2OverstatId = "id-different";
    
          const lobby3OverstatLink = "link-2-different";
          const lobby3OverstatId = "id-2-different";
    
          huggingFaceUploadSpy.mockImplementation((sentOverstatId) => {
            if (sentOverstatId === overstatId) {
              throw Error("433 connection timeout");
            } else if (sentOverstatId === lobby2OverstatId) {
              return Promise.resolve("commit url");
            } else if (sentOverstatId === lobby3OverstatId) {
              throw Error("File too large or something");
            } else {
              fail();
            }
          });
    
          getTournamentIdSpy.mockImplementation((link) => {
            switch (link) {
              case overstatLink:
                return overstatId;
              case lobby2OverstatLink:
                return lobby2OverstatId;
              case lobby3OverstatLink:
                return lobby3OverstatId;
            }
          });
    
          const causeException = async () => {
            await service.computeScrim(channelId, [
              overstatLink,
              lobby2OverstatLink,
              lobby3OverstatLink,
            ]);
          };
    
          await expect(causeException).rejects.toThrow(
            "Scrims computed, but failed to upload stats to hugging face for the following overstat ids:\nid-different: Error: 433 connection timeout\nid-2-different: Error: File too large or something",
          );
          expect(updateScrimSpy).toHaveBeenCalledTimes(1);
          expect(createNewScrimSpy).toHaveBeenCalledTimes(2);
        });
        */
  });
});
