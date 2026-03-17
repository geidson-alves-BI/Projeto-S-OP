import { describe, expect, it } from "vitest";
import { resolveReadinessModule } from "@/lib/upload-center";
import type { UploadCenterStatus } from "@/types/analytics";

const baseUploadCenter = {
  coverage_percent: 70,
  available_dataset_count: 2,
  total_dataset_count: 3,
  datasets: [],
  history: [],
  compatibility_summary: {
    average_confidence_score: 0,
    average_compatibility_score: 0,
    ready_datasets: 0,
    partial_datasets: 0,
    unavailable_datasets: 0,
    missing_datasets: [],
    largest_gaps: [],
    datasets: {},
    ai_readiness: {
      coverage_percent: 0,
      confidence_score: 0,
      quality_gaps: [],
      missing_datasets: [],
    },
  },
  readiness: {
    overall_status: "partial",
    overall_confidence: "medium",
    modules: [
      {
        key: "forecast",
        label: "Forecast",
        status: "available",
        confidence: "high",
        datasets: ["production", "sales_orders"],
        missing_datasets: [],
        description: "forecast module",
      },
      {
        key: "mts_mto",
        label: "MTS/MTO",
        status: "partial",
        confidence: "medium",
        datasets: ["production", "bom"],
        missing_datasets: ["BOM"],
        description: "mts module",
      },
    ],
  },
} as unknown as UploadCenterStatus;

describe("resolveReadinessModule overall", () => {
  it("uses overall_status and aggregates datasets/missing entries", () => {
    const result = resolveReadinessModule(baseUploadCenter, "overall");

    expect(result).not.toBeNull();
    expect(result?.key).toBe("overall");
    expect(result?.label).toBe("Base Operacional");
    expect(result?.status).toBe("partial");
    expect(result?.summary).toContain("Base Operacional parcial");
    expect(result?.datasets).toEqual(expect.arrayContaining(["production", "sales_orders", "bom"]));
    expect(result?.missing_datasets).toContain("BOM");
  });

  it("returns null when readiness payload is missing", () => {
    const result = resolveReadinessModule(null, "overall");
    expect(result).toBeNull();
  });
});
