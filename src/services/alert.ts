import { Client } from "discord.js";
import { appConfig } from "../config";
import { StaticValueService } from "./static-values";

export class AlertService {
  constructor(
    private client: Client,
    private staticValueService: StaticValueService,
  ) {}

  async warn(message: string): Promise<void> {
    console.warn(message);
    await this.sendToAlertChannel(message);
  }

  async error(message: string): Promise<void> {
    console.error(message);
    const pingUserId = await this.staticValueService.getAlertPingUserId();
    const fullMessage = pingUserId ? `<@${pingUserId}> ${message}` : message;
    await this.sendToAlertChannel(fullMessage);
  }

  private async sendToAlertChannel(message: string): Promise<void> {
    const channelId = await this.staticValueService.getAlertChannelId();
    if (!channelId) {
      return;
    }
    const guild = this.client.guilds.cache.get(appConfig.discord.guildId.scrim);
    if (!guild) {
      return;
    }
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      return;
    }
    await channel.send(message);
  }
}
