import { AlertSink } from "../types/notifications";
import {
  LeagueDataRepository,
  RosterChangeData,
  SignupData,
  SignupResult,
  SubRequestData,
  WriteResult,
} from "./league-data.repository";

/**
 * Mirrors every write to both a primary repository and a shadow repository concurrently.
 *
 * - Primary failure  → the error is rethrown; the command fails as normal.
 * - Shadow failure   → the error is swallowed and reported via AlertSink; the command succeeds.
 *
 * Reads (getRosterDiscordIds) are served from the primary only.
 */
export class MirrorLeagueRepository implements LeagueDataRepository {
  constructor(
    private primary: LeagueDataRepository,
    private shadow: LeagueDataRepository,
    private alertService: AlertSink,
  ) {}

  async writeSignup(data: SignupData): Promise<SignupResult | null> {
    return this.runMirrored(
      "writeSignup",
      () => this.primary.writeSignup(data),
      () => this.shadow.writeSignup(data),
    );
  }

  async writeSubRequest(data: SubRequestData): Promise<WriteResult> {
    return this.runMirrored(
      "writeSubRequest",
      () => this.primary.writeSubRequest(data),
      () => this.shadow.writeSubRequest(data),
    );
  }

  async writeRosterChange(data: RosterChangeData): Promise<WriteResult> {
    return this.runMirrored(
      "writeRosterChange",
      () => this.primary.writeRosterChange(data),
      () => this.shadow.writeRosterChange(data),
    );
  }

  async getRosterDiscordIds(): Promise<Map<string, string>> {
    return this.primary.getRosterDiscordIds();
  }

  private async runMirrored<T>(
    opName: string,
    primary: () => Promise<T>,
    shadow: () => Promise<T>,
  ): Promise<T> {
    const [primaryResult, shadowResult] = await Promise.allSettled([
      primary(),
      shadow(),
    ]);

    if (shadowResult.status === "rejected") {
      const reason =
        shadowResult.reason instanceof Error
          ? (shadowResult.reason.stack ?? shadowResult.reason.message)
          : String(shadowResult.reason);
      try {
        await this.alertService.error(
          `MirrorLeagueRepository: shadow ${opName} failed: ${reason}`,
        );
      } catch {
        // Alert failure must not mask the primary result
      }
    }

    if (primaryResult.status === "rejected") {
      throw primaryResult.reason;
    }

    return primaryResult.value;
  }
}
