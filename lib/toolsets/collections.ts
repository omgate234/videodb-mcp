import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID } from "@/lib/mcp/schemas";
import { collection } from "@/lib/videodb/resolve";
import { pick } from "@/lib/videodb/serialize";

/**
 * Collections + account. SDK: Connection.getCollections/getCollection/
 * createCollection/updateCollection, Collection.delete/makePublic/makePrivate,
 * Connection.checkUsage/getInvoices.
 */

// Collection instances carry every SDK method as an enumerable prop; keep only data.
const COLLECTION_KEYS = ["id", "name", "description", "is_public"];
const MAX_INVOICES = 200;

const listCollections = defineTool({
  name: "list_collections",
  title: "List collections",
  description: "List all collections in the connected VideoDB account, with their IDs, names, descriptions and visibility.",
  kind: "read",
  input: z.object({}),
  handler: async (_args, vdb) => (await vdb.getCollections()).map((c) => pick(c, COLLECTION_KEYS)),
});

const getCollection = defineTool({
  name: "get_collection",
  title: "Get collection details",
  description: "Get one collection's ID, name, description and public/private visibility.",
  kind: "read",
  input: z.object({ collection_id: COLLECTION_ID }),
  handler: async ({ collection_id }, vdb) => pick(await vdb.getCollection(collection_id), COLLECTION_KEYS),
});

const createCollection = defineTool({
  name: "create_collection",
  title: "Create collection",
  description: "Create a new VideoDB collection to organize videos. Returns the new collection with its ID.",
  kind: "create",
  input: z.object({
    name: z.string().describe("Collection name."),
    description: z.string().default("").describe("Optional description."),
    is_public: z.boolean().default(false).describe("Make the collection publicly viewable."),
  }),
  handler: async ({ name, description, is_public }, vdb) =>
    pick(await vdb.createCollection(name, description, is_public), COLLECTION_KEYS),
});

const updateCollection = defineTool({
  name: "update_collection",
  title: "Update collection",
  description:
    "Rename a collection, change its description, or switch it between public and private. Only the fields given are changed; at least one is required.",
  kind: "update",
  input: z
    .object({
      collection_id: COLLECTION_ID,
      name: z.string().optional().describe("New collection name."),
      description: z.string().optional().describe("New description."),
      is_public: z.boolean().optional().describe("true = publicly viewable, false = private."),
    })
    .refine((a) => a.name !== undefined || a.description !== undefined || a.is_public !== undefined, {
      message: "Provide at least one of name, description, is_public.",
    }),
  handler: async ({ collection_id, name, description, is_public }, vdb) => {
    let updated;
    if (name !== undefined || description !== undefined) {
      // SDK PATCH sends both fields; fill the omitted one from the current record so it is not blanked.
      const current = name === undefined || description === undefined ? await vdb.getCollection(collection_id) : undefined;
      updated = await vdb.updateCollection(collection_id, name ?? current?.name ?? "", description ?? current?.description ?? "");
    }
    if (is_public !== undefined) {
      const coll = collection(vdb, collection_id);
      await (is_public ? coll.makePublic() : coll.makePrivate());
    }
    const result = pick(updated ?? (await vdb.getCollection(collection_id)), COLLECTION_KEYS);
    return is_public === undefined ? result : { ...result, is_public };
  },
});

const deleteCollection = defineTool({
  name: "delete_collection",
  title: "Delete collection",
  description:
    "Permanently delete a collection and everything in it. This cannot be undone. The account's default collection cannot be deleted.",
  kind: "destructive",
  input: z.object({ collection_id: z.string().describe("ID of the collection to delete (the default collection is refused).") }),
  handler: async ({ collection_id }, vdb) => {
    if (collection_id === "default") throw new Error('The "default" collection cannot be deleted.');
    await collection(vdb, collection_id).delete();
    return { deleted: true, collection_id };
  },
});

const getAccountUsage = defineTool({
  name: "get_account_usage",
  title: "Get account usage",
  description: "Get the connected VideoDB account's current usage and billing summary as reported by VideoDB.",
  kind: "read",
  input: z.object({}),
  handler: async (_args, vdb) => vdb.checkUsage(),
});

const listInvoices = defineTool({
  name: "list_invoices",
  title: "List invoices",
  description: "List the connected VideoDB account's invoices (first 200; `truncated` is set when more exist).",
  kind: "read",
  input: z.object({}),
  handler: async (_args, vdb) => {
    const all = (await vdb.getInvoices()) ?? [];
    return { invoices: all.slice(0, MAX_INVOICES), ...(all.length > MAX_INVOICES ? { truncated: true, total: all.length } : {}) };
  },
});

export const collections: Toolset = {
  name: "collections",
  description: "Collections and account usage.",
  defaultEnabled: true,
  tools: [listCollections, getCollection, createCollection, updateCollection, deleteCollection, getAccountUsage, listInvoices],
};
