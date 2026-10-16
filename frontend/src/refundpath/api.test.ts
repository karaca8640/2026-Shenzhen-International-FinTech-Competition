import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import type { Case } from "./types";

afterEach(() => vi.unstubAllGlobals());

describe("sandbox API boundaries", () => {
  it("passes explicit approval and the reviewed content version", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", {status: 200}));
    vi.stubGlobal("fetch", fetcher);
    await api.approve({id: "case-01", content_version: 4} as Case, "draft-01", true);
    expect(fetcher).toHaveBeenCalledWith("/api/cases/case-01/drafts/draft-01/approve", expect.objectContaining({method: "POST", credentials: "same-origin", body: JSON.stringify({approved: true, content_version: 4})}));
  });
  it("uses a simulation endpoint and sends complaint-channel confirmation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", {status: 200}));
    vi.stubGlobal("fetch", fetcher);
    await api.simulate("case-01", "draft-01", false);
    expect(fetcher).toHaveBeenCalledWith("/api/cases/case-01/drafts/draft-01/simulate", expect.objectContaining({body: JSON.stringify({channel_confirmed: false})}));
  });
  it("surfaces the backend's blocking review message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({detail: "Human review is required."}), {status: 409})));
    await expect(api.review({id: "case-01", content_version: 1} as Case)).rejects.toThrow("Human review is required.");
  });
  it("handles deletion responses without parsing an empty JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status: 204})));
    await expect(api.remove("case-01")).resolves.toBeUndefined();
  });
  it("requires an explicit opt-in value for assistant requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", {status: 200}));
    vi.stubGlobal("fetch", fetcher);
    await api.assist("case-01", false);
    expect(fetcher).toHaveBeenCalledWith("/api/cases/case-01/assist", expect.objectContaining({body: JSON.stringify({opt_in: false})}));
  });
});
