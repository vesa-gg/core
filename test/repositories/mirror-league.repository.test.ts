import { MirrorLeagueRepository } from "../../src/repositories/mirror-league.repository";
import { LeagueDataRepositoryMock } from "../mocks/league-data.repository.mock";
import {
  RosterChangeData,
  SignupData,
  SubRequestData,
} from "../../src/repositories/league-data.repository";
import {
  LeaguePlayer,
  Platform,
  PlayerRank,
  SheetsPlayer,
  VesaDivision,
} from "../../src/models/league-models";
import { DiscordUserRef } from "../../src/types/discord-ref";

// Minimal AlertSink stub — only the methods MirrorLeagueRepository calls
const makeAlertService = () => ({
  error: jest.fn().mockResolvedValue(undefined),
  warn: jest.fn().mockResolvedValue(undefined),
});

const makeSignupData = (): SignupData => {
  const player: SheetsPlayer = {
    name: "Player",
    discordId: "discord-1",
    overstatLink: undefined,
    previous_season_vesa_division: VesaDivision.None,
    rank: PlayerRank.Gold,
    platform: Platform.pc,
    elo: undefined,
  };
  return {
    teamName: "Team Alpha",
    teamNoDays: "None",
    teamCompKnowledge: "High",
    player1: player,
    player2: { ...player, discordId: "discord-2" },
    player3: { ...player, discordId: "discord-3" },
    additionalComments: "",
  };
};

const makeSubRequestData = (): SubRequestData => {
  const player: LeaguePlayer = {
    name: "Player",
    discordId: "discord-1",
    overstatLink: undefined,
  };
  const commandUser: DiscordUserRef = { id: "staff-id", displayName: "Staff" };
  return {
    teamDivision: "Division 1",
    teamName: "Team Alpha",
    weekNumber: "1",
    playerOut: player,
    playerIn: { ...player, discordId: "discord-2" },
    playerInDivision: "Division 2",
    commandUser,
    additionalComments: "",
  };
};

const makeRosterChangeData = (): RosterChangeData => {
  const player: LeaguePlayer = {
    name: "Player",
    discordId: "discord-1",
    overstatLink: undefined,
  };
  const commandUser: DiscordUserRef = { id: "staff-id", displayName: "Staff" };
  return {
    teamDivision: "Division 1",
    teamName: "Team Alpha",
    playerOut: player,
    playerIn: { ...player, discordId: "discord-2" },
    commandUser,
    additionalComments: "",
  };
};

describe("MirrorLeagueRepository", () => {
  let primary: LeagueDataRepositoryMock;
  let shadow: LeagueDataRepositoryMock;
  let alertService: ReturnType<typeof makeAlertService>;
  let mirror: MirrorLeagueRepository;

  beforeEach(() => {
    primary = new LeagueDataRepositoryMock();
    shadow = new LeagueDataRepositoryMock();
    alertService = makeAlertService();
    mirror = new MirrorLeagueRepository(primary, shadow, alertService as any);
  });

  // ---------------------------------------------------------------------------
  // writeSignup
  // ---------------------------------------------------------------------------
  describe("writeSignup", () => {
    it("returns primary result when both succeed", async () => {
      const result = await mirror.writeSignup(makeSignupData());
      expect(result).toEqual(primary.writeSignupResponse);
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it("returns primary result and alerts when shadow fails", async () => {
      const shadowError = new Error("Nhost down");
      jest.spyOn(shadow, "writeSignup").mockRejectedValue(shadowError);

      const result = await mirror.writeSignup(makeSignupData());

      expect(result).toEqual(primary.writeSignupResponse);
      expect(alertService.error).toHaveBeenCalledWith(
        expect.stringContaining("shadow writeSignup failed"),
      );
    });

    it("throws primary error when primary fails and shadow succeeds", async () => {
      const primaryError = new Error("Sheets quota exceeded");
      jest.spyOn(primary, "writeSignup").mockRejectedValue(primaryError);

      await expect(mirror.writeSignup(makeSignupData())).rejects.toThrow(
        primaryError,
      );
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it("throws primary error and alerts when both fail", async () => {
      const primaryError = new Error("Sheets down");
      const shadowError = new Error("Nhost down");
      jest.spyOn(primary, "writeSignup").mockRejectedValue(primaryError);
      jest.spyOn(shadow, "writeSignup").mockRejectedValue(shadowError);

      await expect(mirror.writeSignup(makeSignupData())).rejects.toThrow(
        primaryError,
      );
      expect(alertService.error).toHaveBeenCalledWith(
        expect.stringContaining("shadow writeSignup failed"),
      );
    });

    it("returns primary result even when shadow fails and alertService.error throws", async () => {
      jest
        .spyOn(shadow, "writeSignup")
        .mockRejectedValue(new Error("Nhost down"));
      alertService.error.mockRejectedValue(new Error("Discord API error"));

      const result = await mirror.writeSignup(makeSignupData());

      expect(result).toEqual(primary.writeSignupResponse);
    });
  });

  // ---------------------------------------------------------------------------
  // writeSubRequest
  // ---------------------------------------------------------------------------
  describe("writeSubRequest", () => {
    it("returns primary result when both succeed", async () => {
      const result = await mirror.writeSubRequest(makeSubRequestData());
      expect(result).toEqual(primary.writeSubRequestResponse);
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it("returns primary result and alerts when shadow fails", async () => {
      jest
        .spyOn(shadow, "writeSubRequest")
        .mockRejectedValue(new Error("Nhost down"));

      const result = await mirror.writeSubRequest(makeSubRequestData());

      expect(result).toEqual(primary.writeSubRequestResponse);
      expect(alertService.error).toHaveBeenCalledWith(
        expect.stringContaining("shadow writeSubRequest failed"),
      );
    });

    it("throws primary error when primary fails and shadow succeeds", async () => {
      const primaryError = new Error("Sheets down");
      jest.spyOn(primary, "writeSubRequest").mockRejectedValue(primaryError);

      await expect(
        mirror.writeSubRequest(makeSubRequestData()),
      ).rejects.toThrow(primaryError);
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it("throws primary error and alerts when both fail", async () => {
      const primaryError = new Error("Sheets down");
      jest.spyOn(primary, "writeSubRequest").mockRejectedValue(primaryError);
      jest
        .spyOn(shadow, "writeSubRequest")
        .mockRejectedValue(new Error("Nhost down"));

      await expect(
        mirror.writeSubRequest(makeSubRequestData()),
      ).rejects.toThrow(primaryError);
      expect(alertService.error).toHaveBeenCalledWith(
        expect.stringContaining("shadow writeSubRequest failed"),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // writeRosterChange
  // ---------------------------------------------------------------------------
  describe("writeRosterChange", () => {
    it("returns primary result when both succeed", async () => {
      const result = await mirror.writeRosterChange(makeRosterChangeData());
      expect(result).toEqual(primary.writeRosterChangeResponse);
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it("returns primary result and alerts when shadow fails", async () => {
      jest
        .spyOn(shadow, "writeRosterChange")
        .mockRejectedValue(new Error("Nhost down"));

      const result = await mirror.writeRosterChange(makeRosterChangeData());

      expect(result).toEqual(primary.writeRosterChangeResponse);
      expect(alertService.error).toHaveBeenCalledWith(
        expect.stringContaining("shadow writeRosterChange failed"),
      );
    });

    it("throws primary error when primary fails and shadow succeeds", async () => {
      const primaryError = new Error("Sheets down");
      jest.spyOn(primary, "writeRosterChange").mockRejectedValue(primaryError);

      await expect(
        mirror.writeRosterChange(makeRosterChangeData()),
      ).rejects.toThrow(primaryError);
      expect(alertService.error).not.toHaveBeenCalled();
    });

    it("throws primary error and alerts when both fail", async () => {
      const primaryError = new Error("Sheets down");
      jest.spyOn(primary, "writeRosterChange").mockRejectedValue(primaryError);
      jest
        .spyOn(shadow, "writeRosterChange")
        .mockRejectedValue(new Error("Nhost down"));

      await expect(
        mirror.writeRosterChange(makeRosterChangeData()),
      ).rejects.toThrow(primaryError);
      expect(alertService.error).toHaveBeenCalledWith(
        expect.stringContaining("shadow writeRosterChange failed"),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getRosterDiscordIds
  // ---------------------------------------------------------------------------
  describe("getRosterDiscordIds", () => {
    it("delegates to primary only", async () => {
      const rosterMap = new Map([["discord-1", "Team Alpha"]]);
      primary.getRosterDiscordIdsResponse = rosterMap;
      const shadowSpy = jest.spyOn(shadow, "getRosterDiscordIds");

      const result = await mirror.getRosterDiscordIds();

      expect(result).toBe(rosterMap);
      expect(shadowSpy).not.toHaveBeenCalled();
    });
  });
});
