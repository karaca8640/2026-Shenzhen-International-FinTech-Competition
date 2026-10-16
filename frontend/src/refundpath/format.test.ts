import { describe, expect, it } from "vitest";
import { amount, dateLabel, statusTone } from "./format";

describe("student-facing amounts and provisional dates", () => {
  it("does not present a missing estimate as zero", () => {
    expect(amount(null)).toBe("—"); expect(amount(undefined)).toBe("—");
  });
  it("shows cents and the AUD amount consistently", () => {
    expect(amount("12000.01")).toBe("$12,000.01"); expect(amount("0.00")).toBe("$0.00");
  });
  it("keeps date-only deadlines stable across timezone and DST boundaries", () => {
    expect(dateLabel("2026-10-04")).toBe("4 Oct 2026");
    expect(dateLabel("2024-02-29")).toBe("29 Feb 2024");
  });
  it("does not invent a date for an unconfirmed legal trigger", () => {
    expect(dateLabel(null)).toBe("Not confirmed");
  });
  it("marks overdue and review states visibly", () => {
    expect(statusTone("Overdue")).toBe("warning");
    expect(statusTone("Manual review required")).toBe("warning");
    expect(statusTone("Awaiting student approval")).toBe("attention");
  });
});
