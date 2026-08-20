import { DB } from "../db/db";
import { DbTable, DbValue } from "../db/types";
import { ScrimType } from "../models/Scrims";

const instructionTextKeys: Record<ScrimType, string> = {
  [ScrimType.regular]: "signups_instruction_text",
  [ScrimType.tournament]: "tournament_signups_instruction_text",
  [ScrimType.league]: "league_signups_instruction_text",
};

export class StaticValueService {
  private instructionTextCache: Partial<Record<ScrimType, string>> = {};
  private scrimPassRoleId: string | undefined;
  private subApprovalRoleId: string | undefined;
  private cachedRequireOverstat: boolean | undefined;

  constructor(private db: DB) {}

  async getInstructionText(scrimType: ScrimType): Promise<string | undefined> {
    if (this.instructionTextCache[scrimType]) {
      return this.instructionTextCache[scrimType];
    }
    const text = await this.fetchStaticValue(instructionTextKeys[scrimType]);
    if (text) {
      this.instructionTextCache[scrimType] = text;
    }
    return text;
  }

  async getScrimPassRoleId(): Promise<string | undefined> {
    if (this.scrimPassRoleId) {
      return this.scrimPassRoleId;
    }
    this.scrimPassRoleId = await this.fetchStaticValue("scrim_pass_role_id");
    return this.scrimPassRoleId;
  }

  async getSubApprovalRoleId(): Promise<string | undefined> {
    if (this.subApprovalRoleId) {
      return this.subApprovalRoleId;
    }
    this.subApprovalRoleId = await this.fetchStaticValue(
      "sub_approval_role_id",
    );
    return this.subApprovalRoleId;
  }

  async getScrimScoresChannelId(): Promise<string | undefined> {
    return this.fetchStaticValue("scrim_scores_channel_id");
  }

  async getAlertChannelId(): Promise<string | undefined> {
    return this.fetchStaticValue("alert_channel_id");
  }

  async getAlertPingUserId(): Promise<string | undefined> {
    return this.fetchStaticValue("alert_ping_user_id");
  }

  async requireOverstatForSignup(): Promise<boolean> {
    if (this.cachedRequireOverstat !== undefined) {
      return this.cachedRequireOverstat;
    }
    const value = await this.fetchStaticValue("require_overstat_for_signup");
    this.cachedRequireOverstat =
      value === undefined ? true : value.toLowerCase() === "true";
    return this.cachedRequireOverstat;
  }

  private async fetchStaticValue(key: string): Promise<string | undefined> {
    const dbResult: { value: DbValue }[] = await this.db.get(
      DbTable.staticKeyValues,
      {
        fieldName: "name",
        value: key,
        comparator: "eq",
      },
      ["value"],
    );
    return dbResult[0]?.value as string;
  }

  async getScrimInfoTimes(scrimDate: Date): Promise<{
    lobbyPostDate: Date;
    lowPrioDate: Date;
    draftDate: Date;
    rosterLockDate: Date;
  }> {
    const lobbyMinutesBefore = await this.fetchLobbyMinutesBefore();

    const lobbyPostDate = this.getOffsetDate(
      scrimDate,
      lobbyMinutesBefore.lobbyPost,
      120,
    );

    const lowPrioDate = this.getOffsetDate(
      scrimDate,
      lobbyMinutesBefore.lowPrio,
      90,
    );

    const draftDate = this.getOffsetDate(
      scrimDate,
      lobbyMinutesBefore.draft,
      30,
    );

    const rosterLockDate = this.getOffsetDate(
      scrimDate,
      lobbyMinutesBefore.rosterLock,
      120,
    );

    return {
      lobbyPostDate,
      lowPrioDate,
      draftDate,
      rosterLockDate,
    };
  }

  private getOffsetDate(
    scrimDate: Date,
    lobbyMinutesBefore: number | undefined,
    defaultMinutesBefore: number,
  ) {
    const minutesBefore = lobbyMinutesBefore ?? defaultMinutesBefore;
    const newDate = new Date(scrimDate.valueOf());
    newDate.setTime(newDate.valueOf() - minutesBefore * 60 * 1000);
    return newDate;
  }

  private async fetchLobbyMinutesBefore(): Promise<LobbyMinutesBeforeReturnType> {
    const dbResult: { name: DbValue; minutes_before: DbValue }[] =
      await this.db.get(DbTable.lobbyEventTimes, undefined, [
        "name",
        "minutes_before",
      ]);
    const lobbyTimes: LobbyMinutesBeforeReturnType = {
      draft: undefined,
      lowPrio: undefined,
      lobbyPost: undefined,
      rosterLock: undefined,
    };
    for (const event of dbResult) {
      switch (event.name) {
        case "draft_time":
          lobbyTimes.draft = event.minutes_before as number;
          break;
        case "low_prio_time":
          lobbyTimes.lowPrio = event.minutes_before as number;
          break;
        case "roster_lock_time":
          lobbyTimes.rosterLock = event.minutes_before as number;
          break;
        case "lobby_post_time":
          lobbyTimes.lobbyPost = event.minutes_before as number;
          break;
      }
    }
    return lobbyTimes;
  }
}

type LobbyMinutesBeforeReturnType = {
  draft: number | undefined;
  lowPrio: number | undefined;
  lobbyPost: number | undefined;
  rosterLock: number | undefined;
};
