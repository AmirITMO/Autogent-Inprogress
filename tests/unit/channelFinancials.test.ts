import { describe, it, expect } from "vitest";
import { computeChannelFinancials } from "@/lib/channelFinancials";

describe("computeChannelFinancials", () => {
  it("считает выручку/затраты/ROI/CAC по фикстуре, посчитанной вручную", () => {
    const leads = [
      { stage: "PAID" as const, lost: false, prepay: 1000, postpay: 500 }, // paid, revenue 1500
      { stage: "SUPPORT" as const, lost: false, prepay: 2000, postpay: 0 }, // paid (после PAID), revenue 2000
      { stage: "SCHEDULED_CALL" as const, lost: false, prepay: 0, postpay: 0 }, // не дошёл до PAID
      { stage: "CALL_DONE" as const, lost: true, prepay: 5000, postpay: 0 }, // отказ — не учитывается в revenue/paid
    ];
    const spends = [{ amount: 1000 }, { amount: 400 }]; // итого 1400

    const result = computeChannelFinancials(leads, spends);

    expect(result.totalLeads).toBe(4);
    expect(result.lostLeads).toBe(1);
    expect(result.paidLeads).toBe(2);
    expect(result.conversionRate).toBeCloseTo(50, 5); // 2 из 4
    expect(result.revenue).toBe(3500); // 1500 + 2000, отказ и недоехавший не считаются
    expect(result.spend).toBe(1400);
    expect(result.roi).toBeCloseTo(((3500 - 1400) / 1400) * 100, 5);
    expect(result.cac).toBeCloseTo(1400 / 2, 5);
    expect(result.avgCheck).toBeCloseTo(3500 / 2, 5);
  });

  it("не делит на ноль — пустые лиды и нулевые затраты дают null/0, не NaN/Infinity", () => {
    const result = computeChannelFinancials([], []);

    expect(result.totalLeads).toBe(0);
    expect(result.conversionRate).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.spend).toBe(0);
    expect(result.roi).toBeNull();
    expect(result.cac).toBeNull();
    expect(result.avgCheck).toBeNull();
  });

  it("принимает Decimal-подобные значения (объект с toString), не только number", () => {
    const decimalLike = { toString: () => "250.50" };
    const result = computeChannelFinancials(
      [{ stage: "PAID" as const, lost: false, prepay: decimalLike, postpay: 0 }],
      [{ amount: decimalLike }]
    );

    expect(result.revenue).toBeCloseTo(250.5, 5);
    expect(result.spend).toBeCloseTo(250.5, 5);
  });

  it("расходы без единого оплаченного лида не считаются как CAC/avgCheck (остаются null)", () => {
    const result = computeChannelFinancials(
      [{ stage: "SCHEDULED_CALL" as const, lost: false, prepay: 0, postpay: 0 }],
      [{ amount: 500 }]
    );

    expect(result.paidLeads).toBe(0);
    expect(result.cac).toBeNull();
    expect(result.avgCheck).toBeNull();
    expect(result.roi).toBeCloseTo(((0 - 500) / 500) * 100, 5);
  });
});
