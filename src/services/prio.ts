import { DB } from "../db/db";
import { User } from "discord.js";
import { Scrim, ScrimSignup, ScrimType } from "../models/Scrims";
import { ExpungedPlayerPrio, PlayerMap, PlayerPrio } from "../models/Prio";
import { Player } from "../models/Player";
import { LeagueService } from "./league";
import { AlertService } from "./alert";

export class PrioService {
  constructor(
    private db: DB,
    private leagueService: LeagueService,
    private alertService: AlertService,
  ) {}

  async setPlayerPrio(
    prioUsers: User[],
    startDate: Date,
    endDate: Date,
    amount: number,
    reason: string,
  ): Promise<string[]> {
    const playerIds = await this.getPlayerIds(prioUsers);
    return await this.db.setPrio(playerIds, startDate, endDate, amount, reason);
  }

  async expungePlayerPrio(prioIds: string[]): Promise<ExpungedPlayerPrio[]> {
    return await this.db.expungePrio(prioIds);
  }

  // changes teams in place and returns the teams, does NOT sort
  async getTeamPrioForScrim(
    scrim: Scrim,
    teams: ScrimSignup[],
    discordIdsWithScrimPass: string[],
  ): Promise<ScrimSignup[]> {
    if (scrim.scrimType === ScrimType.tournament) {
      return teams;
    }
    if (scrim.scrimType === ScrimType.league) {
      try {
        const rosterMap = await this.leagueService.getRosterDiscordIds();
        for (const team of teams) {
          const { tier, reason } = getLeagueTierInfo(team.players, rosterMap);
          team.prio = { amount: tier, reasons: reason };
        }
      } catch (e) {
        await this.alertService.warn(
          `Failed to fetch league roster, defaulting to date-only sort: ${e}`,
        );
      }
      // Positive regular prio is ignored for league scrims, but low prio still applies
      const playersWithPrio = await this.db.getPrio(scrim.dateTime);
      const playerMap = this.generatePlayerMap(playersWithPrio, []);
      for (const team of teams) {
        const lowPrioReasons: string[] = [];
        for (const player of team.players) {
          const prioEntry = playerMap.get(player.discordId);
          if (prioEntry && prioEntry.amount < 0) {
            lowPrioReasons.push(`${player.displayName}: ${prioEntry.reason}`);
          }
        }
        if (lowPrioReasons.length > 0) {
          const leagueReasons = team.prio?.reasons ?? "";
          team.prio = {
            amount: -1,
            reasons:
              lowPrioReasons.join("; ") +
              (leagueReasons ? "; " + leagueReasons : ""),
          };
        }
      }
      return teams;
    }
    const playersWithPrio = await this.db.getPrio(scrim.dateTime);
    const playerMap = this.generatePlayerMap(
      playersWithPrio,
      discordIdsWithScrimPass,
    );
    this.setTeamPrioFromPlayerPrio(teams, playerMap);
    return teams;
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

  private generatePlayerMap(
    playersIdsWithPrio: PlayerPrio[],
    discordIdsWithScrimPass: string[],
  ): PlayerMap {
    const playerMap: Map<string, { amount: number; reason: string }> =
      new Map();
    // use discord id of player here
    for (const player of playersIdsWithPrio) {
      const playerPrio = playerMap.get(player.discordId);
      if (!playerPrio) {
        playerMap.set(player.discordId, {
          amount: player.amount,
          reason: player.reason,
        });
        // if new entry is negative override all prio to be negative
      } else if (player.amount < 0) {
        playerMap.set(player.discordId, {
          amount: player.amount,
          reason: playerPrio.reason + ", " + player.reason,
        });
        // if new entry is positive let previous (potentially negative) prio override new amount
      } else if (player.amount >= 0) {
        playerMap.set(player.discordId, {
          amount: playerPrio.amount,
          reason: playerPrio.reason + ", " + player.reason,
        });
      }
    }

    // we only add scrim pass prio if they do not have low prio
    for (const id of discordIdsWithScrimPass) {
      const playerPrio = playerMap.get(id);
      if (!playerPrio) {
        playerMap.set(id, {
          amount: 1,
          reason: "Scrim pass",
        });
      } else if (playerPrio.amount < 0) {
        playerMap.set(id, {
          amount: -1,
          reason: playerPrio.reason + ", " + "Scrim pass",
        });
      } else if (playerPrio.amount > 0) {
        playerMap.set(id, {
          amount: 1,
          reason: playerPrio.reason + ", " + "Scrim pass",
        });
      }
    }
    return playerMap;
  }

  private setTeamPrioFromPlayerPrio(
    teams: ScrimSignup[],
    playerMap: PlayerMap,
  ) {
    for (const team of teams) {
      let containsHighPrio = false;
      let containsLowPrio = false;
      const reason: string[] = [];
      team.players.forEach((player) => {
        const playerPrioEntry = playerMap.get(player.discordId);
        if (playerPrioEntry) {
          containsHighPrio = containsHighPrio
            ? containsHighPrio
            : playerPrioEntry.amount > 0;
          containsLowPrio = containsLowPrio
            ? containsLowPrio
            : playerPrioEntry.amount < 0;
          reason.push(`${player.displayName}: ${playerPrioEntry.reason}`);
          player.prio = {
            amount: playerPrioEntry.amount,
            reason: playerPrioEntry.reason,
          };
        }
      });
      // Per sly, prio does not stack. Anyone on low prio overrides whole team to be on low prio
      let amount = 0;
      if (containsLowPrio) {
        amount = -1;
      } else if (containsHighPrio) {
        amount = 1;
      }
      team.prio = {
        amount,
        reasons: reason.join("; "),
      };
    }
  }
}

function getLeagueTierInfo(
  players: Player[],
  rosterMap: Map<string, string>,
): { tier: number; reason: string } {
  const teamCounts = new Map<string, number>();
  for (const player of players) {
    const teamName = rosterMap.get(player.discordId);
    if (teamName) {
      teamCounts.set(teamName, (teamCounts.get(teamName) ?? 0) + 1);
    }
  }

  const maxSameTeam =
    teamCounts.size > 0 ? Math.max(...teamCounts.values()) : 0;

  if (maxSameTeam === 3) {
    const teamName = [...teamCounts.keys()][0];
    return { tier: 5, reason: `3/3 players from ${teamName}` };
  }
  if (maxSameTeam === 2) {
    const dominantTeam = [...teamCounts.entries()].find(
      ([, count]) => count === 2,
    )![0];
    const otherTeam = [...teamCounts.keys()].find((t) => t !== dominantTeam);
    if (otherTeam) {
      return {
        tier: 4,
        reason: `2/3 players from ${dominantTeam}, 1 from ${otherTeam}`,
      };
    }
    return {
      tier: 3,
      reason: `2/3 players from ${dominantTeam}, 1 not in league`,
    };
  }
  if (teamCounts.size === 3) {
    const teams = [...teamCounts.keys()].join(", ");
    return {
      tier: 2,
      reason: `all 3 players from different league teams: ${teams}`,
    };
  }
  return { tier: 1, reason: "fewer than 2 players from same league team" };
}
