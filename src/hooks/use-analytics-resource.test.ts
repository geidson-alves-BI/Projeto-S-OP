import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAnalyticsResource } from "@/hooks/use-analytics-resource";

describe("useAnalyticsResource", () => {
  it("autoloads data when enabled", async () => {
    const request = vi.fn().mockResolvedValue({ value: 10 });

    const { result } = renderHook(() =>
      useAnalyticsResource({
        autoLoad: true,
        request,
      }),
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ value: 10 });
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdatedAt).not.toBeNull();
  });

  it("does not autoload when disabled", async () => {
    const request = vi.fn().mockResolvedValue({ value: 99 });

    const { result } = renderHook(() =>
      useAnalyticsResource({
        autoLoad: false,
        request,
      }),
    );

    expect(request).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1);
      expect(result.current.data).toEqual({ value: 99 });
    });
  });

  it("exposes normalized error when request fails", async () => {
    const request = vi.fn().mockRejectedValue(new Error("servico indisponivel"));

    const { result } = renderHook(() =>
      useAnalyticsResource({
        autoLoad: false,
        request,
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe("servico indisponivel");
    });
  });
});
