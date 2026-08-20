import { TextEncoder, TextDecoder } from "util";
Object.assign(global, { TextEncoder, TextDecoder });

import { HuggingFaceService } from "../../src/services/hugging-face";
import { commit } from "@huggingface/hub";

// Mock @huggingface/hub
jest.mock("@huggingface/hub", () => ({
  commit: jest.fn().mockResolvedValue({}),
}));

// Mock config
jest.mock("../../src/config", () => ({
  appConfig: {
    huggingFaceToken: "fake-token",
  },
}));

describe("HuggingFaceService", () => {
  it("should pass custom fetch to commit with correct timeout", async () => {
    const service = new HuggingFaceService();
    const mockStats = {
      total: 10,
      source: "test",
      games: [],
      teams: [],
      analytics: { qualityScore: 10 },
    } as any;

    const currentDate = new Date("2026-02-01T12:00:00.000Z");

    await service.uploadOverstatJson("123", currentDate, mockStats);

    const commitMock = commit as jest.Mock;
    const callArgs = commitMock.mock.calls[0][0];
    expect(callArgs).toEqual({
      credentials: {
        accessToken: "fake-token",
      },
      repo: {
        type: "dataset",
        name: "VESA-apex/apex-scrims",
      },
      title: "Upload stats for scrim 123. 2026_02_01",
      operations: [
        {
          operation: "addOrUpdate",
          path: "scrims_2026_02_01_id_123.json",
          content: new Blob([JSON.stringify(mockStats, null, 2)]),
        },
      ],
      fetch: expect.any(Function),
    });
  });
});
