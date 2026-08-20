import { Client } from "discord.js";
import { appConfig } from "../config";
import { StaticValueService } from "./static-values";
import { Scrim } from "../models/Scrims";
import { replaceScrimVariables } from "../utility/utility";
import { ForumThreadChannel } from "discord.js/typings";
import { formatDateForDiscord, formatTimeForDiscord } from "../utility/time";

export class DiscordService {
  constructor(
    private client: Client,
    private staticValueService: StaticValueService,
  ) {}

  async updateSignupPostDescription(scrim: Scrim, signupCount: number) {
    const instructionText = await this.staticValueService.getInstructionText(
      scrim.scrimType,
    );
    let updatedMessage: string;
    if (!instructionText) {
      updatedMessage = await this.buildFallbackMessage(scrim, signupCount);
    } else {
      updatedMessage = await this.replaceScrimVariablesFromScrim(
        instructionText,
        scrim,
        signupCount,
      );
    }
    const guild = this.client.guilds.cache.get(appConfig.discord.guildId.scrim);
    if (!guild) {
      throw Error("Guild not found");
    }

    const forumThread = guild.channels.cache.get(
      scrim.discordChannel,
    ) as ForumThreadChannel;
    if (!forumThread || forumThread.isThread() === false) {
      throw Error("Forum thread not found or not a valid thread");
    }
    const description = await forumThread.fetchStarterMessage();

    if (!description) {
      throw Error("Signup post description not found");
    }

    await description.edit(updatedMessage);
  }

  async sendScoresComputedMessage(
    date: Date,
    lobbies: { name: string; link: string }[],
  ): Promise<void> {
    const channelId = await this.staticValueService.getScrimScoresChannelId();
    if (!channelId) {
      throw new Error("Scores channel ID not configured");
    }
    const guild = this.client.guilds.cache.get(appConfig.discord.guildId.scrim);
    if (!guild) {
      throw new Error("Guild not found");
    }
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error("Scores channel not found or not a text channel");
    }
    const lobbyLines = lobbies
      .map((lobby) => `[${lobby.name}](<${lobby.link}>)`)
      .join("\n");
    await channel.send(`${formatDateForDiscord(date)}\n${lobbyLines}`);
  }

  private async buildFallbackMessage(
    scrim: Scrim,
    signupCount: number,
  ): Promise<string> {
    const { draftDate, lobbyPostDate, lowPrioDate, rosterLockDate } =
      await this.staticValueService.getScrimInfoTimes(scrim.dateTime);

    return [
      `Scrim Date: ${formatDateForDiscord(scrim.dateTime)}`,
      `Scrim Time: ${formatTimeForDiscord(scrim.dateTime)}`,
      `Draft Time: ${formatTimeForDiscord(draftDate)}`,
      `Lobby Post Time: ${formatTimeForDiscord(lobbyPostDate)}`,
      `Low Prio Time: ${formatTimeForDiscord(lowPrioDate)}`,
      `Roster Lock Time: ${formatTimeForDiscord(rosterLockDate)}`,
      `Signup Count: ${signupCount}`,
    ].join("\n");
  }

  private async replaceScrimVariablesFromScrim(
    text: string,
    scrim: Scrim,
    signupCount: number,
  ): Promise<string> {
    const { draftDate, lobbyPostDate, lowPrioDate, rosterLockDate } =
      await this.staticValueService.getScrimInfoTimes(scrim.dateTime);

    return replaceScrimVariables(text, {
      scrimTime: formatTimeForDiscord(scrim.dateTime),
      scrimDate: formatDateForDiscord(scrim.dateTime),
      draftTime: formatTimeForDiscord(draftDate),
      lobbyPostTime: formatTimeForDiscord(lobbyPostDate),
      lowPrioTime: formatTimeForDiscord(lowPrioDate),
      rosterLockTime: formatTimeForDiscord(rosterLockDate),
      signupCount: signupCount.toString(),
    });
  }
}
