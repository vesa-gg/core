import { DB } from "../db/db";
import { OverstatService } from "./overstat";
import { HuggingFaceService } from "./hugging-face";
import { ScrimType, Scrim } from "../models/Scrims";
import { AlertService } from "./alert";

export class ScrimService {
  constructor(
    private db: DB,
    private overstatService: OverstatService,
    private huggingFaceService: HuggingFaceService,
    private alertService: AlertService,
  ) {}

  async createScrim(
    discordChannelID: string,
    dateTime: Date,
    scrimType?: ScrimType,
  ): Promise<string> {
    const scrimId = await this.db.createNewScrim(
      dateTime,
      discordChannelID,
      null,
      null,
      scrimType,
    );
    return scrimId;
  }

  async getScrim(discordChannel: string): Promise<Scrim | null> {
    const activeScrims = await this.db.getActiveScrims();
    const dbScrim = activeScrims.find(
      (scrim) => scrim.discordChannel === discordChannel,
    );
    if (dbScrim && dbScrim.id && dbScrim.discordChannel) {
      const mappedScrim: Scrim = {
        active: true,
        dateTime: new Date(dbScrim.dateTimeField),
        discordChannel: dbScrim.discordChannel,
        id: dbScrim.id,
        scrimType: dbScrim.scrimType,
      };
      return mappedScrim;
    } else {
      return null;
    }
  }

  async computeScrim(discordChannelID: string, overstatLinks: string[]) {
    const scrims = await this.db.getScrimsByDiscordChannel(discordChannelID);
    if (!scrims.length) {
      throw Error("No scrim found for that channel");
    }
    const overstatIds = overstatLinks.map((link) =>
      this.overstatService.getTournamentId(link),
    );
    const scrimsWithoutOverstatId = scrims.filter((scrim) => !scrim.overstatId);
    const scrimsToRecompute = scrims.filter((scrim) =>
      overstatIds.includes(scrim.overstatId ?? ""),
    );

    const unlinkedOverstatIds = overstatIds.filter(
      (id) => !scrims.some((scrim) => scrim.overstatId === id),
    );

    await this.computeAlreadyCreatedScrims(
      [...scrimsWithoutOverstatId, ...scrimsToRecompute],
      unlinkedOverstatIds,
    );

    const newOverstatIds = unlinkedOverstatIds.slice(
      scrimsWithoutOverstatId.length,
    );
    await this.computeNewScrims(newOverstatIds, {
      scrimDateTime: scrims[0].dateTime,
      discordChannelID,
      scrimType: scrims[0].scrimType,
    });

    return { links: overstatLinks, dateTime: scrims[0].dateTime };
  }

  private async computeAlreadyCreatedScrims(
    scrims: Scrim[],
    unlinkedOverstatIds: string[],
  ) {
    let nextIdIndex = 0;
    for (const scrim of scrims) {
      let overstatId = scrim.overstatId;
      if (!overstatId) {
        overstatId = unlinkedOverstatIds[nextIdIndex];
        nextIdIndex++;
      }
      if (!overstatId) {
        throw new Error(
          "Mismatch in scrims to overstat ids, code error, this shouldn't be possible",
        );
      }
      const stats = await this.overstatService.getOverallStatsForId(overstatId);
      await this.db.updateScrim(scrim.id, {
        overstatId: overstatId,
        overstatJson: stats,
      });
      try {
        await this.huggingFaceService.uploadOverstatJson(
          overstatId,
          scrim.dateTime,
          stats,
        );
      } catch (e) {
        await this.alertService.error(
          `Failed to upload overstat JSON for ${overstatId}: ${e}`,
        );
      }
    }
  }

  private async computeNewScrims(
    newOverstatIds: string[],
    scrimInfo: {
      discordChannelID: string;
      scrimDateTime: Date;
      scrimType: ScrimType;
    },
  ) {
    const errors: string[] = [];
    for (const overstatId of newOverstatIds) {
      const stats = await this.overstatService.getOverallStatsForId(overstatId);
      await this.db.createNewScrim(
        scrimInfo.scrimDateTime,
        scrimInfo.discordChannelID,
        overstatId,
        stats,
        scrimInfo.scrimType,
      );
      try {
        await this.huggingFaceService.uploadOverstatJson(
          overstatId,
          scrimInfo.scrimDateTime,
          stats,
        );
      } catch (e) {
        errors.push(`${overstatId}: ${e}`);
      }
    }
    if (errors.length > 0) {
      await this.alertService.error(
        `Failed to upload overstat JSON for new scrims:\n${errors.join("\n")}`,
      );
    }
  }

  async closeScrim(discordChannelID: string) {
    const scrimId = (await this.getScrim(discordChannelID))?.id;
    if (!scrimId) {
      throw Error("No scrim found for that channel");
    }
    await this.db.closeScrim(discordChannelID);
  }
}
