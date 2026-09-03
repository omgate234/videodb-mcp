import type { Connection } from "./client";

/**
 * GET /assets — a unified, filtered, sorted, paginated view over videos, audio
 * and images. The SDK has no binding for it, so the call goes through the same
 * authenticated axios client the SDK uses (`Connection.vhttp`) rather than a
 * second fetch stack. `convert: false` keeps the API's snake_case keys intact.
 */

export type AssetType = "video" | "audio" | "image";
export type AssetSortBy = "name" | "duration" | "size" | "created_at";
export type SortOrder = "asc" | "desc";

export interface ListAssetsParams {
  collection_id?: string;
  asset_type?: string;
  sort_by?: AssetSortBy;
  sort_order?: SortOrder;
  min_duration?: number;
  max_duration?: number;
  min_size?: number;
  max_size?: number;
  name_pattern?: string;
  page?: number;
  page_size?: number;
}

export interface Pagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

export interface AssetsPage {
  assets: Record<string, unknown>[];
  pagination: Pagination;
}

/** Drop unset params so the API applies its own defaults. */
const defined = (params: ListAssetsParams): Record<string, unknown> =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));

export async function listAssets(vdb: Connection, params: ListAssetsParams): Promise<AssetsPage> {
  const res = await vdb.vhttp.get<AssetsPage>(["assets"], { params: defined(params) }, { convert: false });
  // The client's return type always camelCases; `convert: false` means the body really is snake_case.
  return res.data as unknown as AssetsPage;
}
