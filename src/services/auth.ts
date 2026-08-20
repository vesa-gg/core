import { DB } from "../db/db";
import { GuildMember } from "discord.js";
import { DiscordRole } from "../models/Role";

export class AuthService {
  adminRolesMap: Map<string, DiscordRole>;
  constructor(private db: DB) {
    this.adminRolesMap = new Map();
    this.getAdminRoleMap().then((map) => {
      this.adminRolesMap = map;
    });
  }

  async memberIsAdmin(member: GuildMember): Promise<boolean> {
    const memberRoleIds = member.roles.cache.map((role) => role.id);
    const adminRoleSet = await this.getAdminRoleMap();
    return this.hasAdminRole(memberRoleIds, adminRoleSet);
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
