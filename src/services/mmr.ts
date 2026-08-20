import * as fs from "node:fs";
import { DB } from "../db/db";

const CACHE_FILE = "mmr-cache.json";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const API_URL = "https://vesa.apexapm.com/API/stats/all.php";
const MMR_FILE_NAME = "apm-mmr.json";

interface MmrEntry {
  nucleusHash: string;
  weighted_overall_contribution: number;
}

interface MmrApiResponse {
  status: string;
  data: MmrEntry[];
}

interface MmrCache {
  fetchedAt: string;
  data: MmrEntry[];
}

export class MmrService {
  constructor(private db: DB) {}

  async getMmrMap(forceRefresh = false): Promise<Map<string, number>> {
    if (!forceRefresh) {
      const cached = this.readCache();
      if (cached) {
        return this.buildMap(cached.data);
      }
    }
    return this.fetchAndCache();
  }

  private readCache(): MmrCache | null {
    try {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const cache: MmrCache = JSON.parse(raw);
      const age = Date.now() - new Date(cache.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return cache;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchAndCache(): Promise<Map<string, number>> {
    const json = process.env.FETCH_MMR_FROM_APM
      ? await this.fetchFromApexapm()
      : await this.fetchFromNhost();

    if (!Array.isArray(json.data)) {
      throw new Error(
        `MMR API returned unexpected shape: status=${json.status}`,
      );
    }
    const cache: MmrCache = {
      fetchedAt: new Date().toISOString(),
      data: json.data,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    return this.buildMap(json.data);
  }

  private async fetchFromApexapm(): Promise<MmrApiResponse> {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`MMR API responded with status ${response.status}`);
    }
    return response.json();
  }

  private async fetchFromNhost(): Promise<MmrApiResponse> {
    const blob = await this.db.downloadFileByName(MMR_FILE_NAME);
    return JSON.parse(await blob.text());
  }

  private buildMap(data: MmrEntry[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const entry of data) {
      // nucleusHash from apm is currently the overstatId of a Player, this may change in future so keep an eye on it
      map.set(entry.nucleusHash, entry.weighted_overall_contribution);
    }
    return map;
  }
}
