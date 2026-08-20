import { DB } from "../db/db";
import { Platform, PlayerRank, VesaDivision } from "../models/league-models";
import { OverstatService } from "../services/overstat";
import {
  LeagueDataRepository,
  RosterChangeData,
  SignupData,
  SignupResult,
  SubRequestData,
  WriteResult,
} from "./league-data.repository";

export class LeagueDbRepository implements LeagueDataRepository {
  constructor(
    private db: DB,
    private overstatService: OverstatService,
  ) {}

  async writeSignup(data: SignupData): Promise<SignupResult | null> {
    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason) {
      throw new Error("No season found with active signups.");
    }

    const [dbPlayer1, dbPlayer2, dbPlayer3] = await this.db.insertPlayers([
      {
        discordId: data.player1.discordId,
        displayName: data.player1.name,
        overstatId: this.extractOverstatId(data.player1.overstatLink),
        elo: data.player1.elo,
      },
      {
        discordId: data.player2.discordId,
        displayName: data.player2.name,
        overstatId: this.extractOverstatId(data.player2.overstatLink),
        elo: data.player2.elo,
      },
      {
        discordId: data.player3.discordId,
        displayName: data.player3.name,
        overstatId: this.extractOverstatId(data.player3.overstatLink),
        elo: data.player3.elo,
      },
    ]);
    if (!dbPlayer1 || !dbPlayer2 || !dbPlayer3) {
      throw new Error(
        "Failed to resolve all three players — each player must have a unique Discord ID.",
      );
    }

    const { signupNumber } = await this.db.insertLeagueSignup(
      activeSeason.id,
      {
        teamName: data.teamName,
        daysUnableToPlay: data.teamNoDays,
        compKnowledge: data.teamCompKnowledge,
        additionalComments: data.additionalComments || null,
      },
      [
        {
          playerId: dbPlayer1.id,
          slot: 1,
          apexRank: PlayerRank[data.player1.rank],
          platform: Platform[data.player1.platform],
          prevSeasonDivision:
            VesaDivision[data.player1.previous_season_vesa_division],
          elo: data.player1.elo ?? null,
        },
        {
          playerId: dbPlayer2.id,
          slot: 2,
          apexRank: PlayerRank[data.player2.rank],
          platform: Platform[data.player2.platform],
          prevSeasonDivision:
            VesaDivision[data.player2.previous_season_vesa_division],
          elo: data.player2.elo ?? null,
        },
        {
          playerId: dbPlayer3.id,
          slot: 3,
          apexRank: PlayerRank[data.player3.rank],
          platform: Platform[data.player3.platform],
          prevSeasonDivision:
            VesaDivision[data.player3.previous_season_vesa_division],
          elo: data.player3.elo ?? null,
        },
      ],
    );

    return {
      rowNumber: signupNumber,
      seasonInfo: {
        signupPrioEndDate: activeSeason.signupPrioEndDate,
        startDate: activeSeason.startDate,
      },
    };
  }

  async writeSubRequest(data: SubRequestData): Promise<WriteResult> {
    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason) {
      throw new Error("No season found with active signups.");
    }

    const [playerOutDb, playerInDb, requestedByDb] =
      await this.db.insertPlayers([
        {
          discordId: data.playerOut.discordId,
          displayName: data.playerOut.name,
          overstatId: this.extractOverstatId(data.playerOut.overstatLink),
        },
        {
          discordId: data.playerIn.discordId,
          displayName: data.playerIn.name,
          overstatId: this.extractOverstatId(data.playerIn.overstatLink),
        },
        {
          discordId: data.commandUser.id,
          displayName: data.commandUser.displayName,
        },
      ]);
    if (!playerOutDb || !playerInDb || !requestedByDb) {
      throw new Error(
        "Failed to resolve all players — playerOut, playerIn, and requestedBy must each have a unique Discord ID.",
      );
    }

    const teamId = await this.db.getLeagueTeamIdByName(
      activeSeason.id,
      data.teamName,
    );

    await this.db.insertLeagueSubRequest({
      seasonId: activeSeason.id,
      teamId,
      teamName: data.teamName,
      division: data.teamDivision,
      weekNumber: data.weekNumber,
      playerOutId: playerOutDb.id,
      playerInId: playerInDb.id,
      playerInDivision: data.playerInDivision,
      requestedById: requestedByDb.id,
      additionalComments: data.additionalComments || null,
    });

    return { rowNumber: null, url: null, tabName: null };
  }

  async writeRosterChange(data: RosterChangeData): Promise<WriteResult> {
    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason) {
      throw new Error("No season found with active signups.");
    }

    const [playerOutDb, playerInDb, requestedByDb] =
      await this.db.insertPlayers([
        {
          discordId: data.playerOut.discordId,
          displayName: data.playerOut.name,
          overstatId: this.extractOverstatId(data.playerOut.overstatLink),
        },
        {
          discordId: data.playerIn.discordId,
          displayName: data.playerIn.name,
          overstatId: this.extractOverstatId(data.playerIn.overstatLink),
        },
        {
          discordId: data.commandUser.id,
          displayName: data.commandUser.displayName,
        },
      ]);
    if (!playerOutDb || !playerInDb || !requestedByDb) {
      throw new Error(
        "Failed to resolve all players — playerOut, playerIn, and requestedBy must each have a unique Discord ID.",
      );
    }

    const teamId = await this.db.getLeagueTeamIdByName(
      activeSeason.id,
      data.teamName,
    );

    await this.db.insertLeagueRosterChange({
      seasonId: activeSeason.id,
      teamId,
      teamName: data.teamName,
      division: data.teamDivision,
      playerOutId: playerOutDb.id,
      playerInId: playerInDb.id,
      requestedById: requestedByDb.id,
      additionalComments: data.additionalComments || null,
    });

    return { rowNumber: null, url: null, tabName: null };
  }

  async getRosterDiscordIds(): Promise<Map<string, string>> {
    const activeSeason = await this.db.getActiveLeagueSeason();
    if (!activeSeason) {
      return new Map();
    }

    return this.db.getLeagueRosterMap(activeSeason.id);
  }

  private extractOverstatId(
    overstatLink: string | undefined,
  ): string | undefined {
    if (!overstatLink) return undefined;
    try {
      return this.overstatService.validateLinkUrl(overstatLink);
    } catch {
      return undefined;
    }
  }
}
