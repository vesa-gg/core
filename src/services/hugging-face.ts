import { commit } from "@huggingface/hub";
import { appConfig } from "../config";
import { OverstatTournamentResponse } from "../models/overstatModels";
import { Agent, fetch as undiciFetch } from "undici";

// custom agent with longer timeout
const dispatcher = new Agent({
  connect: { timeout: 30000 },
  headersTimeout: 30000,
});

const customFetch = (url: URL | RequestInfo, init?: RequestInit) => {
  return undiciFetch(url as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1] | undefined),
    dispatcher,
  }) as unknown as Promise<Response>;
};

export class HuggingFaceService {
  private hfToken = appConfig.huggingFaceToken;

  constructor() {}

  // throws if upload fails, returns the file url on success
  async uploadOverstatJson(
    overstatId: string,
    dateTime: Date,
    stats: OverstatTournamentResponse,
  ): Promise<string> {
    const repoId = "VESA-apex/apex-scrims";

    const dateString = dateTime
      .toISOString()
      .split("T")[0]
      .replace("-", "_")
      .replace("-", "_");
    const filePath = `scrims_${dateString}_id_${overstatId}.json`;

    const contentString = JSON.stringify(stats, null, 2);

    await commit({
      credentials: {
        accessToken: this.hfToken,
      },
      repo: {
        type: "dataset",
        name: repoId,
      },
      title: `Upload stats for scrim ${overstatId}. ${dateString}`,
      operations: [
        {
          operation: "addOrUpdate",
          path: filePath,
          content: new Blob([contentString]),
        },
      ],
      fetch: customFetch,
    });

    return `https://huggingface.co/datasets/${repoId}/blob/main/${filePath}`;
  }
}
