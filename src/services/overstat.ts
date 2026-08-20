import { OverstatTournamentResponse } from "../models/overstatModels";
import { DB } from "../db/db";
import { User } from "discord.js";
import { Player } from "../models/Player";

export class OverstatService {
  constructor(private db: DB) {}

  private getUrl(tournamentId: string) {
    return `https://overstat.gg/api/stats/${tournamentId}/overall`;
  }

  public getTournamentId(overstatLink: string): string {
    const url = new URL(overstatLink);
    let tournamentId = undefined;
    try {
      const tournamentName = url.pathname.split("/")[3];
      tournamentId = tournamentName.split(".")[0];
    } catch {
      throw Error(
        "URL Malformated, make sure you are using the fully built url and not the shortcode",
      );
    }
    if (!tournamentId) {
      throw Error(
        "URL Malformated no tournament id found, make sure you are using the fully built url and not the shortcode",
      );
    }
    return tournamentId;
  }

  public getLobbyName(overstatLink: string): string {
    const url = new URL(overstatLink);
    const tournamentName = url.pathname.split("/")[3];
    const namePart = tournamentName.split(".").slice(1).join(".");
    return (namePart || tournamentName)
      .replace(/_/g, " ")
      .replace(/ \d{1,2} \d{1,2} \d{4}$/, "");
  }

  validateLinkUrl(overstatLink: string): string {
    const url = new URL(overstatLink);
    if (url.hostname !== "overstat.gg") {
      throw Error("Not an overstat link");
    }
    const pathParts = url.pathname.slice(1).split("/");
    if (pathParts[0] !== "player") {
      throw Error("Not a link to a player overview");
    }
    const re = RegExp("[0-9]+", "g");
    const id = re.exec(pathParts[1]);
    if (id == null) {
      throw Error("No player ID found in link.");
    }
    return id[0];
  }

  // We may want to make sure that the ID returns a valid player
  // https://overstat.gg/api/player/{id} could be used for this
  getPlayerId(overstatLink: string): string {
    return this.validateLinkUrl(overstatLink);
  }

  async getOverallStatsForId(
    tournamentId: string,
  ): Promise<OverstatTournamentResponse> {
    const url = this.getUrl(tournamentId);
    const response = await fetch(url);
    const data = await response.text();
    return JSON.parse(data);
  }

  async getOverallStatsForLink(
    overstatLink: string,
  ): Promise<{ id: string; stats: OverstatTournamentResponse }> {
    const tournamentId = this.getTournamentId(overstatLink);
    const stats = await this.getOverallStatsForId(tournamentId);
    return { id: tournamentId, stats };
  }

  async addPlayerOverstatLink(
    user: User,
    overstatLink: string,
  ): Promise<string> {
    const overstatId = this.getPlayerId(overstatLink);

    const player = await this.db.insertPlayerIfNotExists(
      user.id,
      user.displayName,
      overstatId,
    );

    return player.id;
  }

  async getPlayerOverstat(user: User) {
    const player = await this.db.getPlayerFromDiscordId(user.id);
    if (!player.overstatId) {
      throw Error("Player has no overstat id");
    }
    return getPlayerOverstatUrl(player.overstatId);
  }

  async getPlayerFromOverstatLink(
    overstatLink: string,
  ): Promise<Player | undefined> {
    const overstatId = await this.validateLinkUrl(overstatLink);
    return this.db.getPlayerFromOverstatId(overstatId);
  }
}

export const getPlayerOverstatUrl = (playerId: string) => {
  return `https://overstat.gg/player/${playerId}/overview`;
};
