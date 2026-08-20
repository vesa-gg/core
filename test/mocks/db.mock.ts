import { DB } from "../../src/db/db";
import {
  DbValue,
  ExtractReturnType,
  FieldSelection,
  JSONValue,
  LogicalExpression,
} from "../../src/db/types";
import { Player, PlayerInsert } from "../../src/models/Player";
import {
  LeagueRosterChangeInsert,
  LeagueSubRequestInsert,
  LeagueTeamPlayerInsert,
  ScrimSignupsWithPlayers,
} from "../../src/db/table.interfaces";
import { ScrimType } from "../../src/models/Scrims";

export class DbMock extends DB {
  customQueryResponse: JSONValue;
  deleteResponse: string;
  getResponse: JSONValue;
  postResponse: string[];
  addScrimSignupResponse: string;
  insertPlayersResponse: Player[];
  insertPlayerIfNotExistsResponse: Player;
  downloadFileResponse: Blob;

  constructor() {
    super();

    this.customQueryResponse = {};
    this.deleteResponse = "";
    this.getResponse = {};
    this.postResponse = [""];
    this.addScrimSignupResponse = "";
    this.insertPlayersResponse = [];
    this.insertPlayerIfNotExistsResponse = {
      id: "valid id",
    } as Player;
    this.downloadFileResponse = new Blob(["{}"]);
  }

  downloadFileById(_fileId: string): Promise<Blob> {
    return Promise.resolve(this.downloadFileResponse);
  }

  downloadFileByName(_fileName: string): Promise<Blob> {
    return Promise.resolve(this.downloadFileResponse);
  }

  customQuery(query: string): Promise<JSONValue> {
    return Promise.resolve(this.customQueryResponse);
  }

  deleteById(tableName: string, id: string): Promise<string> {
    return Promise.resolve(this.deleteResponse);
  }

  get<K extends FieldSelection[]>(
    tableName: string,
    fieldsToSearch: LogicalExpression,
    fieldsToReturn: K,
  ): Promise<Array<ExtractReturnType<K>>> {
    return Promise.resolve([{ id: "" }] as unknown as Array<
      ExtractReturnType<K>
    >);
  }

  post(tableName: string, data: Record<string, DbValue>[]): Promise<string[]> {
    return Promise.resolve(this.postResponse);
  }

  override addScrimSignup(
    teamName: string,
    scrimId: string,
    userId: string,
    playerId: string,
    playerTwoId: string,
    playerThreeId: string,
    date: Date,
    combinedElo: number | null = null,
  ): Promise<string> {
    return Promise.resolve(this.addScrimSignupResponse);
  }

  async insertPlayerIfNotExists(
    discordId: string,
    displayName: string,
    overstatLink?: string,
  ): Promise<Player> {
    return Promise.resolve(this.insertPlayerIfNotExistsResponse);
  }

  async insertPlayers(players: PlayerInsert[]): Promise<Player[]> {
    return Promise.resolve(this.insertPlayersResponse);
  }

  override getActiveScrims(): Promise<
    {
      discordChannel: string;
      id: string;
      dateTimeField: string;
      scrimType: ScrimType;
    }[]
  > {
    return Promise.resolve([]);
  }

  override async getScrimSignupsWithPlayers(
    scrimId: string,
  ): Promise<ScrimSignupsWithPlayers[]> {
    return Promise.resolve([]);
  }

  delete<K extends string>(
    tableName: string,
    logicalExpression: LogicalExpression,
    fieldsToReturn: K[],
  ): Promise<Array<Record<K, DbValue>>> {
    return Promise.resolve([{ id: "" }] as unknown as Array<
      Record<K, DbValue>
    >);
  }

  replaceTeammate(
    scrimId: string,
    teamName: string,
    oldPlayerId: string,
    newPlayerId: string,
  ): Promise<JSONValue> {
    return Promise.resolve({});
  }

  update<K extends string>(
    tableName: string,
    fieldsToEquate: LogicalExpression,
    fieldsToUpdate: Record<string, DbValue>,
    fieldsToReturn: K[],
  ): Promise<Array<Record<K, DbValue>>> {
    return Promise.resolve([]);
  }

  changeTeamName(
    scrimId: string,
    userId: string,
    teamName: string,
    newTeamName: string,
  ): Promise<JSONValue> {
    return Promise.resolve({});
  }

  replaceTeammateNoAuth(
    scrimId: string,
    teamName: string,
    oldPlayerId: string,
    newPlayerId: string,
  ): Promise<JSONValue> {
    return Promise.resolve({});
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
    console.log("DB Mock updateScrim", scrimId, updatedData);
    return Promise.resolve();
  }

  async setPrio(
    playerIds: string[],
    startDate: Date,
    endDate: Date,
    amount: number,
    reason: string,
  ) {
    return Promise.resolve(["0"]);
  }

  async getPrio(
    date: Date,
  ): Promise<
    { id: string; discordId: string; amount: number; reason: string }[]
  > {
    return Promise.resolve([
      {
        id: "0",
        amount: 0,
        reason: "lol",
        discordId: "id",
      },
    ]);
  }

  async insertLeagueSignup(
    _seasonId: string,
    _team: {
      teamName: string;
      daysUnableToPlay: string;
      compKnowledge: string;
      additionalComments: string | null;
    },
    _players: LeagueTeamPlayerInsert[],
  ): Promise<{ teamId: string; signupNumber: number }> {
    return Promise.resolve({ teamId: "team-id", signupNumber: 1 });
  }

  async getLeagueTeamIdByName(
    _seasonId: string,
    _teamName: string,
  ): Promise<string | null> {
    return Promise.resolve(null);
  }

  async insertLeagueSubRequest(_data: LeagueSubRequestInsert): Promise<string> {
    return Promise.resolve("sub-request-id");
  }

  async insertLeagueRosterChange(
    _data: LeagueRosterChangeInsert,
  ): Promise<string> {
    return Promise.resolve("roster-change-id");
  }

  async getLeagueRosterMap(_seasonId: string): Promise<Map<string, string>> {
    return Promise.resolve(new Map());
  }

  async expungePrio() {
    return Promise.resolve([]);
  }

  expungeBans(): Promise<
    { playerDiscordId: string; playerDisplayName: string; endDate: Date }[]
  > {
    return Promise.resolve([]);
  }
}
