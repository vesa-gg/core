import { AuthService } from "../../src/services/auth";
import { DbMock } from "../mocks/db.mock";
import SpyInstance = jest.SpyInstance;

describe("Auth", () => {
  let service: AuthService;
  let dbMock: DbMock;
  let dbAdminRolesSpy: SpyInstance<
    Promise<{ discordRoleId: string; roleName: string }[]>,
    []
  >;

  beforeEach(() => {
    dbMock = new DbMock();
    service = new AuthService(dbMock);
    dbAdminRolesSpy = jest.spyOn(dbMock, "getAdminRoles");
    dbAdminRolesSpy.mockReturnValue(Promise.resolve([]));
  });

  describe("memberIsAdmin", () => {
    let roleIds: string[];

    beforeEach(() => {
      roleIds = ["non admin role"];
    });

    it("Should return false when there are no admin roles", async () => {
      const isAdmin = await service.memberIsAdmin(roleIds);
      expect(isAdmin).toEqual(false);
    });

    it("Should return false when member has no role", async () => {
      roleIds = [];
      const isAdmin = await service.memberIsAdmin(roleIds);
      expect(isAdmin).toEqual(false);
    });

    it("Should return false when member does not have admin role", async () => {
      dbAdminRolesSpy.mockReturnValueOnce(
        Promise.resolve([
          { discordRoleId: "admin role", roleName: "VESA Admin" },
        ]),
      );
      const isAdmin = await service.memberIsAdmin(roleIds);
      expect(isAdmin).toEqual(false);
    });

    it("Should return true when member has admin role", async () => {
      dbAdminRolesSpy.mockReturnValueOnce(
        Promise.resolve([
          { discordRoleId: "admin role", roleName: "VESA Admin" },
        ]),
      );
      roleIds.push("admin role");
      const isAdmin = await service.memberIsAdmin(roleIds);
      expect(isAdmin).toEqual(true);
    });

    it("Should return false when no admin roles in db", async () => {
      dbAdminRolesSpy.mockReturnValueOnce(Promise.resolve([]));
      roleIds.push("admin role");
      const isAdmin = await service.memberIsAdmin(roleIds);
      expect(isAdmin).toEqual(false);
    });
  });

  it("Should add admin role", async () => {
    const dbAddSpy = jest
      .spyOn(dbMock, "addAdminRoles")
      .mockReturnValue(Promise.resolve(["db id"]));
    await service.addAdminRoles([
      { discordRoleId: "admin role", roleName: "VESA Admin" },
    ]);
    expect(dbAddSpy).toHaveBeenCalledWith([
      {
        discordRoleId: "admin role",
        roleName: "VESA Admin",
      },
    ]);
  });

  it("Should remove admin roles", async () => {
    const dbRemoveSpy = jest
      .spyOn(dbMock, "removeAdminRoles")
      .mockReturnValue(Promise.resolve(["db id"]));
    const dbIds = await service.removeAdminRoles(["admin role"]);
    expect(dbRemoveSpy).toHaveBeenCalledWith(["admin role"]);
    expect(dbIds).toEqual(["db id"]);
  });
});
