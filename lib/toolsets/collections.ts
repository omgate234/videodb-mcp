import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";

/**
 * Collections + account. SDK: Connection.getCollections/getCollection/
 * createCollection/updateCollection, Collection.delete/makePublic/makePrivate,
 * Connection.checkUsage/getInvoices.
 */

const listCollections = defineTool({
  name: "list_collections",
  title: "List collections",
  description: "List all collections in the connected VideoDB account, with their IDs, names, and descriptions.",
  kind: "read",
  input: z.object({}),
  handler: async (_args, vdb) => vdb.getCollections(),
});

const createCollection = defineTool({
  name: "create_collection",
  title: "Create collection",
  description: "Create a new VideoDB collection to organize videos.",
  kind: "create",
  input: z.object({
    name: z.string().describe("Collection name."),
    description: z.string().default("").describe("Optional description."),
    is_public: z.boolean().default(false).describe("Make the collection publicly viewable."),
  }),
  handler: async ({ name, description, is_public }, vdb) => vdb.createCollection(name, description, is_public),
});

export const collections: Toolset = {
  name: "collections",
  description: "Collections and account usage.",
  defaultEnabled: true,
  tools: [listCollections, createCollection],
};
