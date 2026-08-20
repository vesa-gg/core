import * as fs from "node:fs";
import { MmrService } from "../../src/services/mmr";
import { DbMock } from "../mocks/db.mock";

jest.mock("node:fs", () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const mockApiData = [
  { nucleusHash: "111111", weighted_overall_contribution: 0.9 },
  { nucleusHash: "222222", weighted_overall_contribution: 0.5 },
  { nucleusHash: "333333", weighted_overall_contribution: 0.1 },
];

const mockApiResponse = {
  status: "success",
  filters: [],
  options: {},
  table: "mmr",
  data: mockApiData,
};

describe("MmrService", () => {
  let service: MmrService;
  let dbMock: DbMock;

  beforeEach(() => {
    dbMock = new DbMock();
    service = new MmrService(dbMock);
    global.fetch = jest.fn();
    (fs.readFileSync as jest.Mock).mockClear();
    (fs.writeFileSync as jest.Mock).mockClear();
    delete process.env.FETCH_MMR_FROM_APM;
  });

  describe("getMmrMap()", () => {
    describe("cache hit", () => {
      it("should return map from cache without fetching when cache is fresh", async () => {
        const freshCache = JSON.stringify({
          fetchedAt: new Date().toISOString(),
          data: mockApiData,
        });
        (fs.readFileSync as jest.Mock).mockReturnValue(freshCache);

        const result = await service.getMmrMap();

        expect(global.fetch).not.toHaveBeenCalled();
        expect(result.get("111111")).toBe(0.9);
        expect(result.get("222222")).toBe(0.5);
        expect(result.get("333333")).toBe(0.1);
      });

      it("should skip cache and fetch when forceRefresh is true", async () => {
        const freshCache = JSON.stringify({
          fetchedAt: new Date().toISOString(),
          data: mockApiData,
        });
        (fs.readFileSync as jest.Mock).mockReturnValue(freshCache);
        dbMock.downloadFileResponse = new Blob([
          JSON.stringify(mockApiResponse),
        ]);
        jest.spyOn(dbMock, "downloadFileByName");

        await service.getMmrMap(true);

        expect(dbMock.downloadFileByName).toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });

    describe("cache miss", () => {
      it("should fetch from nhost and write cache when cache file is missing", async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
          throw new Error("ENOENT");
        });
        dbMock.downloadFileResponse = new Blob([
          JSON.stringify(mockApiResponse),
        ]);
        jest.spyOn(dbMock, "downloadFileByName");

        const result = await service.getMmrMap();

        expect(dbMock.downloadFileByName).toHaveBeenCalledWith("apm-mmr.json");
        expect(global.fetch).not.toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          "mmr-cache.json",
          expect.stringContaining('"111111"'),
        );
        expect(result.get("111111")).toBe(0.9);
      });

      it("should fetch from nhost and write cache when cache is stale", async () => {
        const staleCache = JSON.stringify({
          fetchedAt: new Date(Date.now() - CACHE_TTL_MS - 1000).toISOString(),
          data: mockApiData,
        });
        (fs.readFileSync as jest.Mock).mockReturnValue(staleCache);
        dbMock.downloadFileResponse = new Blob([
          JSON.stringify(mockApiResponse),
        ]);

        await service.getMmrMap();

        expect(global.fetch).not.toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();
      });
    });

    describe("errors", () => {
      it("should throw when nhost returns data that is not an array", async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
          throw new Error("ENOENT");
        });
        dbMock.downloadFileResponse = new Blob([
          JSON.stringify({ status: "error", data: null }),
        ]);

        await expect(service.getMmrMap()).rejects.toThrow(
          "MMR API returned unexpected shape: status=error",
        );
      });

      it("should not write cache when nhost returns bad shape", async () => {
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
          throw new Error("ENOENT");
        });
        dbMock.downloadFileResponse = new Blob([
          JSON.stringify({ status: "error", data: null }),
        ]);

        await expect(service.getMmrMap()).rejects.toThrow();
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      });
    });

    describe("apexapm path (FETCH_MMR_FROM_APM set)", () => {
      beforeEach(() => {
        process.env.FETCH_MMR_FROM_APM = "true";
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
          throw new Error("ENOENT");
        });
      });

      it("should call fetch with the apexapm URL", async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: async () => mockApiResponse,
        });

        const result = await service.getMmrMap();

        expect(global.fetch).toHaveBeenCalledWith(
          "https://vesa.apexapm.com/API/stats/all.php",
        );
        expect(result.get("111111")).toBe(0.9);
      });

      it("should throw when API returns a non-ok status", async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 503,
        });

        await expect(service.getMmrMap()).rejects.toThrow(
          "MMR API responded with status 503",
        );
      });
    });
  });
});
