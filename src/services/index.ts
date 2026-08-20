import { nhostDb } from "../db/nhost.db";
import { RosterService } from "./rosters";
import { SignupService } from "./signups";
import { ScrimService } from "./scrim-service";
import { OverstatService } from "./overstat";
import { PrioService } from "./prio";
import { AuthService } from "./auth";
import { StaticValueService } from "./static-values";
import { DiscordService } from "./discord";
import { client } from "../Client";
import { BanService } from "./ban";
import { HuggingFaceService } from "./hugging-face";
import { LeagueService } from "./league";
import { LeagueSheetRepository } from "../repositories/league-sheet.repository";
import { LeagueDbRepository } from "../repositories/league-db.repository";
import { MirrorLeagueRepository } from "../repositories/mirror-league.repository";
import { MmrService } from "./mmr";
import { AlertService } from "./alert";

// This file creates all the singleton services
export const huggingFaceService = new HuggingFaceService();
export const overstatService = new OverstatService(nhostDb);
export const staticValueService = new StaticValueService(nhostDb);

export const discordService = new DiscordService(client, staticValueService);
export const alertService = new AlertService(client, staticValueService);

export const authService = new AuthService(nhostDb);
export const banService = new BanService(nhostDb);
export const scrimService = new ScrimService(
  nhostDb,
  overstatService,
  huggingFaceService,
  alertService,
);
const leagueSheetRepository = new LeagueSheetRepository(nhostDb);
const leagueDbRepository = new LeagueDbRepository(nhostDb, overstatService);
const mirrorLeagueRepository = new MirrorLeagueRepository(
  leagueSheetRepository,
  leagueDbRepository,
  alertService,
);
export const leagueService = new LeagueService(mirrorLeagueRepository);
export const prioService = new PrioService(
  nhostDb,
  leagueService,
  alertService,
);
export const signupsService = new SignupService(
  nhostDb,
  prioService,
  authService,
  discordService,
  banService,
  scrimService,
  alertService,
  staticValueService,
);
export const rosterService = new RosterService(
  nhostDb,
  authService,
  discordService,
  banService,
  staticValueService,
  scrimService,
  signupsService,
  alertService,
);
export const mmrService = new MmrService(nhostDb);
