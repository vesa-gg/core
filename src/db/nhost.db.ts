import { DB } from "./db";
import {
  DbValue,
  ExtractReturnType,
  FieldSelection,
  isCompoundExpression,
  isExpression,
  JSONValue,
  LogicalExpression,
} from "./types";
import { ErrorPayload, NhostClient } from "@nhost/nhost-js";
import { GraphQLError } from "graphql/error";
import { ExpungedPlayerPrio } from "../models/Prio";
import { appConfig } from "../config";
import { isJson } from "../utility/utility";

class NhostDb extends DB {
  private nhostClient: NhostClient;

  constructor(adminSecret: string, region: string, subdomain: string) {
    super();
    this.nhostClient = new NhostClient({
      autoLogin: false,
      subdomain,
      region,
      adminSecret,
    });
  }

  private generateWhereClause(
    logicalExpression: LogicalExpression | undefined,
  ): string {
    if (logicalExpression === undefined) {
      return "";
    }
    const searchString = this.getCompoundExpressionString(logicalExpression);
    return `where: ${searchString}`;
  }

  // recursive to handle nested compound statements
  private getCompoundExpressionString(
    logicalExpression: LogicalExpression,
  ): string {
    if (isCompoundExpression(logicalExpression)) {
      const subExpressions = logicalExpression.expressions.map((expression) => {
        if (isExpression(expression)) {
          return `{ ${expression.fieldName}: { _${expression.comparator}: ${NhostDb.createValueString(expression.value)} } }`;
        }
        return this.getCompoundExpressionString(expression);
      });
      return `{ _${logicalExpression.operator}: [${subExpressions.join(", ")}] }`;
    } else if (isExpression(logicalExpression)) {
      return `{ ${logicalExpression.fieldName}: { _${logicalExpression.comparator}: ${NhostDb.createValueString(logicalExpression.value)} } }`;
    }
    return "";
  }

  private getReturnString<K extends FieldSelection[]>(
    fieldsToReturn: K,
  ): string {
    const returnArray: string[] = [];
    for (const fieldName of fieldsToReturn) {
      if (typeof fieldName === "string") {
        returnArray.push(fieldName);
      } else {
        let subFieldString = "";
        for (const subFieldName in fieldName) {
          subFieldString += `${subFieldName} {\n`;
          subFieldString +=
            "            " +
            this.getReturnString(fieldName[subFieldName])
              .split("\n")
              .join("\n  ");
          subFieldString += "\n          }";
        }
        returnArray.push(subFieldString);
      }
    }
    return returnArray.join("\n          ");
  }

  async get<K extends FieldSelection[]>(
    tableName: string,
    logicalExpression: LogicalExpression | undefined,
    fieldsToReturn: [...K],
  ): Promise<Array<ExtractReturnType<K>>> {
    let searchString = this.generateWhereClause(logicalExpression);
    if (searchString) {
      // only add parentheses if we have something to search with
      searchString = `(${searchString})`;
    }
    const query = `
      query {
        ${tableName}${searchString} {
          ${this.getReturnString(fieldsToReturn)}
        }
      }
    `;
    const result = await this.nhostClient.graphql.request(query);
    if (!result.data || result.error) {
      throw new Error(this.getDbErrorMessage(result));
    }
    const dataArray = result.data as Record<
      string,
      Array<ExtractReturnType<K>>
    >;
    return dataArray[tableName] as Array<ExtractReturnType<K>>;
  }

  async post(
    tableName: string,
    data: Record<string, DbValue>[],
  ): Promise<string[]> {
    const insertName = "insert_" + tableName;
    const objects: string[] = [];
    for (const object of data) {
      const objectToInsert = Object.keys(object)
        .map(
          (key: string) => `${key}: ${NhostDb.createValueString(object[key])}`,
        )
        .join(", ");
      objects.push(`{ ${objectToInsert} }`);
    }
    const objectsString = `(objects: [${objects.join(", ")}])`;
    const query = `
      mutation {
        ${insertName}${objectsString} {
          returning {
            id
          }
        }
      }
    `;
    const result: {
      data: JSONValue | null;
      error: GraphQLError[] | ErrorPayload | null;
    } = await this.nhostClient.graphql.request(query);
    if (!result.data || result.error) {
      throw new Error(this.getDbErrorMessage(result));
    }
    const returnedData: Record<string, { returning: { id: string }[] }> =
      result.data as Record<string, { returning: { id: string }[] }>;
    return returnedData[insertName].returning.map((data) => data.id);
  }

  // TODO use delete_by_pk field here? Probably more efficient
  async deleteById(tableName: string, id: string): Promise<string> {
    const deleteName = "delete_" + tableName;
    const searchString = `(${this.generateWhereClause({ fieldName: "id", comparator: "eq", value: id })})`;
    const query = `
      mutation {
        ${deleteName}${searchString} {
          returning {
            id
          }
        }
      }
    `;
    const result: {
      data: JSONValue | null;
      error: GraphQLError[] | ErrorPayload | null;
    } = await this.nhostClient.graphql.request(query);
    if (!result.data || result.error) {
      throw new Error(this.getDbErrorMessage(result));
    }
    const returnedData: Record<string, { returning: { id: string }[] }> =
      result.data as Record<string, { returning: { id: string }[] }>;
    return returnedData[deleteName].returning[0].id;
  }

  async delete<K extends string>(
    tableName: string,
    logicalExpression: LogicalExpression,
    fieldsToReturn: K[],
  ): Promise<Array<Record<K, DbValue>>> {
    const deleteName = "delete_" + tableName;
    const searchString = `(${this.generateWhereClause(logicalExpression)})`;
    const query = `
      mutation {
        ${deleteName}${searchString} {
          returning {
            ${fieldsToReturn.join("\n          ")}
          }
        }
      }
    `;
    const result: {
      data: JSONValue | null;
      error: GraphQLError[] | ErrorPayload | null;
    } = await this.nhostClient.graphql.request(query);
    if (!result.data || result.error) {
      throw new Error(this.getDbErrorMessage(result));
    }
    const returnedData = result.data as Record<
      string,
      { returning: Array<Record<K, DbValue>> }
    >;
    return returnedData[deleteName].returning;
  }

  async update<K extends string>(
    tableName: string,
    fieldsToSearch: LogicalExpression,
    fieldsToUpdate: Record<string, DbValue>,
    fieldsToReturn: K[],
  ): Promise<Array<Record<K, DbValue>>> {
    const updateName = "update_" + tableName;
    const searchString = this.generateWhereClause(fieldsToSearch);
    const fieldsToUpdateArray = Object.keys(fieldsToUpdate).map(
      (key) => `${key}: ${NhostDb.createValueString(fieldsToUpdate[key])}`,
    );
    const setString = `_set: { ${fieldsToUpdateArray.join(",\n")} }`;
    const query = `
      mutation {
        ${updateName}( ${searchString}, ${setString} ) {
          returning {
            ${fieldsToReturn.join("\n")}
          }
        }
      }
    `;
    const result: {
      data: JSONValue | null;
      error: GraphQLError[] | ErrorPayload | null;
    } = await this.nhostClient.graphql.request(query);
    if (!result.data || result.error) {
      throw new Error(this.getDbErrorMessage(result));
    }
    const returnedData = result.data as Record<
      string,
      { returning: Array<Record<K, DbValue>> }
    >;
    return returnedData[updateName].returning;
  }

  async changeTeamName(
    scrimId: string,
    userId: string, // the user making the change, this gets authorized by the db
    teamName: string,
    newTeamName: string,
  ): Promise<{
    team_name: string;
    signup_player_id: string;
    player_one_id: string;
    player_two_id: string;
    player_three_id: string;
    scrim_id: string;
  }> {
    const updateName = "update_scrim_signups";
    const searchString = `
        where: {
          scrim_id: { _eq: "${scrimId}" },
          team_name: { _eq: "${teamName}" },
          _or: [
            { signup_player_id: { _eq: "${userId}" } },
            { player_one_id: { _eq: "${userId}" } },
            { player_two_id: { _eq: "${userId}" } },
            { player_three_id: { _eq: "${userId}" } }
          ]
        }`;
    const fieldsToReturn = [
      "team_name",
      "signup_player_id",
      "player_one_id",
      "player_two_id",
      "player_three_id",
      "scrim_id",
    ];
    const setString = `_set: { team_name: "${newTeamName}" }`;
    const query = `
      mutation {
        ${updateName}( ${searchString}, ${setString} ) {
          returning {
            ${fieldsToReturn.join("\n")}
          }
        }
      }
    `;

    const result: {
      update_scrim_signups_one: {
        returning: {
          team_name: string;
          signup_player_id: string;
          player_one_id: string;
          player_two_id: string;
          player_three_id: string;
          scrim_id: string;
        }[];
      };
    } = (await this.customQuery(query)) as unknown as {
      update_scrim_signups_one: {
        returning: {
          team_name: string;
          signup_player_id: string;
          player_one_id: string;
          player_two_id: string;
          player_three_id: string;
          scrim_id: string;
        }[];
      };
    };
    const teamData = result.update_scrim_signups_one.returning[0];
    if (!teamData) {
      throw Error("Changes not made");
    }
    return teamData;
  }

  async replaceTeammate(
    scrimId: string,
    teamName: string,
    userId: string,
    oldPlayerId: string,
    newPlayerId: string,
  ): Promise<{
    team_name: string;
    signup_player_id: string;
    player_one_id: string;
    player_two_id: string;
    player_three_id: string;
    scrim_id: string;
  }> {
    const query = `
      mutation {
  update_scrim_signups_many(
    updates: [
      {${this.getReplaceTeammateMutationBlock("one", scrimId, userId, oldPlayerId, newPlayerId)}},
      {${this.getReplaceTeammateMutationBlock("two", scrimId, userId, oldPlayerId, newPlayerId)}},
      {${this.getReplaceTeammateMutationBlock("three", scrimId, userId, oldPlayerId, newPlayerId)}}
    ]
  ) {
    returning {
      team_name
      signup_player_id
      player_one_id
      player_two_id
      player_three_id
      scrim_id
    }
  }
}
`;
    const result: {
      update_scrim_signups_many: {
        returning: {
          team_name: string;
          signup_player_id: string;
          player_one_id: string;
          player_two_id: string;
          player_three_id: string;
          scrim_id: string;
        }[];
      }[];
    } = (await this.customQuery(query)) as unknown as {
      update_scrim_signups_many: {
        returning: {
          team_name: string;
          signup_player_id: string;
          player_one_id: string;
          player_two_id: string;
          player_three_id: string;
          scrim_id: string;
        }[];
      }[];
    };
    const teamData = result.update_scrim_signups_many.find(
      (returned) => !!returned.returning[0]?.team_name,
    );
    const returnData = teamData?.returning[0];
    if (!returnData) {
      throw Error("Changes not made");
    }
    return returnData;
  }

  // TODO smartly compartmentalize these two methods to avoid duplicated code
  async replaceTeammateNoAuth(
    scrimId: string,
    teamName: string,
    oldPlayerId: string,
    newPlayerId: string,
  ): Promise<{
    team_name: string;
    signup_player_id: string;
    player_one_id: string;
    player_two_id: string;
    player_three_id: string;
    scrim_id: string;
  }> {
    const query = `
      mutation {
  update_scrim_signups_many(
    updates: [
      {${this.getReplaceTeammateMutationBlockNoAuth("one", scrimId, oldPlayerId, newPlayerId)}},
      {${this.getReplaceTeammateMutationBlockNoAuth("two", scrimId, oldPlayerId, newPlayerId)}},
      {${this.getReplaceTeammateMutationBlockNoAuth("three", scrimId, oldPlayerId, newPlayerId)}}
    ]
  ) {
    returning {
      team_name
      signup_player_id
      player_one_id
      player_two_id
      player_three_id
      scrim_id
    }
  }
}
`;
    const result: {
      update_scrim_signups_many: {
        returning: {
          team_name: string;
          signup_player_id: string;
          player_one_id: string;
          player_two_id: string;
          player_three_id: string;
          scrim_id: string;
        }[];
      }[];
    } = (await this.customQuery(query)) as unknown as {
      update_scrim_signups_many: {
        returning: {
          team_name: string;
          signup_player_id: string;
          player_one_id: string;
          player_two_id: string;
          player_three_id: string;
          scrim_id: string;
        }[];
      }[];
    };
    const teamData = result.update_scrim_signups_many.find(
      (returned) => !!returned.returning[0]?.team_name,
    );
    const returnData = teamData?.returning[0];
    if (!returnData) {
      throw Error("Changes not made");
    }
    return returnData;
  }

  private getReplaceTeammateMutationBlock(
    playerNumber: "one" | "two" | "three",
    scrimId: string,
    userId: string,
    oldPlayerId: string,
    newPlayerId: string,
  ) {
    return `
        where: {
          scrim_id: { _eq: "${scrimId}" },
          player_${playerNumber}_id: { _eq: "${oldPlayerId}" },
          _or: [
            { signup_player_id: { _eq: "${userId}" } },
            { player_one_id: { _eq: "${userId}" } },
            { player_two_id: { _eq: "${userId}" } },
            { player_three_id: { _eq: "${userId}" } }
          ]
        },
        _set: { player_${playerNumber}_id: "${newPlayerId}" }
      `;
  }

  private getReplaceTeammateMutationBlockNoAuth(
    playerNumber: "one" | "two" | "three",
    scrimId: string,
    oldPlayerId: string,
    newPlayerId: string,
  ) {
    return `
        where: {
          scrim_id: { _eq: "${scrimId}" },
          player_${playerNumber}_id: { _eq: "${oldPlayerId}" }
        },
        _set: { player_${playerNumber}_id: "${newPlayerId}" }
      `;
  }

  async expungePrio(prioIds: string[]): Promise<ExpungedPlayerPrio[]> {
    const prioIdLogicalExpression: LogicalExpression = {
      operator: "or",
      expressions: prioIds.map((id) => ({
        fieldName: "id",
        comparator: "eq",
        value: id,
      })),
    };
    const query = `
      mutation {
        delete_prio(${this.generateWhereClause(prioIdLogicalExpression)}) {
          returning {
            player {
              discord_id
              display_name
            }
            amount
            end_date
          }
        }
      }
    `;
    const deletedEntries = (await this.customQuery(query)) as unknown as {
      delete_prio: {
        returning: {
          player: { discord_id: string; display_name: string };
          amount: number;
          end_date: string;
        }[];
      };
    };
    return deletedEntries.delete_prio.returning.map((entry) => ({
      playerDiscordId: entry.player.discord_id,
      playerDisplayName: entry.player.display_name,
      amount: entry.amount,
      endDate: new Date(entry.end_date),
    }));
  }

  async expungeBans(banIds: string[]): Promise<
    {
      playerDiscordId: string;
      playerDisplayName: string;
      endDate: Date;
    }[]
  > {
    const banIdLogicalExpression: LogicalExpression = {
      operator: "or",
      expressions: banIds.map((id) => ({
        fieldName: "id",
        comparator: "eq",
        value: id,
      })),
    };
    const query = `
      mutation {
        delete_scrim_bans(${this.generateWhereClause(banIdLogicalExpression)}) {
          returning {
            player {
              discord_id
              display_name
            }
            end_date
          }
        }
      }
    `;
    const deletedEntries = (await this.customQuery(query)) as unknown as {
      delete_scrim_bans: {
        returning: {
          player: { discord_id: string; display_name: string };
          end_date: string;
        }[];
      };
    };
    return deletedEntries.delete_scrim_bans.returning.map((entry) => ({
      playerDiscordId: entry.player.discord_id,
      playerDisplayName: entry.player.display_name,
      endDate: new Date(entry.end_date),
    }));
  }

  async downloadFileById(fileId: string): Promise<Blob> {
    const { file, error } = await this.nhostClient.storage.download({ fileId });
    if (error) {
      throw error;
    }
    return file;
  }

  async downloadFileByName(fileName: string): Promise<Blob> {
    const result = await this.nhostClient.graphql.request(`
      query {
        files(where: { name: { _eq: "${fileName}" } }, limit: 1) {
          id
        }
      }
    `);
    if (result.error || !result.data) {
      throw new Error(`Failed to look up file "${fileName}"`);
    }
    const files = (result.data as { files: { id: string }[] }).files;
    if (!files.length) {
      throw new Error(`File not found: "${fileName}"`);
    }
    return this.downloadFileById(files[0].id);
  }

  async customQuery(query: string): Promise<JSONValue> {
    const result: {
      data: JSONValue | null;
      error: GraphQLError[] | ErrorPayload | null;
    } = await this.nhostClient.graphql.request(query);
    if (!result.data || result.error) {
      throw new Error(this.getDbErrorMessage(result));
    }
    return Promise.resolve(result.data);
  }

  private static createValueString(
    value: string | number | boolean | Date | JSON | null,
  ): string {
    if (typeof value === "string") {
      return `"${value}"`;
    } else if (value instanceof Date) {
      return `"${value.toISOString()}"`;
    } else if (value === null) {
      return `null`;
    } else if (isJson(value)) {
      return this.formatJsonForString(value);
    }
    return `${value}`;
  }

  private static formatJsonForString(data: JSON | string): string {
    if (typeof data !== "object" || data === null) {
      if (typeof data === "string") {
        return `"${data.replace(/\\/g, "")}"`; // Wrap strings in quotes
      }
      return data; // Return numbers, booleans, etc. as-is
    }

    if (Array.isArray(data)) {
      const formattedElements = data
        .map((element) => this.formatJsonForString(element))
        .join(",");
      return `[${formattedElements}]`;
    }

    const parts = Object.keys(data).map((key) => {
      // @ts-expect-error we know key can be used ot index data here
      const value = data[key];
      const formattedValue = this.formatJsonForString(value);
      return `${key}:${formattedValue}`;
    });

    return `{${parts.join(",")}}`;
  }

  private getDbErrorMessage(result: {
    data: JSONValue | null;
    error: GraphQLError[] | ErrorPayload | null;
  }): string {
    if (result.error) {
      if (Array.isArray(result.error)) {
        return (
          "Graph ql error: " + result.error.map((e) => e.message).join(", ")
        );
      } else {
        return "Graph ql error: " + result.error.message;
      }
    } else if (!result.data) {
      return "Graph ql error: No data returned";
    }
    return "Db Error";
  }
}

export const nhostDb = new NhostDb(
  appConfig.nhost.adminSecret,
  appConfig.nhost.region,
  appConfig.nhost.subdomain,
);
