import { GuildMember, User } from "discord.js";
import { DB } from "../db/db";
import { Scrim, ScrimSignup } from "../models/Scrims";
import { AuthService } from "./auth";
import { DiscordService } from "./discord";
import { BanService } from "./ban";
import { Player } from "../models/Player";
import { StaticValueService } from "./static-values";
import { SignupService } from "./signups";
import { ScrimService } from "./scrim-service";
import { AlertService } from "./alert";

export class RosterService {
  constructor(
    private db: DB,
    private authService: AuthService,
    private discordService: DiscordService,
    private banService: BanService,
    private staticValueService: StaticValueService,
    private scrimService: ScrimService,
    private signupService: SignupService,
    private alertService: AlertService,
  ) {}

  async replaceTeammate(
    memberUsingCommand: GuildMember,
    discordChannel: string,
    teamName: string,
    oldUser: User,
    newUser: User,
  ): Promise<ScrimSignup> {
    const { teamToBeChanged, scrim, signups, isAdmin } =
      await this.getDataIfAuthorized(
        memberUsingCommand,
        discordChannel,
        teamName,
      );
    for (const team of signups) {
      for (const player of team.players) {
        if (player.discordId === newUser.id) {
          throw Error("New player is already on a team in this scrim");
        }
      }
    }
    let oldPlayerId: string | undefined;
    let oldPlayerIndex = 0;
    for (const player of teamToBeChanged.players) {
      if (player.discordId === oldUser.id) {
        oldPlayerId = player.id;
        break;
      }
      oldPlayerIndex++;
    }
    if (!oldPlayerId) {
      throw Error("Player being replaced is not on this team");
    }
    const newPlayer = await this.db.insertPlayerIfNotExists(
      newUser.id as string,
      newUser.displayName,
    );
    await this.checkSubBlockers(scrim, newPlayer, isAdmin);
    await this.db.replaceTeammateNoAuth(
      scrim.id,
      teamName,
      oldPlayerId,
      newPlayer.id,
    );
    teamToBeChanged.players[oldPlayerIndex] = {
      id: newPlayer.id,
      discordId: newUser.id as string,
      displayName: newUser.displayName,
      overstatId: newPlayer.overstatId,
    };
    return teamToBeChanged;
  }

  private async checkSubBlockers(
    scrim: Scrim,
    newPlayer: Player,
    isAdmin: boolean,
  ) {
    const requireOverstat =
      await this.staticValueService.requireOverstatForSignup();
    if (requireOverstat && !newPlayer.overstatId && !isAdmin) {
      throw Error("New player has no overstat set");
    }
    const { rosterLockDate } = await this.staticValueService.getScrimInfoTimes(
      scrim.dateTime,
    );
    if (new Date() > rosterLockDate && !isAdmin) {
      throw new Error(
        "It is past the roster lock time. Rosters are locked, please create a ticket if you need to sub",
      );
    }
    const ban = await this.banService.teamHasBan(scrim, [newPlayer]);
    if (ban.hasBan) {
      throw Error("New player is scrim banned. " + ban.reason);
    }
  }

  async removeSignup(
    memberUsingCommand: GuildMember,
    discordChannel: string,
    teamName: string,
  ): Promise<void> {
    const { teamToBeChanged, signups, scrim } = await this.getDataIfAuthorized(
      memberUsingCommand,
      discordChannel,
      teamName,
    );
    await this.db.removeScrimSignup(teamToBeChanged.teamName, scrim.id);
    signups.splice(signups.indexOf(teamToBeChanged), 1);
    this.updateScrimSignupCount(discordChannel);
  }

  async changeTeamName(
    memberUsingCommand: GuildMember,
    discordChannel: string,
    oldTeamName: string,
    newTeamName: string,
  ): Promise<void> {
    const { teamToBeChanged, scrim, signups } = await this.getDataIfAuthorized(
      memberUsingCommand,
      discordChannel,
      oldTeamName,
    );
    for (const team of signups) {
      if (team.teamName === newTeamName) {
        throw Error("Team name already taken in this scrim set");
      }
    }
    await this.db.changeTeamNameNoAuth(
      scrim.id,
      teamToBeChanged.teamName,
      newTeamName,
    );
    teamToBeChanged.teamName = newTeamName;
  }

  private async getDataIfAuthorized(
    memberUsingCommand: GuildMember,
    discordChannel: string,
    teamName: string,
  ): Promise<{
    scrim: Scrim;
    signups: ScrimSignup[];
    teamToBeChanged: ScrimSignup;
    isAdmin: boolean;
  }> {
    const scrim = await this.scrimService.getScrim(discordChannel);
    if (!scrim) {
      throw Error(
        "No scrim matching that scrim channel present, contact admin",
      );
    }
    const signups = await this.signupService.getRawSignups(scrim);
    const teamToBeChanged = signups.find((team) => team.teamName === teamName);
    if (!teamToBeChanged) {
      throw Error("No team with that name");
    }
    const isAdmin = await this.authService.memberIsAdmin(memberUsingCommand);
    const isOnTeam = this.memberIsOnTeam(memberUsingCommand, teamToBeChanged);
    if (!isOnTeam && !isAdmin) {
      throw Error("User issuing command not authorized to make changes");
    }
    return { scrim, signups, teamToBeChanged, isAdmin };
  }

  private memberIsOnTeam(member: GuildMember, team: ScrimSignup): boolean {
    const authorizedPlayers = [team.signupPlayer, ...team.players];
    const foundPlayer = authorizedPlayers.find(
      (player) => player.discordId === member.id,
    );

    return !!foundPlayer;
  }

  private async updateScrimSignupCount(discordChannel: string) {
    const scrim = await this.scrimService.getScrim(discordChannel);

    try {
      if (!scrim) {
        throw Error("No scrim for that channel");
      }
      const count = (await this.signupService.getRawSignups(scrim)).length;
      await this.discordService.updateSignupPostDescription(scrim, count);
    } catch (e) {
      await this.alertService.warn(
        `Unable to update scrim signup count for scrim ${scrim?.id} channel ${scrim?.discordChannel}: ${e}`,
      );
    }
  }
}
