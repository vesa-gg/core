import { DiscordUserRef } from "../types/discord-ref";
import { Player, PlayerInsert } from "../models/Player";
import { DB } from "../db/db";
import { ScrimSignupsWithPlayers } from "../db/table.interfaces";
import { Scrim, ScrimSignup } from "../models/Scrims";
import { PrioService } from "./prio";
import { AuthService } from "./auth";
import { ScrimNotifier, AlertSink } from "../types/notifications";
import { BanService } from "./ban";
import { ScrimService } from "./scrim-service";
import { StaticValueService } from "./static-values";
import { OVERSTAT_LINK_CHANNEL_URL } from "../utility/utility";

export class SignupService {
  constructor(
    private db: DB,
    private prioService: PrioService,
    private authService: AuthService,
    private scrimNotifier: ScrimNotifier,
    private banService: BanService,
    private scrimService: ScrimService,
    private alertService: AlertSink,
    private staticValueService: StaticValueService,
    // was read from global app config before the move to this package —
    // now supplied explicitly by the consumer (scrim-bot passes appConfig.lobbySize)
    private lobbySize: number,
  ) {}

  async addTeam(
    discordChannelID: string,
    teamName: string,
    commandUser: DiscordUserRef,
    commandUserRoleIds: string[],
    players: DiscordUserRef[],
  ): Promise<ScrimSignup> {
    const scrim = await this.scrimService.getScrim(discordChannelID);
    if (!scrim) {
      throw Error("No scrim found for that channel");
    }
    if (players.length !== 3) {
      throw Error("Exactly three players must be provided");
    } else if (
      players[0].id === players[1].id ||
      players[0].id === players[2].id ||
      players[1].id === players[2].id
    ) {
      throw Error("Duplicate player");
    }

    const scrimSignups = await this.getRawSignups(scrim);
    // yes this is a three deep for loop, this is a cry for help, please optimize this
    for (const team of scrimSignups) {
      if (team.teamName === teamName) {
        throw Error("Duplicate team name");
      }
      for (const id of team.players.map((player) => player.discordId)) {
        for (const player of players) {
          if (player.id === id) {
            throw Error(
              `Player already signed up on different team: ${player.displayName} <@${id}> on team ${team.teamName}`,
            );
          }
        }
      }
    }
    const playersToInsert = [commandUser, ...players];
    const convertedPlayers: PlayerInsert[] = playersToInsert.map(
      (discordUser) => ({
        discordId: discordUser.id,
        displayName: discordUser.displayName,
      }),
    );
    const insertedPlayers = await this.db.insertPlayers(convertedPlayers);
    await this.checkForBans(scrim, insertedPlayers.slice(1));
    await this.checkForMissingOverstat(
      insertedPlayers.slice(1),
      commandUserRoleIds,
    );
    const signupDate = new Date();
    const signupId = await this.db.addScrimSignup(
      teamName,
      scrim.id,
      insertedPlayers[0].id,
      insertedPlayers[1].id,
      insertedPlayers[2].id,
      insertedPlayers[3].id,
      signupDate,
    );
    const scrimSignup: ScrimSignup = {
      teamName: teamName,
      players: insertedPlayers.slice(1),
      signupPlayer: insertedPlayers[0],
      signupId,
      date: signupDate,
    };
    scrimSignups.push(scrimSignup);
    this.updateScrimSignupCount(scrim);
    return scrimSignup;
  }

  private async checkForMissingOverstat(
    players: Player[],
    commandUserRoleIds: string[],
  ) {
    if (!(await this.staticValueService.requireOverstatForSignup())) {
      return;
    }
    if (await this.authService.memberIsAdmin(commandUserRoleIds)) {
      return;
    }
    for (const player of players) {
      if (!player.overstatId) {
        throw Error(
          `No overstat linked for ${player.displayName}. Use /link-overstat in ${OVERSTAT_LINK_CHANNEL_URL}. Don't have an overstat? Create a https://discord.com/channels/1043350338574495764/1335824833757450263 and let an admin know your signup information so they can complete it for you`,
        );
      }
    }
  }

  private async checkForBans(scrim: Scrim, players: Player[]) {
    const ban = await this.banService.teamHasBan(scrim, players);
    if (ban.hasBan) {
      throw Error(`One or more players are scrim banned. ${ban.reason}`);
    }
  }

  async getSignups(
    discordChannelID: string,
    discordIdsWithScrimPass?: string[],
  ): Promise<{ mainList: ScrimSignup[]; waitList: ScrimSignup[] }> {
    const scrim = await this.scrimService.getScrim(discordChannelID);
    if (!scrim) {
      throw Error("No scrim found for that channel");
    }
    const teams = await this.getRawSignups(scrim);
    await this.prioService.getTeamPrioForScrim(
      scrim,
      teams,
      discordIdsWithScrimPass ?? [],
    );
    return this.sortTeams(teams);
  }

  private sortTeams(teams: ScrimSignup[]): {
    mainList: ScrimSignup[];
    waitList: ScrimSignup[];
  } {
    const lobbySize = this.lobbySize;
    const waitlistCutoff =
      lobbySize * Math.floor(teams.length / lobbySize) || lobbySize;
    const sortedTeams = [...teams].sort((teamA, teamB) => {
      const prioResult = (teamB.prio?.amount ?? 0) - (teamA.prio?.amount ?? 0);
      if (prioResult !== 0) {
        return prioResult;
      }
      return teamA.date.valueOf() - teamB.date.valueOf();
    });
    return {
      mainList: sortedTeams.splice(0, waitlistCutoff),
      waitList: sortedTeams,
    };
  }

  static convertDbToScrimSignup(
    dbTeamData: ScrimSignupsWithPlayers,
  ): ScrimSignup {
    const convertedTeamData = this.convertToPlayers(dbTeamData);
    return {
      signupId: "for now we dont get the id",
      teamName: dbTeamData.team_name,
      players: convertedTeamData.players,
      signupPlayer: convertedTeamData.signupPlayer,
      date: new Date(dbTeamData.date_time),
    };
  }

  static convertToPlayers(dbTeamData: ScrimSignupsWithPlayers): {
    signupPlayer: Player;
    players: Player[];
  } {
    return {
      signupPlayer: {
        id: dbTeamData.signup_player_id,
        displayName: dbTeamData.signup_player_display_name,
        discordId: dbTeamData.signup_player_discord_id,
        overstatId: undefined,
        elo: undefined,
      },
      players: [
        {
          id: dbTeamData.player_one_id,
          displayName: dbTeamData.player_one_display_name,
          discordId: dbTeamData.player_one_discord_id,
          overstatId: dbTeamData.player_one_overstat_id,
          elo: dbTeamData.player_one_elo,
        },
        {
          id: dbTeamData.player_two_id,
          displayName: dbTeamData.player_two_display_name,
          discordId: dbTeamData.player_two_discord_id,
          overstatId: dbTeamData.player_two_overstat_id,
          elo: dbTeamData.player_two_elo,
        },
        {
          id: dbTeamData.player_three_id,
          displayName: dbTeamData.player_three_display_name,
          discordId: dbTeamData.player_three_discord_id,
          overstatId: dbTeamData.player_three_overstat_id,
          elo: dbTeamData.player_three_elo,
        },
      ],
    };
  }

  async getRawSignups(scrim: Scrim): Promise<ScrimSignup[]> {
    const scrimData = await this.db.getScrimSignupsWithPlayers(scrim.id);
    const teams: ScrimSignup[] = [];
    for (const signupData of scrimData) {
      const teamData: ScrimSignup =
        SignupService.convertDbToScrimSignup(signupData);
      teams.push(teamData);
    }
    return teams;
  }

  private async updateScrimSignupCount(scrim: Scrim) {
    const signups = await this.getRawSignups(scrim);
    const count = signups.length;
    try {
      await this.scrimNotifier.updateSignupPostDescription(scrim, count);
    } catch (e) {
      await this.alertService.warn(
        `Unable to update scrim signup count for scrim ${scrim.id} channel ${scrim.discordChannel}: ${e}`,
      );
    }
  }
}
