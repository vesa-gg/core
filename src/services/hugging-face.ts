// NOTE: uses `undici` for a custom-timeout fetch dispatcher. `undici` is a
// Node-only package — this will NOT run inside a Cloudflare Worker as-is. If
// VESAWeb ever needs this service, swap to the platform's native `fetch`
// (Workers' fetch already supports comparable options) instead of undici.
import { commit } from "@huggingface/hub";
import { OverstatTournamentResponse } from "../models/overstatModels";
import { Agent, fetch as undiciFetch } from "undici";

// custom agent with longer timeout
const dispatcher = new Agent({
  connect: { timeout: 30000 },
  headersTimeout: 30000,
});

// Typed as `typeof fetch` (the global fetch signature `@huggingface/hub`
// expects) rather than undici's own exported types — undici and the
// ambient global fetch types ship their own separate `Request`/`Response`
// declarations that don't structurally match, so pinning to undici's types
// here caused a mismatch when this got passed to `commit()`.
const customFetch: typeof fetch = (url, init) => {
  return undiciFetch(url as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1] | undefined),
    dispatcher,
  }) as unknown as Promise<Response>;
};

export class HuggingFaceService {
  // was read from global app config before the move to this package — now
  // supplied explicitly by the consumer (scrim-bot passes appConfig.huggingFaceToken)
  constructor(private hfToken: string) {}

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
