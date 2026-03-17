import { describe, expect, it } from "vitest";
import {
  buildAnalyticsAvailability,
  normalizeAnalyticsError,
  sanitizeProductCopy,
} from "@/lib/analytics-consumption";

describe("analytics-consumption helpers", () => {
  it("normalizes unknown errors", () => {
    expect(normalizeAnalyticsError(new Error("falha de rede"))).toBe("falha de rede");
    expect(normalizeAnalyticsError("timeout")).toBe("timeout");
    expect(normalizeAnalyticsError(null)).toBe("Falha ao consultar a analise.");
  });

  it("returns unavailable when request fails without content", () => {
    const state = buildAnalyticsAvailability({
      loading: false,
      error: "offline",
      hasContent: false,
      messages: {
        unavailable: "Analise indisponivel no momento.",
      },
    });

    expect(state.state).toBe("unavailable");
    expect(state.message).toBe("Analise indisponivel no momento.");
  });

  it("returns partial when error happens with existing content", () => {
    const state = buildAnalyticsAvailability({
      loading: false,
      error: "timeout",
      hasContent: true,
      isPartial: true,
      messages: {
        partial: "Atualizacao parcial.",
      },
    });

    expect(state.state).toBe("partial");
    expect(state.message).toBe("Atualizacao parcial.");
    expect(state.hasContent).toBe(true);
  });

  it("returns empty when there is no usable data", () => {
    const state = buildAnalyticsAvailability({
      loading: false,
      error: null,
      hasContent: true,
      isEmpty: true,
      messages: {
        empty: "Nenhum indicador encontrado.",
      },
    });

    expect(state.state).toBe("empty");
    expect(state.message).toBe("Nenhum indicador encontrado.");
  });

  it("returns ready when request succeeds", () => {
    const state = buildAnalyticsAvailability({
      loading: false,
      error: null,
      hasContent: true,
    });

    expect(state.state).toBe("ready");
    expect(state.message).toBeNull();
  });

  it("sanitizes technical terms for product copy", () => {
    const input = "Resumo v2 via snapshot com registry e engine.";
    expect(sanitizeProductCopy(input)).toBe(
      "Resumo camada principal via resumo com cadastro e analise.",
    );
  });
});
