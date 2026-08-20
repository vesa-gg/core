import { NhostDb } from "../src/db/nhost.db";
import { PlayerInsert } from "../src/models/Player";
import { Scrims } from "../src/db/table.interfaces";

// nhost.db.ts no longer exports a side-effecting singleton (consumers must
// instantiate with their own config) — so tests construct their own instance
// with throwaway credentials; the graphql/storage calls are mocked below.
const nhostDb = new NhostDb("test-admin-secret", "test-region", "test-subdomain");

let mockRequest: (query: string) => Promise<object> = jest.fn();
let mockDownload: (params: {
  fileId: string;
}) => Promise<{ file: Blob | null; error: Error | null }> = jest.fn();

jest.mock("@nhost/nhost-js", () => {
  return {
    NhostClient: jest.fn().mockImplementation(() => {
      return {
        graphql: {
          request: (query: string) => mockRequest(query),
        },
        storage: {
          download: (params: { fileId: string }) => mockDownload(params),
        },
      };
    }),
    ...jest.requireActual,
  };
});
describe("DB connection", () => {
  beforeEach(() => {});

  /*
  it('Should fetch scrims', async ()=> {
    const scrims = await nhostDb.get('scrims', undefined, ['id', 'overstat_link', 'date_field', 'skill'])
    console.log(scrims)
    expect(scrims).toBeDefined()
  })
  */

  describe("get()", () => {
    it("Should have no search fields", async () => {
      mockRequest = (query) => {
        const expected = `
      query {
        players {
          id
          display_name
          overstat_link
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({ data: { scrims: [] } });
      };
      await nhostDb.get("players", undefined, [
        "id",
        "display_name",
        "overstat_link",
      ]);
      expect.assertions(1);
    });

    it("Should have one search field", async () => {
      mockRequest = (query) => {
        const expected = `
      query {
        players(where: { id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } }) {
          id
          display_name
          overstat_id
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({ data: { players: [] } });
      };
      await nhostDb.get(
        "players",
        {
          fieldName: "id",
          comparator: "eq",
          value: "f272a11e-5b30-4aea-b596-af2464de59ba",
        },
        ["id", "display_name", "overstat_id"],
      );
      expect.assertions(1);
    });

    it("Should have a compound expression", async () => {
      mockRequest = (query) => {
        const expected = `
      query {
        players(where: { _and: [{ id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } }, { display_name: { _eq: "TheHeuman" } }] }) {
          id
          display_name
          overstat_link
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            players: [
              {
                id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                display_name: "TheHeuman",
                overstat_link:
                  "https://overstat.gg/player/357606.TheHeuman/overview",
              },
            ],
          },
        });
      };

      const data = await nhostDb.get(
        "players",
        {
          operator: "and",
          expressions: [
            {
              fieldName: "id",
              comparator: "eq",
              value: "f272a11e-5b30-4aea-b596-af2464de59ba",
            },
            {
              fieldName: "display_name",
              comparator: "eq",
              value: "TheHeuman",
            },
          ],
        },
        ["id", "display_name", "overstat_link"],
      );
      expect(data).toEqual([
        {
          id: "f272a11e-5b30-4aea-b596-af2464de59ba",
          display_name: "TheHeuman",
          overstat_link: "https://overstat.gg/player/357606.TheHeuman/overview",
        },
      ]);
      expect.assertions(2);
    });

    it("Should have nested compound expressions", async () => {
      mockRequest = (query) => {
        const expected = `
      query {
        players(where: { _or: [{ _and: [{ id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } }, { display_name: { _eq: "TheHeuman" } }] }, { _and: [{ id: { _eq: "106ea7fa-47c8-4f4e-a6ca-3fdd92401ebd" } }, { display_name: { _eq: "Revy" } }] }] }) {
          id
          display_name
          overstat_id
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            players: [
              {
                id: "106ea7fa-47c8-4f4e-a6ca-3fdd92401ebd",
                display_name: "Revy",
                overstat_id: null,
              },
              {
                id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                display_name: "TheHeuman",
                overstat_id: "357606",
              },
            ],
          },
        });
      };

      const data = await nhostDb.get(
        "players",
        {
          operator: "or",
          expressions: [
            {
              operator: "and",
              expressions: [
                {
                  fieldName: "id",
                  comparator: "eq",
                  value: "f272a11e-5b30-4aea-b596-af2464de59ba",
                },
                {
                  fieldName: "display_name",
                  comparator: "eq",
                  value: "TheHeuman",
                },
              ],
            },
            {
              operator: "and",
              expressions: [
                {
                  fieldName: "id",
                  comparator: "eq",
                  value: "106ea7fa-47c8-4f4e-a6ca-3fdd92401ebd",
                },
                {
                  fieldName: "display_name",
                  comparator: "eq",
                  value: "Revy",
                },
              ],
            },
          ],
        },

        ["id", "display_name", "overstat_id"],
      );
      expect(data).toEqual([
        {
          id: "106ea7fa-47c8-4f4e-a6ca-3fdd92401ebd",
          display_name: "Revy",
          overstat_id: null,
        },
        {
          id: "f272a11e-5b30-4aea-b596-af2464de59ba",
          display_name: "TheHeuman",
          overstat_id: "357606",
        },
      ]);
      expect.assertions(2);
    });

    it("Should get active scrims", async () => {
      mockRequest = (query) => {
        const expected = `
      query {
        scrims(where: { _and: [{ active: { _eq: true } }] }) {
          discord_channel
          id
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            scrims: [
              {
                id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
                discord_channel: "something",
              },
            ],
          },
        });
      };

      const scrims = (await nhostDb.get(
        "scrims",

        {
          operator: "and",
          expressions: [{ fieldName: "active", comparator: "eq", value: true }],
        },

        ["discord_channel", "id"],
      )) as Partial<Scrims>[];
      expect(scrims).toEqual([
        {
          discord_channel: "something",
          id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
        },
      ]);
      expect.assertions(2);
    });
  });

  describe("post()", () => {
    it("Should have correct post query", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation {
        insert_players(objects: [{ display_name: "Supreme", discord_id: "244307424838811648" }]) {
          returning {
            id
          }
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            insert_players: {
              returning: [
                {
                  id: "7605b2bf-1875-4415-a04b-75fe47768565",
                },
              ],
            },
          },
        });
      };
      const newID = await nhostDb.post("players", [
        {
          display_name: "Supreme",
          discord_id: "244307424838811648",
        },
      ]);
      expect(newID).toEqual(["7605b2bf-1875-4415-a04b-75fe47768565"]);
      expect.assertions(2);
    });
    it("Should have correct post query", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation {
        insert_players(objects: [{ display_name: "Supreme", discord_id: "244307424838811648", elo: 1, stats: null }]) {
          returning {
            id
          }
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            insert_players: {
              returning: [
                {
                  id: "7605b2bf-1875-4415-a04b-75fe47768565",
                },
              ],
            },
          },
        });
      };
      const newID = await nhostDb.post("players", [
        {
          display_name: "Supreme",
          discord_id: "244307424838811648",
          elo: 1,
          stats: null,
        },
      ]);
      expect(newID).toEqual(["7605b2bf-1875-4415-a04b-75fe47768565"]);
      expect.assertions(2);
    });
  });

  describe("update()", () => {
    it("Should have correct update query", async () => {
      mockRequest = (query) => {
        const expected = `
        mutation {
         update_scrim_signups(
           where: { _and: [{ scrim_id: { _eq: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9" } }, { team_name: { _eq: "Fineapples" } }] },
          _set:
          { team_name: "Dude Cube" }
         )
         {
           returning {
             team_name
             player_one_id
             player_two_id
             player_three_id
             scrim_id
           }
         }
       }
`;
        expect(query.replace(/\s+/g, ` `)).toEqual(
          expected.replace(/\s+/g, ` `),
        );
        return Promise.resolve({
          data: {
            update_scrim_signups: {
              returning: [
                {
                  team_name: "Dude Cube",
                  player_one_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                  player_two_id: "c450684a-d423-4e52-b6ea-0778bf021910",
                  player_three_id: "7605b2bf-1875-4415-a04b-75fe47768565",
                  scrim_id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
                },
              ],
            },
          },
        });
      };
      const newData = await nhostDb.update(
        "scrim_signups",
        {
          operator: "and",
          expressions: [
            {
              fieldName: "scrim_id",
              comparator: "eq",
              value: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
            },
            { fieldName: "team_name", comparator: "eq", value: "Fineapples" },
          ],
        },

        { team_name: "Dude Cube" },
        [
          "team_name",
          "player_one_id",
          "player_two_id",
          "player_three_id",
          "scrim_id",
        ],
      );
      expect(newData).toEqual([
        {
          team_name: "Dude Cube",
          player_one_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
          player_two_id: "c450684a-d423-4e52-b6ea-0778bf021910",
          player_three_id: "7605b2bf-1875-4415-a04b-75fe47768565",
          scrim_id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
        },
      ]);
      expect.assertions(2);
    });
  });

  describe("delete()", () => {
    it("Should have correct delete by unique fields query", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation {
        delete_scrim_signups(where: { _and: [{ scrim_id: { _eq: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9" } }, { team_name: { _eq: "Fineapples" } }] }) {
          returning {
            id
          }
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            delete_scrim_signups: {
              returning: [
                {
                  id: "6237fd9b-9f72-4748-96fb-620b8e087c1f",
                },
              ],
            },
          },
        });
      };

      const deletedIDs = await nhostDb.delete(
        "scrim_signups",
        {
          operator: "and",
          expressions: [
            {
              fieldName: "scrim_id",
              comparator: "eq",
              value: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
            },
            { fieldName: "team_name", comparator: "eq", value: "Fineapples" },
          ],
        },
        ["id"],
      );
      expect(deletedIDs[0].id).toEqual("6237fd9b-9f72-4748-96fb-620b8e087c1f");
      expect.assertions(2);
    });

    it("Should have correct delete by id query", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation {
        delete_players(where: { id: { _eq: "02ac47c9-bde8-4f74-abf6-59b2c534d965" } }) {
          returning {
            id
          }
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            delete_players: {
              returning: [
                {
                  id: "02ac47c9-bde8-4f74-abf6-59b2c534d965",
                },
              ],
            },
          },
        });
      };
      const deletedID = await nhostDb.deleteById(
        "players",
        "02ac47c9-bde8-4f74-abf6-59b2c534d965",
      );
      expect(deletedID).toEqual("02ac47c9-bde8-4f74-abf6-59b2c534d965");
      expect.assertions(2);
    });
  });

  const createPlayer = (
    discordId: string,
    displayName: string,
    overstatId?: string,
    elo?: number,
  ): PlayerInsert => {
    return { discordId, displayName, overstatId: overstatId, elo };
  };
  const zboy = createPlayer("316280734115430403", "zboy", "749174");
  const supreme = createPlayer("244307424838811648", "Supreme", undefined, 1);
  const theheuman = createPlayer("315310843317321732", "TheHeuman", "357606");

  describe("insert player()", () => {
    it("Should have correct mutation query with no overstat link", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation upsertPlayer {
        insert_players_one(
          object: {discord_id: "316280734115430403", display_name: "zboy"}
          on_conflict: {
            constraint: players_discord_id_key,  # Unique constraint on discord_id
            update_columns: [
              display_name
            ]
          }
        ) {
          id  # Return the ID of the player, whether newly inserted or found
          overstat_id
          display_name
          discord_id
          elo
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            insert_players_one: {
              id: "7605b2bf-1875-4415-a04b-75fe47768565",
              overstat_id: "12345",
            },
          },
        });
      };
      const newPlayer = await nhostDb.insertPlayerIfNotExists(
        "316280734115430403",
        "zboy",
      );
      expect(newPlayer.id).toEqual("7605b2bf-1875-4415-a04b-75fe47768565");
      expect.assertions(2);
    });

    it("Should have correct mutation query with overstat link", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation upsertPlayer {
        insert_players_one(
          object: {discord_id: "316280734115430403", display_name: "zboy", overstat_id: "749174"}
          on_conflict: {
            constraint: players_discord_id_key,  # Unique constraint on discord_id
            update_columns: [
              display_name
              overstat_id
            ]
          }
        ) {
          id  # Return the ID of the player, whether newly inserted or found
          overstat_id
          display_name
          discord_id
          elo
        }
      }
    `;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            insert_players_one: {
              id: "7605b2bf-1875-4415-a04b-75fe47768565",
            },
          },
        });
      };
      const newPlayer = await nhostDb.insertPlayerIfNotExists(
        "316280734115430403",
        "zboy",
        "749174",
      );
      expect(newPlayer.id).toEqual("7605b2bf-1875-4415-a04b-75fe47768565");
      expect.assertions(2);
    });
  });

  describe("insert multiple players", () => {
    it("Should have correct mutation query", async () => {
      mockRequest = (query) => {
        const expected = `
          mutation upsertPlayer {
            insert_players(objects: [
              {discord_id: "316280734115430403", display_name: "zboy"}
              {discord_id: "244307424838811648", display_name: "Supreme"}
              {discord_id: "315310843317321732", display_name: "TheHeuman"}
            ]
              on_conflict: {
                constraint: players_discord_id_key,   # Unique constraint on discord_id
                update_columns: [
                  display_name  # necessary for graphql to actually return an id
                ]
              }
            ) {
              returning {
                id
                discord_id
                overstat_id
                display_name
              }
           }

            update_player_1: update_players(
              where: {discord_id: {_eq: "316280734115430403"}},
              _set: {
                display_name: "zboy",
                overstat_id: "749174"
              }
            ) {
              affected_rows
            }

            update_player_2: update_players(
              where: {discord_id: {_eq: "244307424838811648"}},
              _set: {
                display_name: "Supreme",
                elo: 1
              }
            ) {
              affected_rows
            }

            update_player_3: update_players(
              where: {discord_id: {_eq: "315310843317321732"}},
              _set: {
                display_name: "TheHeuman",
                overstat_id: "357606"
              }
            ) {
              affected_rows
            }
          }
        `;
        expect(query.replace(/\s+/g, ` `)).toEqual(
          expected.replace(/\s+/g, ` `),
        );
        return Promise.resolve({
          data: {
            insert_players: {
              returning: [
                {
                  id: "11583f2c-184f-4ab5-9f6f-ff33f2741117",
                  discord_id: zboy.discordId,
                },
                {
                  id: "7605b2bf-1875-4415-a04b-75fe47768565",
                  discord_id: supreme.discordId,
                },
                {
                  id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                  discord_id: theheuman.discordId,
                },
              ],
            },
            update_player_1: {
              affected_rows: 1,
            },
            update_player_2: {
              affected_rows: 1,
            },
            update_player_3: {
              affected_rows: 1,
            },
          },
        });
      };
      // attempt to insert zboy twice should result in only one zboy being inserted
      const newID = await nhostDb.insertPlayers([
        zboy,
        zboy,
        supreme,
        theheuman,
      ]);
      expect(newID.map((player) => player.id)).toEqual([
        "11583f2c-184f-4ab5-9f6f-ff33f2741117",
        "11583f2c-184f-4ab5-9f6f-ff33f2741117",
        "7605b2bf-1875-4415-a04b-75fe47768565",
        "f272a11e-5b30-4aea-b596-af2464de59ba",
      ]);
      expect.assertions(2);
    });
  });

  describe("replaceTeammate()", () => {
    it("should replace teammate", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation {
  update_scrim_signups_many(
    updates: [
      {
        where: {
          scrim_id: { _eq: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9" },
          player_one_id: { _eq: "11583f2c-184f-4ab5-9f6f-ff33f2741117" },
          _or: [
            { signup_player_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_one_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_two_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_three_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } }
          ]
        },
        _set: { player_one_id: "c450684a-d423-4e52-b6ea-0778bf021910" }
      },
      {
        where: {
          scrim_id: { _eq: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9" },
          player_two_id: { _eq: "11583f2c-184f-4ab5-9f6f-ff33f2741117" },
          _or: [
            { signup_player_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_one_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_two_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_three_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } }
          ]
        },
        _set: { player_two_id: "c450684a-d423-4e52-b6ea-0778bf021910" }
      },
      {
        where: {
          scrim_id: { _eq: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9" },
          player_three_id: { _eq: "11583f2c-184f-4ab5-9f6f-ff33f2741117" },
          _or: [
            { signup_player_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_one_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_two_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_three_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } }
          ]
        },
        _set: { player_three_id: "c450684a-d423-4e52-b6ea-0778bf021910" }
      }
    ]
  ) {
    returning {
      team_name
      signup_player_id
      player_one_id
      player_two_id
      player_three_id
      scrim_id
    }
  }
}
`;
        expect(query).toEqual(expected);
        return Promise.resolve({
          data: {
            update_scrim_signups_many: [
              {
                returning: [],
              },
              {
                returning: [
                  {
                    team_name: "Fineapples",
                    signup_player_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                    player_one_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                    player_two_id: "c450684a-d423-4e52-b6ea-0778bf021910",
                    player_three_id: "7605b2bf-1875-4415-a04b-75fe47768565",
                    scrim_id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
                  },
                ],
              },
              {
                returning: [],
              },
            ],
          },
        });
      };
      const signup = await nhostDb.replaceTeammate(
        "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
        "Fineapples",
        "f272a11e-5b30-4aea-b596-af2464de59ba",
        "11583f2c-184f-4ab5-9f6f-ff33f2741117",
        "c450684a-d423-4e52-b6ea-0778bf021910",
      );
      expect(signup).toEqual({
        team_name: "Fineapples",
        signup_player_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
        player_one_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
        player_two_id: "c450684a-d423-4e52-b6ea-0778bf021910",
        player_three_id: "7605b2bf-1875-4415-a04b-75fe47768565",
        scrim_id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
      });
      expect.assertions(2);
    });
  });

  describe("changeTeamName()", () => {
    it("should change team name", async () => {
      mockRequest = (query) => {
        const expected = `
      mutation {
  update_scrim_signups(
        where: {
          scrim_id: { _eq: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9" },
          team_name: { _eq: "Dude Cube" },
          _or: [
            { signup_player_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_one_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_two_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } },
            { player_three_id: { _eq: "f272a11e-5b30-4aea-b596-af2464de59ba" } }
          ]
        },
        _set: { team_name: "Can't come up with good team name" }
  ) {
    returning {
      team_name
      signup_player_id
      player_one_id
      player_two_id
      player_three_id
      scrim_id
    }
  }
}
`;
        expect(query.replace(/\s+/g, ` `)).toEqual(
          expected.replace(/\s+/g, ` `),
        );
        return Promise.resolve({
          data: {
            update_scrim_signups_one: {
              returning: [
                {
                  team_name: "Can't come up with good team name",
                  signup_player_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                  player_one_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
                  player_two_id: "c450684a-d423-4e52-b6ea-0778bf021910",
                  player_three_id: "7605b2bf-1875-4415-a04b-75fe47768565",
                  scrim_id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
                },
              ],
            },
          },
        });
      };
      const signup = await nhostDb.changeTeamName(
        "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
        "f272a11e-5b30-4aea-b596-af2464de59ba",
        "Dude Cube",
        "Can't come up with good team name",
      );
      expect(signup).toEqual({
        team_name: "Can't come up with good team name",
        signup_player_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
        player_one_id: "f272a11e-5b30-4aea-b596-af2464de59ba",
        player_two_id: "c450684a-d423-4e52-b6ea-0778bf021910",
        player_three_id: "7605b2bf-1875-4415-a04b-75fe47768565",
        scrim_id: "ebb385a2-ba18-43b7-b0a3-44f2ff5589b9",
      });
      expect.assertions(2);
    });
  });

  describe("close and compute scrim", () => {
    const expectedDeleteQuery = `
      mutation {
        delete_scrim_signups(where: { _or: [{ scrim_id: { _eq: "scrim_id_1" } }, { scrim_id: { _eq: "scrim_id_2" } }] }) {
          returning {
            id
          }
        }
      }
    `;
    it("closeScrim()", async () => {
      mockRequest = (query) => {
        let expected = `
        mutation {
         update_scrims(
           where: { discord_channel: { _eq: "discord_channel_id" } },
          _set:
          {
            active: false
          }
         )
         {
           returning {
             id
           }
         }
       }
    `;
        let returnData: { data: object } = {
          data: {
            update_scrims: {
              returning: [
                {
                  id: "scrim_id_1",
                },
                {
                  id: "scrim_id_2",
                },
              ],
            },
          },
        };
        if (query.includes("delete_")) {
          expected = expectedDeleteQuery;
          returnData = {
            data: {
              delete_scrim_signups: {
                returning: [
                  {
                    id: "7d3bc090-f9aa-4d74-a686-7ab198ab2dfe",
                  },
                  {
                    id: "9766e780-3c13-4298-8eed-a3cf9a206db4",
                  },
                ],
              },
            },
          };
        }
        expect(query.replace(/\s+/g, ` `)).toEqual(
          expected.replace(/\s+/g, ` `),
        );
        return Promise.resolve(returnData);
      };
      const returnedData = await nhostDb.closeScrim("discord_channel_id");
      expect(returnedData).toEqual([
        "7d3bc090-f9aa-4d74-a686-7ab198ab2dfe",
        "9766e780-3c13-4298-8eed-a3cf9a206db4",
      ]);
      expect.assertions(3);
    });

    it("updateScrim()", async () => {
      mockRequest = (query) => {
        const expected = `
        mutation {
         update_scrims(
           where: { id: { _eq: "scrim_id" } },
          _set:
          {
            overstat_id: "12345",
            overstat_json: {id:"valid id",other_fields:"other values",property:{several:"value",fields:"other value"}}
          }
         )
         {
           returning {
             id
           }
         }
       }
    `;
        const returnData: { data: object } = {
          data: {
            update_scrims: {
              returning: [
                {
                  id: "scrim_id_1",
                },
              ],
            },
          },
        };
        expect(query.replace(/\s+/g, ` `)).toEqual(
          expected.replace(/\s+/g, ` `),
        );
        return Promise.resolve(returnData);
      };
      await nhostDb.updateScrim("scrim_id", {
        overstatId: "12345",
        overstatJson: JSON.parse(
          `{"id": "valid id", "other_fields": "other values", "property": { "several": "value", "fields": "other value"} }`,
        ),
      });
      expect.assertions(1);
    });
  });

  it("Should set player prio", async () => {
    const startDate = new Date();
    const endDate = new Date();
    const amount = -400;
    const reason = "Keeps typing random stuff in chat";
    mockRequest = (query) => {
      const expected = `
      mutation {
        insert_prio(objects: [{ player_id: "c79f4607-2343-465a-94e4-f99e63ab7602", start_date: "${startDate.toISOString()}", end_date: "${endDate.toISOString()}", amount: -400, reason: "${reason}" }]) {
          returning {
            id
          }
        }
      }
    `;
      expect(query).toEqual(expected);
      return Promise.resolve({
        data: {
          insert_prio: {
            returning: [
              {
                id: "7605b2bf-1875-4415-a04b-75fe47768565",
              },
            ],
          },
        },
      });
    };
    const newID = await nhostDb.setPrio(
      ["c79f4607-2343-465a-94e4-f99e63ab7602"],
      startDate,
      endDate,
      amount,
      reason,
    );
    expect(newID).toEqual(["7605b2bf-1875-4415-a04b-75fe47768565"]);
    expect.assertions(2);
  });

  it("Should expunge player prio", async () => {
    const ids = [
      "1d03b32b-6b6b-496c-a72e-48ba9ab1ad08",
      "17538df5-4052-4233-b94b-6ed09b512c59",
    ];

    mockRequest = (query) => {
      const expected = `
      mutation {
        delete_prio(where: { _or: [{ id: { _eq: "1d03b32b-6b6b-496c-a72e-48ba9ab1ad08" } }, { id: { _eq: "17538df5-4052-4233-b94b-6ed09b512c59" } }] }) {
          returning {
            player {
              discord_id
              display_name
            }
            amount
            end_date
          }
        }
      }
    `;
      expect(query).toEqual(expected);
      return Promise.resolve({
        data: {
          delete_prio: {
            returning: [
              {
                player: {
                  discord_id: "7456",
                  display_name: "Treazy",
                },
                amount: -400,
                end_date: "2024-12-15",
              },
              {
                player: {
                  discord_id: "436819",
                  display_name: "Revy",
                },
                amount: -20,
                end_date: "2024-12-17",
              },
            ],
          },
        },
      });
    };
    const expungedPrios = await nhostDb.expungePrio(ids);
    const treazyPrio = expungedPrios[0];
    const revyPrio = expungedPrios[1];
    expect(treazyPrio.playerDisplayName).toEqual("Treazy");
    expect(revyPrio.playerDisplayName).toEqual("Revy");
    expect.assertions(3);
  });

  it("should get team prio", async () => {
    const scrimDate = new Date();
    mockRequest = (query) => {
      const expected = `
      query {
        prio(where: { _and: [{ start_date: { _lte: "${scrimDate.toISOString()}" } }, { end_date: { _gte: "${scrimDate.toISOString()}" } }] }) {
          player {
            discord_id
            id
          }
          amount
          reason
        }
      }
    `;
      expect(query).toEqual(expected);
      return Promise.resolve({
        data: {
          prio: [
            {
              player: {
                id: "4d47ddfc-9773-4df2-9b59-35f55212535d",
                discord_id: "675854726251675700",
              },
              amount: -5,
              reason: "Rude to staff",
            },
          ],
        },
      });
    };

    const prioPlayers = await nhostDb.getPrio(scrimDate);
    expect(prioPlayers).toEqual([
      {
        id: "4d47ddfc-9773-4df2-9b59-35f55212535d",
        discordId: "675854726251675700",
        amount: -5,
        reason: "Rude to staff",
      },
    ]);
  });

  it("Should add admin role", async () => {
    const voidAdminRole = {
      discordRoleId: "1060737998423072778",
      roleName: "VESA Admin",
    };

    mockRequest = (query) => {
      const expected = `
      mutation {
        insert_scrim_admin_roles(objects: [{ discord_role_id: "1060737998423072778", role_name: "VESA Admin" }]) {
          returning {
            id
          }
        }
      }
    `;
      expect(query).toEqual(expected);
      return Promise.resolve({
        data: {
          insert_scrim_admin_roles: {
            returning: [
              {
                id: "1a8740fc-dfc1-4f94-8c3f-04177656ceef",
              },
            ],
          },
        },
      });
    };
    const newId = await nhostDb.addAdminRoles([voidAdminRole]);
    expect(newId).toEqual(["1a8740fc-dfc1-4f94-8c3f-04177656ceef"]);
    expect.assertions(2);
  });

  it("Should get admin roles", async () => {
    mockRequest = (query) => {
      const expected = `
      query {
        scrim_admin_roles {
          discord_role_id
          role_name
        }
      }
    `;
      expect(query).toEqual(expected);
      return Promise.resolve({
        data: {
          scrim_admin_roles: [
            {
              discord_role_id: "1060737998423072778",
              role_name: "VESA Admin",
            },
          ],
        },
      });
    };
    const adminRoles = await nhostDb.getAdminRoles();
    expect(adminRoles).toEqual([
      {
        discordRoleId: "1060737998423072778",
        roleName: "VESA Admin",
      },
    ]);
    expect.assertions(2);
  });

  describe("downloadFileById()", () => {
    it("should call storage.download with the correct fileId and return the blob", async () => {
      const fileId = "182bfcb2-ccad-436f-8fb4-2d2bb3cbc57c";
      const blob = new Blob(['{"status":"success","data":[]}']);
      mockDownload = jest.fn().mockResolvedValue({ file: blob, error: null });

      const result = await nhostDb.downloadFileById(fileId);

      expect(mockDownload).toHaveBeenCalledWith({ fileId });
      expect(result).toBe(blob);
      expect.assertions(2);
    });

    it("should throw when storage.download returns an error", async () => {
      mockDownload = jest
        .fn()
        .mockResolvedValue({ file: null, error: new Error("storage error") });

      await expect(nhostDb.downloadFileById("some-id")).rejects.toThrow(
        "storage error",
      );
    });
  });

  describe("downloadFileByName()", () => {
    it("should look up the file id by name then download and return the blob", async () => {
      const fileId = "182bfcb2-ccad-436f-8fb4-2d2bb3cbc57c";
      const blob = new Blob(['{"status":"success","data":[]}']);
      mockRequest = (query) => {
        const expected = `
      query {
        files(where: { name: { _eq: "apm-mmr.json" } }, limit: 1) {
          id
        }
      }
    `;
        expect(query.replace(/\s+/g, " ")).toEqual(
          expected.replace(/\s+/g, " "),
        );
        return Promise.resolve({ data: { files: [{ id: fileId }] } });
      };
      mockDownload = jest.fn().mockResolvedValue({ file: blob, error: null });

      const result = await nhostDb.downloadFileByName("apm-mmr.json");

      expect(mockDownload).toHaveBeenCalledWith({ fileId });
      expect(result).toBe(blob);
      expect.assertions(3);
    });

    it("should throw when no file matches the name", async () => {
      mockRequest = () => Promise.resolve({ data: { files: [] } });

      await expect(nhostDb.downloadFileByName("apm-mmr.json")).rejects.toThrow(
        'File not found: "apm-mmr.json"',
      );
    });

    it("should throw when the graphql request fails", async () => {
      mockRequest = () =>
        Promise.resolve({ data: null, error: { message: "graphql error" } });

      await expect(nhostDb.downloadFileByName("apm-mmr.json")).rejects.toThrow(
        'Failed to look up file "apm-mmr.json"',
      );
    });
  });

  describe("getLeagueTeamIdByName()", () => {
    const seasonId = "season-uuid";
    const teamName = "Test Team";
    const expectedQuery = `
      query {
        league_teams(where: { _and: [{ season_id: { _eq: "${seasonId}" } }, { team_name: { _eq: "${teamName}" } }] }) {
          id
        }
      }
    `;

    it("Should return the team id when exactly one team matches", async () => {
      mockRequest = (query) => {
        expect(query).toEqual(expectedQuery);
        return Promise.resolve({
          data: { league_teams: [{ id: "team-uuid" }] },
        });
      };

      const result = await nhostDb.getLeagueTeamIdByName(seasonId, teamName);

      expect(result).toBe("team-uuid");
      expect.assertions(2);
    });

    it("Should return null when no teams match", async () => {
      mockRequest = (query) => {
        expect(query).toEqual(expectedQuery);
        return Promise.resolve({ data: { league_teams: [] } });
      };

      const result = await nhostDb.getLeagueTeamIdByName(seasonId, teamName);

      expect(result).toBeNull();
      expect.assertions(2);
    });

    it("Should return null when multiple teams match the same name", async () => {
      mockRequest = (query) => {
        expect(query).toEqual(expectedQuery);
        return Promise.resolve({
          data: {
            league_teams: [{ id: "team-uuid-1" }, { id: "team-uuid-2" }],
          },
        });
      };

      const result = await nhostDb.getLeagueTeamIdByName(seasonId, teamName);

      expect(result).toBeNull();
      expect.assertions(2);
    });
  });

  it("Should remove admin roles", async () => {
    mockRequest = (query) => {
      const expected = `
      mutation {
        delete_scrim_admin_roles(where: { _or: [{ discord_role_id: { _eq: "1060737998423072778" } }] }) {
          returning {
            id
          }
        }
      }
    `;
      expect(query).toEqual(expected);
      return Promise.resolve({
        data: {
          delete_scrim_admin_roles: {
            returning: [
              {
                id: "1a8740fc-dfc1-4f94-8c3f-04177656ceef",
              },
            ],
          },
        },
      });
    };
    const deletedIds = await nhostDb.removeAdminRoles(["1060737998423072778"]);
    expect(deletedIds).toEqual(["1a8740fc-dfc1-4f94-8c3f-04177656ceef"]);
    expect.assertions(2);
  });
});
