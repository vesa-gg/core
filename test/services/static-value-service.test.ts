import { StaticValueService } from "../../src/services/static-values";
import { DbMock } from "../mocks/db.mock";
import { DB } from "../../src/db/db";

describe("Static value service", () => {
  let service: StaticValueService;
  let dbMock: DB;

  beforeEach(() => {
    dbMock = new DbMock();
    service = new StaticValueService(dbMock);
  });

  it("should use default minutes when fetched values are missing", async () => {
    const scrimDate = new Date("2025-08-25T20:00:00.000Z");

    jest.spyOn(dbMock, "get").mockReturnValue(
      Promise.resolve([
        {
          name: "something_random",
          minutes_before: 670,
        },
      ]),
    );

    const { lobbyPostDate, lowPrioDate, draftDate, rosterLockDate } =
      await service.getScrimInfoTimes(scrimDate);

    expect(lobbyPostDate.valueOf()).toEqual(
      new Date("2025-08-25T18:00:00.000Z").valueOf(),
    );
    expect(lowPrioDate.valueOf()).toEqual(
      new Date("2025-08-25T18:30:00.000Z").valueOf(),
    );
    expect(draftDate.valueOf()).toEqual(
      new Date("2025-08-25T19:30:00.000Z").valueOf(),
    );
    expect(rosterLockDate.valueOf()).toEqual(
      new Date("2025-08-25T18:00:00.000Z").valueOf(),
    );
  });

  it("should correctly calculate times for normal scrim date with db times", async () => {
    const scrimDate = new Date("2025-08-25T20:00:00.000Z"); // Midday UTC

    jest.spyOn(dbMock, "get").mockReturnValue(
      Promise.resolve([
        {
          name: "draft_time",
          minutes_before: 45,
        },
        {
          name: "lobby_post_time",
          minutes_before: 60,
        },
        {
          name: "low_prio_time",
          minutes_before: 15,
        },
        {
          name: "roster_lock_time",
          minutes_before: 300,
        },
      ]),
    );

    const { lobbyPostDate, lowPrioDate, draftDate, rosterLockDate } =
      await service.getScrimInfoTimes(scrimDate);

    expect(draftDate.valueOf()).toEqual(
      new Date("2025-08-25T19:15:00.000Z").valueOf(),
    );
    expect(lobbyPostDate.valueOf()).toEqual(
      new Date("2025-08-25T19:00:00.000Z").valueOf(),
    );
    expect(lowPrioDate.valueOf()).toEqual(
      new Date("2025-08-25T19:45:00.000Z").valueOf(),
    );
    expect(rosterLockDate.valueOf()).toEqual(
      new Date("2025-08-25T15:00:00.000Z").valueOf(),
    );
  });

  describe("requireOverstatForSignup()", () => {
    it("should default to true when key is absent", async () => {
      jest.spyOn(dbMock, "get").mockResolvedValue([]);
      await expect(service.requireOverstatForSignup()).resolves.toBe(true);
    });

    it("should return true when DB value is 'true'", async () => {
      jest.spyOn(dbMock, "get").mockResolvedValue([{ value: "true" }]);
      await expect(service.requireOverstatForSignup()).resolves.toBe(true);
    });

    it("should return true when DB value is 'TRUE' (case-insensitive)", async () => {
      jest.spyOn(dbMock, "get").mockResolvedValue([{ value: "TRUE" }]);
      await expect(service.requireOverstatForSignup()).resolves.toBe(true);
    });

    it("should return false when DB value is 'false'", async () => {
      jest.spyOn(dbMock, "get").mockResolvedValue([{ value: "false" }]);
      await expect(service.requireOverstatForSignup()).resolves.toBe(false);
    });

    it("should cache the result and not hit the DB on subsequent calls", async () => {
      const getSpy = jest
        .spyOn(dbMock, "get")
        .mockResolvedValue([{ value: "true" }]);
      await service.requireOverstatForSignup();
      await service.requireOverstatForSignup();
      expect(getSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("should correctly bridge to the previous day for a late-night/early-morning scrim", async () => {
    // Scrim is at 1 AM UTC, so the dates will fall on the previous day.
    const scrimDate = new Date("2025-08-25T01:00:00.000Z");

    // Mock the dependency to use the default values
    jest.spyOn(dbMock, "get").mockReturnValue(Promise.resolve([]));

    const { lobbyPostDate, lowPrioDate, draftDate, rosterLockDate } =
      await service.getScrimInfoTimes(scrimDate);

    expect(lobbyPostDate.valueOf()).toEqual(
      new Date("2025-08-24T23:00:00.000Z").valueOf(),
    );
    expect(lowPrioDate.valueOf()).toEqual(
      new Date("2025-08-24T23:30:00.000Z").valueOf(),
    );
    expect(draftDate.valueOf()).toEqual(
      new Date("2025-08-25T00:30:00.000Z").valueOf(),
    );
    expect(rosterLockDate.valueOf()).toEqual(
      new Date("2025-08-24T23:00:00.000Z").valueOf(),
    );
  });
});
