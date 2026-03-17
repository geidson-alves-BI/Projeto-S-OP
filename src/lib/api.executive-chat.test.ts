import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_URL, getExecutiveChatContext, sendExecutiveChat } from "@/lib/api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Executive chat API contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts executive chat payload to the expected endpoint", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        answer: "ok",
        factual: true,
        confidence: "high",
      }),
    );

    await sendExecutiveChat({
      message: "Resumo do ciclo",
      persona: "CEO",
    } as never);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/ai/executive_chat`,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("requests executive chat context with include_planning_context query", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ context: {} }));

    await getExecutiveChatContext(false);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/ai/executive_chat_context?include_planning_context=false`,
    );
  });

  it("surfaces backend error detail for chat failures", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "backend offline" }, 503));

    await expect(
      sendExecutiveChat({
        message: "status",
        persona: "COO",
      } as never),
    ).rejects.toThrow("backend offline");
  });
});
