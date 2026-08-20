import { DB } from "../db/db";
import { User } from "discord.js";
import { Scrim } from "../models/Scrims";
import { Player } from "../models/Player";

export class BanService {
  constructor(private db: DB) {}

  async addBans(
    usersToBan: User[],
    startDate: Date,
    endDate: Date,
    reason: string,
  ): Promise<string[]> {
    const playerIds = await this.getPlayerIds(usersToBan);
    return await this.db.addBans(playerIds, startDate, endDate, reason);
  }

  async expungeBans(
    banIds: string[],
  ): Promise<
    { playerDiscordId: string; playerDisplayName: string; endDate: Date }[]
  > {
    return await this.db.expungeBans(banIds);
  }

  async teamHasBan(
    scrim: Scrim,
    players: Player[],
  ): Promise<{ hasBan: boolean; reason: string }> {
    const playersBanned = await this.db.getBans(scrim.dateTime, players);
    if (playersBanned.length > 0) {
      return {
        hasBan: true,
        reason: playersBanned
          .map((playerBan) => `${playerBan.name}: ${playerBan.reason}`)
          .join(", "),
      };
    }
    return { hasBan: false, reason: "" };
  }

  private async getPlayerIds(prioUsers: User[]): Promise<string[]> {
    const insertedPlayers = await this.db.insertPlayers(
      prioUsers.map((user) => ({
        discordId: user.id,
        displayName: user.displayName,
      })),
    );
    return insertedPlayers.map((player) => player.id);
  }
}
