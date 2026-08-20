import {
  Guild,
  Message,
  MessageEditOptions,
  MessagePayload,
  OmitPartialGroupDMChannel,
} from "discord.js";
import { Scrim } from "../../src/models/Scrims";
import { DiscordService } from "../../src/services/discord";
import { ExtendedClient } from "../../src/ExtendedClient";
import { ForumThreadChannel } from "discord.js/typings";
import { StaticValueService } from "../../src/services/static-values";
import { provideMagickalMock } from "../mocks/magickal-mock";
import SpyInstance = jest.SpyInstance;

jest.mock("../../src/config", () => {
  return {
    appConfig: {
      discord: {
        guildId: {
          scrim: "a valid guild id",
        },
      },
    },
  };
});

describe("Discord service", () => {
  let discordService: DiscordService;
  let staticValueMock: jest.Mocked<StaticValueService>;
  let client: ExtendedClient;
  let guild: Guild;
  let forumChannel: ForumThreadChannel;
  let message: Message;
  let messageEditSpy: SpyInstance<
    Promise<OmitPartialGroupDMChannel<Message<boolean>>>,
    [content: string | MessageEditOptions | MessagePayload],
    string
  >;
  const scrimDescription = "the description of the scrim";
  const scrim = { dateTime: new Date(), discordChannel: "channel" } as Scrim;

  beforeEach(() => {
    staticValueMock = provideMagickalMock(StaticValueService);
    jest
      .spyOn(staticValueMock, "getScrimInfoTimes")
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
    message = {
      edit: jest.fn(),
    } as unknown as Message;
    messageEditSpy = jest.spyOn(message, "edit");

    forumChannel = {
      fetchStarterMessage: () => Promise.resolve(message),
      isThread: () => true,
    } as unknown as ForumThreadChannel;

    guild = {
      channels: {
        cache: {
          get: () => forumChannel,
        },
      },
    } as unknown as Guild;

    client = {
      guilds: {
        cache: {
          get: () => guild,
        },
      },
    } as unknown as ExtendedClient;

    discordService = new DiscordService(client, staticValueMock);

    jest
      .spyOn(staticValueMock, "getInstructionText")
      .mockReturnValue(Promise.resolve(scrimDescription));
  });

  describe("sendScoresComputedMessage()", () => {
    const scoresChannelId = "scores-channel-id";
    const date = new Date("2026-04-18T20:00:00Z");
    const expectedTimestamp = Math.floor(date.valueOf() / 1000);
    let textChannel: { isTextBased: () => boolean; send: jest.Mock };
    let sendSpy: SpyInstance;
    let getChannelSpy: SpyInstance;

    beforeEach(() => {
      textChannel = { isTextBased: () => true, send: jest.fn() };
      sendSpy = jest.spyOn(textChannel, "send");
      getChannelSpy = jest
        .spyOn(guild.channels.cache, "get")
        .mockReturnValue(textChannel as never);
      jest
        .spyOn(staticValueMock, "getScrimScoresChannelId")
        .mockResolvedValue(scoresChannelId);
    });

    it("Should send a correctly formatted message for a single lobby", async () => {
      const lobbies = [
        {
          name: "VESA Scrim Lobby 1",
          link: "https://overstat.gg/tournament/141/19989.VESA_Scrim_Lobby_1_4_18_2026/standings/overall/scoreboard",
        },
      ];
      await discordService.sendScoresComputedMessage(date, lobbies);
      expect(getChannelSpy).toHaveBeenCalledWith(scoresChannelId);
      expect(sendSpy).toHaveBeenCalledWith(
        `<t:${expectedTimestamp}:f>\n[VESA Scrim Lobby 1](<https://overstat.gg/tournament/141/19989.VESA_Scrim_Lobby_1_4_18_2026/standings/overall/scoreboard>)`,
      );
    });

    it("Should send a correctly formatted message for multiple lobbies", async () => {
      const lobbies = [
        {
          name: "VESA Scrim Lobby 1",
          link: "https://overstat.gg/tournament/141/19989.VESA_Scrim_Lobby_1_4_18_2026/standings/overall/scoreboard",
        },
        {
          name: "VESA Scrim Lobby 2",
          link: "https://overstat.gg/tournament/141/19990.VESA_Scrim_Lobby_2_4_18_2026/standings/overall/scoreboard",
        },
      ];
      await discordService.sendScoresComputedMessage(date, lobbies);
      expect(sendSpy).toHaveBeenCalledWith(
        `<t:${expectedTimestamp}:f>\n[VESA Scrim Lobby 1](<https://overstat.gg/tournament/141/19989.VESA_Scrim_Lobby_1_4_18_2026/standings/overall/scoreboard>)\n[VESA Scrim Lobby 2](<https://overstat.gg/tournament/141/19990.VESA_Scrim_Lobby_2_4_18_2026/standings/overall/scoreboard>)`,
      );
    });

    describe("errors", () => {
      it("Should throw if scores channel ID is not configured", async () => {
        jest
          .spyOn(staticValueMock, "getScrimScoresChannelId")
          .mockResolvedValueOnce(undefined);
        await expect(
          discordService.sendScoresComputedMessage(date, []),
        ).rejects.toThrow("Scores channel ID not configured");
      });

      it("Should throw if guild is not found", async () => {
        jest.spyOn(client.guilds.cache, "get").mockReturnValueOnce(undefined);
        await expect(
          discordService.sendScoresComputedMessage(date, []),
        ).rejects.toThrow("Guild not found");
      });

      it("Should throw if scores channel is not found", async () => {
        jest.spyOn(guild.channels.cache, "get").mockReturnValueOnce(undefined);
        await expect(
          discordService.sendScoresComputedMessage(date, []),
        ).rejects.toThrow("Scores channel not found or not a text channel");
      });

      it("Should throw if scores channel is not a text channel", async () => {
        jest.spyOn(guild.channels.cache, "get").mockReturnValueOnce({
          isTextBased: () => false,
        } as never);
        await expect(
          discordService.sendScoresComputedMessage(date, []),
        ).rejects.toThrow("Scores channel not found or not a text channel");
      });
    });
  });

  it("Should update signup thread description", async () => {
    const getGuildSpy = jest.spyOn(client.guilds.cache, "get");
    const getForumThreadSpy = jest.spyOn(guild.channels.cache, "get");

    await discordService.updateSignupPostDescription(scrim, 0);

    expect(getGuildSpy).toHaveBeenCalledWith("a valid guild id");
    expect(getForumThreadSpy).toHaveBeenCalledWith(scrim.discordChannel);
    expect(messageEditSpy).toHaveBeenCalledWith(scrimDescription);
  });

  describe("errors", () => {
    it("Should use fallback message when instruction text not found", async () => {
      const fixedDate = new Date("2026-05-08T22:00:00Z");
      const fixedScrim = {
        dateTime: fixedDate,
        discordChannel: "channel",
      } as Scrim;
      jest
        .spyOn(staticValueMock, "getInstructionText")
        .mockReturnValueOnce(Promise.resolve(undefined));

      await discordService.updateSignupPostDescription(fixedScrim, 5);

      const scrimTimestamp = Math.floor(fixedDate.valueOf() / 1000);
      const draftTimestamp = scrimTimestamp - 30 * 60;
      const lobbyPostTimestamp = scrimTimestamp - 2 * 60 * 60;
      const lowPrioTimestamp = scrimTimestamp - 90 * 60;

      expect(messageEditSpy).toHaveBeenCalledWith(
        [
          `Scrim Date: <t:${scrimTimestamp}:f>`,
          `Scrim Time: <t:${scrimTimestamp}:t>`,
          `Draft Time: <t:${draftTimestamp}:t>`,
          `Lobby Post Time: <t:${lobbyPostTimestamp}:t>`,
          `Low Prio Time: <t:${lowPrioTimestamp}:t>`,
          `Roster Lock Time: <t:${lobbyPostTimestamp}:t>`,
          `Signup Count: 5`,
        ].join("\n"),
      );
    });

    it("Should throw guild not defined error", async () => {
      jest.spyOn(client.guilds.cache, "get").mockReturnValueOnce(undefined);
      const causeException = async () => {
        await discordService.updateSignupPostDescription(scrim, 0);
      };
      await expect(causeException).rejects.toThrow("Guild not found");
    });

    describe("Not a valid channel error", () => {
      it("Should throw signup thread not found error", async () => {
        jest.spyOn(guild.channels.cache, "get").mockReturnValueOnce(undefined);

        const causeException = async () => {
          await discordService.updateSignupPostDescription(scrim, 0);
        };
        await expect(causeException).rejects.toThrow(
          "Forum thread not found or not a valid thread",
        );
      });

      it("Should throw signup thread is not a thread error", async () => {
        jest.spyOn(forumChannel, "isThread").mockReturnValueOnce(false);

        const causeException = async () => {
          await discordService.updateSignupPostDescription(scrim, 0);
        };
        await expect(causeException).rejects.toThrow(
          "Forum thread not found or not a valid thread",
        );
      });
    });

    it("Should throw no signup post description error", async () => {
      jest
        .spyOn(forumChannel, "fetchStarterMessage")
        .mockReturnValueOnce(Promise.resolve(null));
      const causeException = async () => {
        await discordService.updateSignupPostDescription(scrim, 0);
      };
      await expect(causeException).rejects.toThrow(
        "Signup post description not found",
      );
    });
  });
});
