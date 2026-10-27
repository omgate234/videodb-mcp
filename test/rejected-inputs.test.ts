import { describe, expect, it } from "vitest";
import { InvalidRequestError } from "videodb";
import { settleError } from "@/lib/mcp/tool";
import { getVideo } from "@/lib/toolsets/media";

const httpError = (status: number, message: string) =>
  new InvalidRequestError({ status, statusText: "x", data: {} } as never, { cause: message } as never);

describe("rejected inputs are results, not tool errors", () => {
  it.each([400, 404, 409, 422])("HTTP %i comes back as {status:'rejected'} with the API's reason", (status) => {
    const { result, outcome } = settleError(httpError(status, "Clip duration: 4.5 greater than video length: 4.0"), getVideo);
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0].text);
    expect(body).toMatchObject({ status: "rejected", http_status: status, action_required: "fix_arguments" });
    expect(body.message).toContain("Clip duration: 4.5 greater than video length: 4.0");
    expect(body.message).toContain("Do not retry unchanged");
    // Telemetry still sees the error and its status; observ files it as a rejected input.
    expect(outcome).toMatchObject({ status: "error", errorType: "InvalidRequestError", httpStatus: status });
  });

  it.each([401, 403, 429, 500])("HTTP %i stays a tool error", (status) => {
    const { result, outcome } = settleError(httpError(status, "nope"), getVideo);
    expect(result.isError).toBe(true);
    expect(outcome.status).toBe("error");
  });

  it("a plain Error (job failure, bad URL) stays a tool error", () => {
    const { result } = settleError(new Error("Download failed."), getVideo);
    expect(result.isError).toBe(true);
  });
});
