import { describe, expect, it } from "vitest";
import { collections } from "@/lib/toolsets/collections";
import { call, fakeConnection, toolNamed } from "./harness";

const COLL = { id: "c-1", name: "Demos", description: "Demo videos", isPublic: false, userId: "u" };
const PLAIN = { id: "c-1", name: "Demos", description: "Demo videos", is_public: false };

describe("collections", () => {
  it("list_collections returns trimmed collections", async () => {
    const vdb = fakeConnection({ "GET collection": { collections: [COLL] } });
    const { data, isError } = await call(toolNamed(collections, "list_collections"), {}, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual([PLAIN]);
    expect(vdb.http.get).toHaveBeenCalledWith(["collection"]);
  });

  it("get_collection hits GET /collection/{id}", async () => {
    const vdb = fakeConnection({ "GET collection/c-1": COLL });
    const { data, isError } = await call(toolNamed(collections, "get_collection"), { collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual(PLAIN);
    expect(vdb.http.get).toHaveBeenCalledWith(["collection", "c-1"]);
  });

  it("create_collection posts name/description/is_public", async () => {
    const vdb = fakeConnection({
      "POST collection": (body: any) => {
        expect(body).toEqual({ name: "Demos", description: "Demo videos", is_public: true });
        return { ...COLL, isPublic: true };
      },
    });
    const t = toolNamed(collections, "create_collection");
    expect(t.kind).toBe("create");
    const { data, isError } = await call(t, { name: "Demos", description: "Demo videos", is_public: true }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ ...PLAIN, is_public: true });
  });

  it("update_collection fills the omitted field from the current record and patches visibility separately", async () => {
    const patches: unknown[] = [];
    const vdb = fakeConnection({
      "GET collection/c-1": COLL,
      "PATCH collection/c-1": (body: any) => {
        patches.push(body);
        return "is_public" in body ? {} : { ...COLL, name: "Renamed" };
      },
    });
    const t = toolNamed(collections, "update_collection");
    expect(t.kind).toBe("update");
    const { data, isError } = await call(t, { collection_id: "c-1", name: "Renamed", is_public: true }, vdb);
    expect(isError).toBe(false);
    expect(patches).toEqual([{ name: "Renamed", description: "Demo videos" }, { is_public: true }]);
    expect(data).toEqual({ ...PLAIN, name: "Renamed", is_public: true });

    const { isError: rejected, data: err } = await call(t, { collection_id: "c-1" }, fakeConnection()).catch((e) => ({ isError: true, data: String(e) }));
    expect(rejected).toBe(true);
    expect(err).toContain("at least one");
  });

  it("delete_collection hits DELETE /collection/{id} and refuses default", async () => {
    const vdb = fakeConnection({ "DELETE collection/c-1": {} });
    const t = toolNamed(collections, "delete_collection");
    expect(t.kind).toBe("destructive");
    const { data, isError } = await call(t, { collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ deleted: true, collection_id: "c-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["collection", "c-1"]);

    const refused = await call(t, { collection_id: "default" }, vdb);
    expect(refused.isError).toBe(true);
    expect(refused.data).toContain("cannot be deleted");
    expect(vdb.http.delete).toHaveBeenCalledTimes(1);
  });

  it("get_account_usage hits GET /billing/usage", async () => {
    const vdb = fakeConnection({ "GET billing/usage": { storageUsed: 42, creditsRemaining: 100 } });
    const { data, isError } = await call(toolNamed(collections, "get_account_usage"), {}, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ storage_used: 42, credits_remaining: 100 });
    expect(vdb.http.get).toHaveBeenCalledWith(["billing", "usage"]);
  });

  it("list_invoices hits GET /billing/invoices and caps at 200", async () => {
    const invoices = Array.from({ length: 201 }, (_, i) => ({ invoiceId: `inv-${i}`, amountDue: i }));
    const vdb = fakeConnection({ "GET billing/invoices": invoices });
    const { data, isError } = await call(toolNamed(collections, "list_invoices"), {}, vdb);
    expect(isError).toBe(false);
    const out = data as { invoices: unknown[]; truncated: boolean; total: number };
    expect(out.invoices).toHaveLength(200);
    expect(out.invoices[0]).toEqual({ invoice_id: "inv-0", amount_due: 0 });
    expect(out).toMatchObject({ truncated: true, total: 201 });
    expect(vdb.http.get).toHaveBeenCalledWith(["billing", "invoices"]);
  });
});
