import {
  LeagueDataRepository,
  RosterChangeData,
  SignupData,
  SignupResult,
  SubRequestData,
  WriteResult,
} from "../../src/repositories/league-data.repository";

export class LeagueDataRepositoryMock implements LeagueDataRepository {
  getRosterDiscordIdsResponse: Map<string, string> = new Map();
  writeSignupResponse: SignupResult | null = {
    rowNumber: 1,
    seasonInfo: { signupPrioEndDate: "2025-01-01", startDate: "2025-01-15" },
  };
  writeSubRequestResponse: WriteResult = {
    rowNumber: 1,
    url: "https://docs.google.com/spreadsheets/d/abc",
    tabName: "DIV 1 Log",
  };
  writeRosterChangeResponse: WriteResult = {
    rowNumber: 2,
    url: "https://docs.google.com/spreadsheets/d/abc",
    tabName: "Roster Changes",
  };

  async getRosterDiscordIds(): Promise<Map<string, string>> {
    return this.getRosterDiscordIdsResponse;
  }

  async writeSignup(_data: SignupData): Promise<SignupResult | null> {
    return this.writeSignupResponse;
  }

  async writeSubRequest(_data: SubRequestData): Promise<WriteResult> {
    return this.writeSubRequestResponse;
  }

  async writeRosterChange(_data: RosterChangeData): Promise<WriteResult> {
    return this.writeRosterChangeResponse;
  }
}
