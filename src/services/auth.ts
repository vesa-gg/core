import { DB } from "../db/db";
import { DiscordRole } from "../models/Role";

export class AuthService {
  adminRolesMap: Map<string, DiscordRole>;
  constructor(private db: DB) {
    this.adminRolesMap = new Map();
    this.getAdminRoleMap().then((map) => {
      this.adminRolesMap = map;
    });
  }

  /**
   * @param roleIds Discord role IDs held by the caller. scrim-bot derives this
   * from a live `GuildMember` (`member.roles.cache.map(r => r.id)`); any future
   * caller without a live gateway connection (e.g. a server-side action
   * triggered from VESAWeb) resolves it however it can — a Discord REST lookup
   * using a bot token, for instance — and passes the plain array in here.
   */
  async memberIsAdmin(roleIds: string[]): Promise<boolean> {
    const adminRoleSet = await this.getAdminRoleMap();
    return this.hasAdminRole(roleIds, adminRoleSet);
  }

  async addAdminRoles(roles: DiscordRole[]): Promise<string[]> {
    const dbIds = await this.db.addAdminRoles(roles);
    this.updateAdminRoleMap();
    return dbIds;
  }

  async removeAdminRoles(roleIds: string[]): Promise<string[]> {
    const dbIds = await this.db.removeAdminRoles(roleIds);
    this.updateAdminRoleMap();
    return dbIds;
  }

  private async getAdminRoleMap(): Promise<Map<string, DiscordRole>> {
    const adminRolesArray = await this.db.getAdminRoles();
    const map: Map<string, DiscordRole> = new Map();
    for (const role of adminRolesArray) {
      map.set(role.discordRoleId, role);
    }
    return map;
  }

  private async updateAdminRoleMap(): Promise<Map<string, DiscordRole>> {
    const map = await this.getAdminRoleMap();
    this.adminRolesMap = map;
    return map;
  }

  private hasAdminRole(
    memberRoleIds: string[],
    adminRoleMao: Map<string, DiscordRole>,
  ) {
    return memberRoleIds.some((item) => adminRoleMao.has(item));
  }
}
