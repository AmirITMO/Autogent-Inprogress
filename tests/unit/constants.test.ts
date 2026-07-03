import { describe, it, expect } from "vitest";
import { formatMoney } from "@/lib/constants";

function normalize(s: string) {
  return s.replace(/\s/g, " ");
}

describe("formatMoney", () => {
  it("formats a positive integer with the ruble sign", () => {
    expect(normalize(formatMoney(1000))).toBe("1 000 ₽");
  });

  it("formats zero", () => {
    expect(normalize(formatMoney(0))).toBe("0 ₽");
  });

  it("rounds fractional values (no kopeks shown)", () => {
    expect(normalize(formatMoney(1234.9))).toBe("1 235 ₽");
  });

  it("accepts numeric strings (Prisma Decimal serialized as string)", () => {
    expect(normalize(formatMoney("50000"))).toBe("50 000 ₽");
  });

  it("formats negative values with a minus sign and the ruble sign", () => {
    const result = normalize(formatMoney(-500));
    expect(result).toMatch(/^[-−]500 ₽$/);
  });
});
