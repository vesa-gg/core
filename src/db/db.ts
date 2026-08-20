import { Player, PlayerInsert } from "../models/Player";
import {
  LeagueRosterChangeInsert,
  LeagueSubRequestInsert,
  LeagueTeamPlayerInsert,
  ScrimSignupsWithPlayers,
} from "./table.interfaces";
import {
  Comparator,
  DbTable,
  DbValue,
  Expression,
  ExtractReturnType,
  FieldSelection,
  JSONValue,
  LogicalExpression,
} from "./types";
import { DiscordRole } from "../models/Role";
import { ExpungedPlayerPrio } from "../models/Prio";
import { parseScrimType, ScrimType, Scrim } from "../models/Scrims";

export interface GoogleSheetConfig {
  spreadsheetId: string;
  tabName: string;
  rangeStart: string;
}

export abstract class DB {
  abstract get<K extends FieldSelection[]>(
    tableName: DbTable,
    logicalExpression: LogicalExpression | undefined,
    fieldsToReturn: [...K],
  ): Promise<Array<ExtractReturnType<K>>>;

  abstract update<K extends string>(
    tableName: DbTable,
    logicalExpression: LogicalExpression,
    fieldsToUpdate: Record<string, DbValue>,
    fieldsToReturn: K[],
  ): Promise<Array<Record<K, DbValue>>>;
  // returns id of new object as a string
  abstract post(
    tableName: DbTable,
    data: Record<string, DbValue>[],
  ): Promise<string[]>;
  // returns id of the deleted object as a string
  abstract deleteById(tableName: DbTable, id: string): Promise<string>;
  abstract delete<K extends string>(
    tableName: string,
    logicalExpression: LogicalExpression,
    fieldsToReturn: K[],
  ): Promise<Array<Record<K, DbValue>>>;

  abstract customQuery(query: string): Promise<JSONValue>;
  abstract downloadFileById(fileId: string): Promise<Blob>;
  abstract downloadFileByName(fileName: string): Promise<Blob>;
  abstract replaceTeammate(
    scrimId: string,
    teamName: string,
    userId: string, // the user making the change, this gets authorized by the db
    oldPlayerId: string,
    newPlayerId: string,
  ): Promise<JSONValue>;
  abstract replaceTeammateNoAuth(
    scrimId: string,
    teamName: string,
    oldPlayerId: string,
    newPlayerId: string,
  ): Promise<JSONValue>;
  abstract changeTeamName(
    scrimId: string,
    userId: string, // the user making the change, this gets authorized by the db
    teamName: string,
    newTeamName: string,
  ): Promise<JSONValue>;

  async createNewScrim(
    dateTime: Date,
    discordChannelID: string,
    overstatId: string | null = null,
    overstatJson: JSON | null = null,
    scrimType?: ScrimType,
  ): Promise<string> {
    const ids = await this.post(DbTable.scrims, [
      this.removeUndefined({
        date_time_field: dateTime,
        discord_channel: discordChannelID,
        overstat_id: overstatId,
        overstat_json: overstatJson,
        scrim_type: scrimType,
      }),
    ]);
    return ids[0];
  }

  async updateScrim(
    scrimId: string,
    updatedData: {
      dateTime?: Date;
      discordChannelID?: string;
      overstatId?: string;
      overstatJson?: JSON;
    },
  ): Promise<void> {
    const updatedDataInsert = this.removeUndefined({
      date_time_field: updatedData.dateTime,
      discord_channel: updatedData.discordChannelID,
      overstat_id: updatedData.overstatId,
      overstat_json: updatedData.overstatJson,
    });
    await this.update(
      DbTable.scrims,
      { fieldName: "id", comparator: "eq", value: scrimId },
      updatedDataInsert,
      ["id"],
    );
  }

  // removes any undefined values from the object
  private removeUndefined(
    obj: Record<string, DbValue | undefined>,
  ): Record<string, DbValue> {
    return Object.entries(obj).reduce(
      (acc: Record<string, DbValue>, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      },
      {},
    );
  }

  async closeScrim(discordChannelID: string): Promise<string[]> {
    const updatedScrimInfo: { id: DbValue }[] = await this.update(
      DbTable.scrims,
      {
        fieldName: "discord_channel",
        comparator: "eq" as Comparator,
        value: discordChannelID,
      },
      { active: false },
      ["id"],
    );
    if (!updatedScrimInfo[0]?.id) {
      throw Error("Could not set scrim(s) to inactive, no updates made");
    }
    const equateExpressions: Expression[] = updatedScrimInfo.map((scrim) => ({
      fieldName: "scrim_id",
      comparator: "eq" as Comparator,
      value: scrim.id,
    }));
    const deletedScrimSignups = await this.delete(
      DbTable.scrimSignups,
      {
        operator: "or",
        expressions: equateExpressions,
      },
      ["id"],
    );
    return deletedScrimSignups.map((entry) => entry.id as string);
  }

  async addScrimSignup(
    teamName: string,
    scrimId: string,
    userId: string,
    playerId: string,
    playerTwoId: string,
    playerThreeId: string,
    date: Date,
    combinedElo: number | null = null,
  ): Promise<string> {
    const ids = await this.post(DbTable.scrimSignups, [
      {
        team_name: teamName,
        scrim_id: scrimId,
        signup_player_id: userId,
        player_one_id: playerId,
        player_two_id: playerTwoId,
        player_three_id: playerThreeId,
        combined_elo: combinedElo,
        date_time: date,
      },
    ]);
    return ids[0];
  }

  async removeScrimSignup(teamName: string, scrimId: string): Promise<string> {
    const deletedEntries = await this.delete(
      DbTable.scrimSignups,
      {
        operator: "and",
        expressions: [
          {
            fieldName: "scrim_id",
            comparator: "eq",
            value: scrimId,
          },
          {
            fieldName: "team_name",
            comparator: "eq",
            value: teamName,
          },
        ],
      },
      ["id"],
    );
    return deletedEntries[0].id as string;
  }

  // returns id
  async insertPlayerIfNotExists(
    discordId: string,
    displayName: string,
    overstatId?: string,
  ): Promise<Player> {
    const overstatLinkObjectSuffix = overstatId
      ? `, overstat_id: "${overstatId}"`
      : "";
    const overstatLinkColumn = overstatId ? `\n              overstat_id` : "";
    const query = `
      mutation upsertPlayer {
        insert_players_one(
          object: {discord_id: "${discordId}", display_name: "${displayName}"${overstatLinkObjectSuffix}}
          on_conflict: {
            constraint: players_discord_id_key,  # Unique constraint on discord_id
            update_columns: [
              display_name${overstatLinkColumn}
            ]
          }
        ) {
          id  # Return the ID of the player, whether newly inserted or found
          overstat_id
          display_name
          discord_id
          elo
        }
      }
    `;
    const result: JSONValue = await this.customQuery(query);
    const returnedData = result as {
      insert_players_one: {
        id: string;
        display_name: string;
        discord_id: string;
        overstat_id: string | null;
        elo: number | null;
      };
    };
    return {
      id: returnedData.insert_players_one.id,
      discordId: returnedData.insert_players_one.discord_id,
      displayName: returnedData.insert_players_one.display_name,
      overstatId: returnedData.insert_players_one.overstat_id ?? undefined,
      elo: returnedData.insert_players_one.elo ?? undefined,
    };
  }

  /*
   * A special method that inserts players if they do not exist, also takes special care not to overwrite overstats and elo if they are in DB but not included in player object
   */
  async insertPlayers(players: PlayerInsert[]): Promise<Player[]> {
    const playerMap: Map<string, PlayerInsert> = new Map();
    for (const player of players) {
      playerMap.set(player.discordId, player);
    }
    const nonDuplicatePlayers = [...playerMap.values()];
    const playerUpdates = nonDuplicatePlayers
      .map((player, index) =>
        this.generatePlayerUpdateQuery(player, (index + 1).toString()),
      )
      .join("\n\n");
    const playerInsert = `
      insert_players(objects: [
        ${nonDuplicatePlayers.map((player) => `{discord_id: "${player.discordId}", display_name: "${player.displayName}"}`).join("\n")}
      ]
        on_conflict: {
          constraint: players_discord_id_key,   # Unique constraint on discord_id
          update_columns: [
            display_name  # necessary for graphql to actually return an id
          ]
        }
      ) {
        returning {
          id
          discord_id
          overstat_id
          display_name
        }
      }
    `;
    const query = `
      mutation upsertPlayer {
        ${playerInsert}

        ${playerUpdates}
      }
    `;
    const result: JSONValue = await this.customQuery(query);
    const returnedData: {
      insert_players: {
        returning: {
          id: string;
          discord_id: string;
          overstat_id: string;
          display_name: string;
        }[];
      };
    } = result as unknown as {
      insert_players: {
        returning: {
          id: string;
          discord_id: string;
          overstat_id: string;
          display_name: string;
        }[];
      };
    };

    return players
      .map((player) => {
        const playerData = returnedData.insert_players.returning.find(
          (entry) => entry.discord_id === player.discordId,
        );
        if (!playerData) {
          return undefined;
        }
        return {
          id: playerData.id,
          discordId: playerData.discord_id,
          displayName: playerData.display_name,
          overstatId: playerData.overstat_id,
        };
      })
      .filter((player) => !!player);
  }

  // This feels like a really gross way to grab a single entry
  async getPlayerFromDiscordId(discordId: string): Promise<Player> {
    const dbData = await this.get(
      DbTable.players,
      {
        fieldName: "discord_id",
        comparator: "eq",
        value: discordId,
      },
      ["id", "display_name", "overstat_id"],
    );
    return {
      discordId: discordId,
      displayName: dbData[0].display_name as string,
      id: dbData[0].id as string,
      overstatId: dbData[0].overstat_id as string,
    };
  }

  async getPlayerFromOverstatId(
    overstatId: string,
  ): Promise<Player | undefined> {
    const dbData = await this.get(
      DbTable.players,
      {
        fieldName: "overstat_id",
        comparator: "eq",
        value: overstatId,
      },
      ["id", "display_name", "discord_id"],
    );
    if (dbData.length > 0) {
      return {
        discordId: dbData[0].discord_id as string,
        displayName: dbData[0].display_name as string,
        id: dbData[0].id as string,
        overstatId,
      };
    } else {
      return undefined;
    }
  }

  async getScrimsByDiscordChannel(discordChannelID: string): Promise<Scrim[]> {
    const dbResult = await this.get(
      DbTable.scrims,
      {
        fieldName: "discord_channel",
        comparator: "eq",
        value: discordChannelID,
      },
      ["id", "overstat_id", "date_time_field", "active", "scrim_type"],
    );
    return dbResult.map((entry) => ({
      id: entry.id as string,
      dateTime: new Date(entry.date_time_field as string),
      overstatId: entry.overstat_id as string,
      discordChannel: discordChannelID,
      active: entry.active as boolean,
      scrimType: parseScrimType(entry.scrim_type as string),
    }));
  }

  async getActiveScrims(): Promise<
    {
      discordChannel: string;
      id: string;
      dateTimeField: string;
      scrimType: ScrimType;
    }[]
  > {
    const dbData = (await this.get(
      DbTable.scrims,
      { fieldName: "active", comparator: "eq", value: true },
      ["discord_channel", "id", "date_time_field", "scrim_type"],
    )) as {
      discord_channel: string;
      id: string;
      date_time_field: string;
      scrim_type: string;
    }[];
    return dbData.map((dbScrim) => ({
      discordChannel: dbScrim.discord_channel as string,
      id: dbScrim.id as string,
      dateTimeField: dbScrim.date_time_field as string,
      scrimType: parseScrimType(dbScrim.scrim_type),
    }));
  }

  async getActiveLeagueSeason(date: Date = new Date()): Promise<{
    id: string;
    signupSheet: GoogleSheetConfig;
    subSheet: GoogleSheetConfig;
    rosterChangeSheet: GoogleSheetConfig;
    rosterSheet: GoogleSheetConfig | null;
    signupPrioEndDate: string;
    startDate: string;
  } | null> {
    const dbData = await this.get(
      DbTable.leagueSeasons,
      {
        operator: "and",
        expressions: [
          {
            fieldName: "signup_start_date",
            comparator: "lte",
            value: date,
          },
          {
            fieldName: "signup_end_date",
            comparator: "gte",
            value: date,
          },
        ],
      },
      [
        "id",
        "signup_prio_end_date",
        "start_date",
        { signup_sheet: ["sheet_id", "tab_name", "range_start"] },
        { sub_sheet: ["sheet_id", "tab_name", "range_start"] },
        { roster_change_sheet: ["sheet_id", "tab_name", "range_start"] },
        { roster_sheet: ["sheet_id", "tab_name", "range_start"] },
      ],
    );

    if (dbData.length > 0) {
      const row = dbData[0];
      return {
        id: row.id as string,
        signupPrioEndDate: row.signup_prio_end_date as string,
        startDate: row.start_date as string,
        signupSheet: {
          spreadsheetId: row.signup_sheet.sheet_id as string,
          tabName: row.signup_sheet.tab_name as string,
          rangeStart: row.signup_sheet.range_start as string,
        },
        subSheet: {
          spreadsheetId: row.sub_sheet.sheet_id as string,
          tabName: row.sub_sheet.tab_name as string,
          rangeStart: row.sub_sheet.range_start as string,
        },
        rosterChangeSheet: {
          spreadsheetId: row.roster_change_sheet.sheet_id as string,
          tabName: row.roster_change_sheet.tab_name as string,
          rangeStart: row.roster_change_sheet.range_start as string,
        },
        rosterSheet: row.roster_sheet
          ? {
              spreadsheetId: row.roster_sheet.sheet_id as string,
              tabName: row.roster_sheet.tab_name as string,
              rangeStart: row.roster_sheet.range_start as string,
            }
          : null,
      };
    } else {
      return null;
    }
  }

  async getScrimSignupsWithPlayers(
    scrimId: string,
  ): Promise<ScrimSignupsWithPlayers[]> {
    const query = `
      query GetScrimSignupsWithPlayers {
        get_scrim_signups_with_players(args: { scrim_id_search: "${scrimId}" }) {
          scrim_id
          date_time
          team_name
          signup_player_id
          signup_player_discord_id
          signup_player_display_name
          player_one_id
          player_one_discord_id
          player_one_display_name
          player_one_overstat_id
          player_one_elo
          player_two_id
          player_two_discord_id
          player_two_display_name
          player_two_overstat_id
          player_two_elo
          player_three_id
          player_three_discord_id
          player_three_display_name
          player_three_overstat_id
          player_three_elo
        }
      }
    `;

    const result: JSONValue = await this.customQuery(query);
    const returnedData: {
      get_scrim_signups_with_players: ScrimSignupsWithPlayers[];
    } = result as unknown as {
      get_scrim_signups_with_players: ScrimSignupsWithPlayers[];
    };
    return returnedData.get_scrim_signups_with_players;
  }

  // to be called if user role is admin
  changeTeamNameNoAuth(
    scrimId: string,
    oldTeamName: string,
    newTeamName: string,
  ): Promise<JSONValue> {
    return this.update(
      DbTable.scrimSignups,
      {
        operator: "and",
        expressions: [
          {
            fieldName: "scrim_id",
            comparator: "eq",
            value: scrimId,
          },
          {
            fieldName: "team_name",
            comparator: "eq",
            value: oldTeamName,
          },
        ],
      },
      { team_name: newTeamName },
      [
        "team_name",
        "player_one_id",
        "player_two_id",
        "player_three_id",
        "scrim_id",
      ],
    ) as Promise<
      {
        team_name: string;
        player_one_id: string;
        player_two_id: string;
        player_three_id: string;
        scrim_id: string;
      }[]
    >;
  }

  async setPrio(
    playerIds: string[],
    startDate: Date,
    endDate: Date,
    amount: number,
    reason: string,
  ): Promise<string[]> {
    return this.post(
      DbTable.prio,
      playerIds.map((playerId) => ({
        player_id: playerId,
        start_date: startDate,
        end_date: endDate,
        amount,
        reason,
      })),
    );
  }

  async addBans(
    playerIds: string[],
    startDate: Date,
    endDate: Date,
    reason: string,
  ): Promise<string[]> {
    return this.post(
      DbTable.scrimBans,
      playerIds.map((playerId) => ({
        player_id: playerId,
        start_date: startDate,
        end_date: endDate,
        reason,
      })),
    );
  }

  abstract expungePrio(prioIds: string[]): Promise<ExpungedPlayerPrio[]>;
  abstract expungeBans(banIds: string[]): Promise<
    {
      playerDiscordId: string;
      playerDisplayName: string;
      endDate: Date;
    }[]
  >;

  async getPrio(
    date: Date,
  ): Promise<
    { id: string; discordId: string; amount: number; reason: string }[]
  > {
    const dbData = await this.get(
      DbTable.prio,
      {
        operator: "and",
        expressions: [
          {
            fieldName: "start_date",
            comparator: "lte",
            value: date,
          },
          {
            fieldName: "end_date",
            comparator: "gte",
            value: date,
          },
        ],
      },
      [{ player: ["discord_id", "id"] }, "amount", "reason"],
    );
    return dbData.map(({ player, amount, reason }) => ({
      id: player.id as string,
      discordId: player.discord_id as string,
      amount: amount as number,
      reason: reason as string,
    }));
  }

  async getBans(
    date: Date,
    players: Player[],
  ): Promise<{ id: string; name: string; reason: string }[]> {
    const dbData = await this.get(
      DbTable.scrimBans,
      {
        operator: "and",
        expressions: [
          {
            fieldName: "start_date",
            comparator: "lte",
            value: date,
          },
          {
            fieldName: "end_date",
            comparator: "gte",
            value: date,
          },
          {
            operator: "or",
            expressions: players.map((player) => ({
              fieldName: "player_id",
              comparator: "eq",
              value: player.id,
            })),
          },
        ],
      },
      [{ player: ["display_name", "id"] }, "reason"],
    );
    return dbData.map(({ player, reason }) => ({
      id: player.id as string,
      name: player.display_name as string,
      reason: reason as string,
    }));
  }

  async getAdminRoles(): Promise<DiscordRole[]> {
    const results = await this.get(DbTable.scrimAdminRoles, undefined, [
      "discord_role_id",
      "role_name",
    ]);
    return results.map((role) => ({
      discordRoleId: role.discord_role_id as string,
      roleName: role.role_name as string,
    }));
  }

  async addAdminRoles(roles: DiscordRole[]): Promise<string[]> {
    return this.post(
      DbTable.scrimAdminRoles,
      roles.map((role) => ({
        discord_role_id: role.discordRoleId,
        role_name: role.roleName,
      })),
    );
  }

  async removeAdminRoles(roleIds: string[]): Promise<string[]> {
    const deletedEntries = await this.delete(
      DbTable.scrimAdminRoles,
      {
        operator: "or",
        expressions: roleIds.map((roleId) => ({
          fieldName: "discord_role_id",
          comparator: "eq",
          value: roleId,
        })),
      },
      ["id"],
    );
    return deletedEntries.map((entry) => entry.id as string);
  }

  async insertLeagueSignup(
    seasonId: string,
    team: {
      teamName: string;
      daysUnableToPlay: string;
      compKnowledge: string;
      additionalComments: string | null;
    },
    players: LeagueTeamPlayerInsert[],
  ): Promise<{ teamId: string; signupNumber: number }> {
    const submittedAt = new Date();

    const [teamId] = await this.post(DbTable.leagueTeams, [
      {
        season_id: seasonId,
        team_name: team.teamName,
        days_unable_to_play: team.daysUnableToPlay,
        comp_knowledge: team.compKnowledge,
        additional_comments: team.additionalComments,
        status: "pending",
        submitted_at: submittedAt,
      },
    ]);

    await this.post(
      DbTable.leagueTeamPlayers,
      players.map((p) => ({
        team_id: teamId,
        player_id: p.playerId,
        slot: p.slot,
        apex_rank: p.apexRank,
        platform: p.platform,
        prev_season_division: p.prevSeasonDivision,
        elo: p.elo,
      })),
    );

    const countQuery = `
      query GetLeagueTeamSignupNumber {
        league_teams_aggregate(
          where: {
            season_id: { _eq: "${seasonId}" }
            status: { _neq: "dropped" }
            submitted_at: { _lte: "${submittedAt.toISOString()}" }
          }
        ) {
          aggregate {
            count
          }
        }
      }
    `;
    const countResult = (await this.customQuery(countQuery)) as {
      league_teams_aggregate: { aggregate: { count: number } };
    };
    const signupNumber = countResult.league_teams_aggregate.aggregate.count;

    return { teamId, signupNumber };
  }

  async getLeagueTeamIdByName(
    seasonId: string,
    teamName: string,
  ): Promise<string | null> {
    const teams = await this.get(
      DbTable.leagueTeams,
      {
        operator: "and",
        expressions: [
          { fieldName: "season_id", comparator: "eq", value: seasonId },
          { fieldName: "team_name", comparator: "eq", value: teamName },
        ],
      },
      ["id"],
    );
    return teams.length === 1 ? (teams[0].id as string) : null;
  }

  async insertLeagueSubRequest(data: LeagueSubRequestInsert): Promise<string> {
    const [id] = await this.post(DbTable.leagueSubRequests, [
      {
        season_id: data.seasonId,
        team_id: data.teamId,
        team_name: data.teamName,
        division: data.division,
        week_number: data.weekNumber,
        player_out_id: data.playerOutId,
        player_in_id: data.playerInId,
        player_in_division: data.playerInDivision,
        requested_by_id: data.requestedById,
        additional_comments: data.additionalComments,
        status: "pending",
        submitted_at: new Date(),
      },
    ]);
    return id;
  }

  async insertLeagueRosterChange(
    data: LeagueRosterChangeInsert,
  ): Promise<string> {
    const [id] = await this.post(DbTable.leagueRosterChanges, [
      {
        season_id: data.seasonId,
        team_id: data.teamId,
        team_name: data.teamName,
        division: data.division,
        player_out_id: data.playerOutId,
        player_in_id: data.playerInId,
        requested_by_id: data.requestedById,
        additional_comments: data.additionalComments,
        status: "pending",
        submitted_at: new Date(),
      },
    ]);
    return id;
  }

  async getLeagueRosterMap(seasonId: string): Promise<Map<string, string>> {
    const query = `
      query GetLeagueRoster {
        league_teams(where: {season_id: {_eq: "${seasonId}"}}) {
          team_name
          league_team_players {
            player {
              discord_id
            }
          }
        }
      }
    `;

    const result = (await this.customQuery(query)) as {
      league_teams: {
        team_name: string;
        league_team_players: {
          player: { discord_id: string };
        }[];
      }[];
    };

    const rosterMap = new Map<string, string>();
    for (const team of result.league_teams) {
      for (const teamPlayer of team.league_team_players) {
        rosterMap.set(teamPlayer.player.discord_id, team.team_name);
      }
    }
    return rosterMap;
  }

  private generatePlayerUpdateQuery(
    player: PlayerInsert,
    uniqueQueryName: string,
  ) {
    const overstatSet = player.overstatId
      ? `overstat_id: "${player.overstatId}"`
      : "";
    const eloSet = player.elo ? `elo: ${player.elo}` : "";
    return `
      update_player_${uniqueQueryName}: update_players(
         where: {discord_id: {_eq: "${player.discordId}"}},
          _set: {
            display_name: "${player.displayName}",
            ${overstatSet}${overstatSet && eloSet ? "," : ""}
            ${eloSet}
          }
        ) {
          affected_rows
        }
    `;
  }
}
