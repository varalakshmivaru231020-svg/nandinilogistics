/**
 * Cost-sheet generation.
 *
 * "Base price, floor rise, PLC, parking, amenities, GST and registration —
 * generated, not typed." Every line comes from a charge head in the master and
 * a rate from the active price list, so two executives quoting the same unit on
 * the same day cannot produce different numbers.
 *
 * Pure and free of Prisma so it can be asserted directly — see
 * `pnpm verify:costsheet`.
 */

export interface UnitFacts {
  unitNumber: string;
  floorNumber: number;
  superBuiltUpArea: number;
  carpetArea: number;
  parkingSlots: number;
  /** Set when the unit carries a preferential location tag. */
  plcTag: string | null;
}

export interface PriceFacts {
  /** Rate per sq.ft on super built-up area. */
  baseRate: number;
  /** Per sq.ft, per floor above the first. */
  floorRise: number;
  /** Flat amount, applied only when the unit has a PLC tag. */
  plcAmount: number;
}

export interface ChargeHeadFacts {
  id: string;
  code: string;
  name: string;
  /** FIXED | PER_SQFT | PERCENT_OF_BASE */
  calcType: string;
  defaultValue: number;
  taxPct: number;
  sortOrder: number;
  isMandatory: boolean;
}

export interface CostSheetLine {
  chargeHeadId: string;
  code: string;
  label: string;
  quantity: number;
  rate: number;
  amount: number;
  taxPct: number;
  taxAmount: number;
  sortOrder: number;
}

export interface CostSheetTotals {
  lines: CostSheetLine[];
  /** Base price alone — the figure percentage charges are computed against. */
  basePrice: number;
  subTotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/** Charge-head codes the engine knows how to derive rather than take at face value. */
const BASE = "BASE";
const FLOOR_RISE = "FLOORRISE";
const PLC = "PLC";
const PARKING = "PARKING";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildCostSheet(
  unit: UnitFacts,
  price: PriceFacts,
  chargeHeads: ChargeHeadFacts[],
  options: { discountAmount?: number; includeOptional?: string[] } = {},
): CostSheetTotals {
  const discountAmount = Math.max(0, options.discountAmount ?? 0);
  const include = new Set(options.includeOptional ?? []);

  const basePrice = round(unit.superBuiltUpArea * price.baseRate);
  const lines: CostSheetLine[] = [];

  for (const head of [...chargeHeads].sort((a, b) => a.sortOrder - b.sortOrder)) {
    // Optional heads appear only when explicitly chosen.
    if (!head.isMandatory && !include.has(head.code) && !isDerived(head.code)) continue;

    let quantity = 1;
    let rate = head.defaultValue;
    let amount = 0;

    switch (head.code) {
      case BASE:
        quantity = unit.superBuiltUpArea;
        rate = price.baseRate;
        amount = basePrice;
        break;

      case FLOOR_RISE: {
        // Charged per sq.ft for every floor above the first.
        const floorsAbove = Math.max(0, unit.floorNumber - 1);
        if (floorsAbove === 0 || price.floorRise <= 0) continue;
        quantity = unit.superBuiltUpArea;
        rate = round(price.floorRise * floorsAbove);
        amount = round(quantity * rate);
        break;
      }

      case PLC:
        // Only a unit carrying a PLC tag attracts the charge.
        if (!unit.plcTag) continue;
        quantity = 1;
        rate = price.plcAmount > 0 ? price.plcAmount : head.defaultValue;
        amount = rate;
        break;

      case PARKING:
        if (unit.parkingSlots <= 0) continue;
        quantity = unit.parkingSlots;
        rate = head.defaultValue;
        amount = round(quantity * rate);
        break;

      default:
        switch (head.calcType) {
          case "PER_SQFT":
            quantity = unit.superBuiltUpArea;
            rate = head.defaultValue;
            amount = round(quantity * rate);
            break;
          case "PERCENT_OF_BASE":
            quantity = 1;
            rate = head.defaultValue;
            amount = round((basePrice * head.defaultValue) / 100);
            break;
          default:
            quantity = 1;
            rate = head.defaultValue;
            amount = head.defaultValue;
        }
    }

    if (amount <= 0) continue;

    const taxAmount = round((amount * head.taxPct) / 100);
    lines.push({
      chargeHeadId: head.id,
      code: head.code,
      label: head.name,
      quantity,
      rate,
      amount,
      taxPct: head.taxPct,
      taxAmount,
      sortOrder: head.sortOrder,
    });
  }

  const subTotal = round(lines.reduce((s, l) => s + l.amount, 0));
  const taxAmount = round(lines.reduce((s, l) => s + l.taxAmount, 0));
  const totalAmount = round(subTotal + taxAmount - discountAmount);

  return { lines, basePrice, subTotal, discountAmount, taxAmount, totalAmount };
}

/** Heads whose applicability the engine decides from the unit, not from a checkbox. */
function isDerived(code: string): boolean {
  return code === BASE || code === FLOOR_RISE || code === PLC || code === PARKING;
}

/* -------------------------------------------------------------------------- */
/* Payment milestones                                                         */
/* -------------------------------------------------------------------------- */

export interface MilestoneTemplate {
  label: string;
  /** Percentage of the booking total. */
  percentage: number;
  /** Days from booking when the demand becomes due. */
  dueInDays: number;
}

/**
 * The standard construction-linked plan. Percentages must total 100 — the
 * builder asserts it rather than trusting the caller.
 */
export const DEFAULT_MILESTONES: MilestoneTemplate[] = [
  { label: "On booking", percentage: 10, dueInDays: 0 },
  { label: "On agreement", percentage: 15, dueInDays: 30 },
  { label: "On completion of foundation", percentage: 15, dueInDays: 90 },
  { label: "On completion of 5th floor slab", percentage: 15, dueInDays: 180 },
  { label: "On completion of 10th floor slab", percentage: 15, dueInDays: 270 },
  { label: "On completion of brickwork & plastering", percentage: 10, dueInDays: 360 },
  { label: "On completion of flooring & fittings", percentage: 10, dueInDays: 450 },
  { label: "On possession", percentage: 10, dueInDays: 540 },
];

export interface BuiltMilestone {
  milestone: string;
  percentage: number;
  amount: number;
  dueDate: Date;
  sortOrder: number;
}

export function buildPaymentSchedule(
  totalAmount: number,
  bookingDate: Date,
  template: MilestoneTemplate[] = DEFAULT_MILESTONES,
): BuiltMilestone[] {
  const sum = template.reduce((s, m) => s + m.percentage, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error(`Payment milestones total ${sum}%, not 100%.`);
  }

  const built = template.map((m, i) => ({
    milestone: m.label,
    percentage: m.percentage,
    amount: round((totalAmount * m.percentage) / 100),
    dueDate: new Date(bookingDate.getTime() + m.dueInDays * 86_400_000),
    sortOrder: i,
  }));

  // Rounding must never lose or invent rupees — the last milestone absorbs the drift.
  const allocated = built.reduce((s, m) => s + m.amount, 0);
  const drift = round(totalAmount - allocated);
  if (drift !== 0 && built.length > 0) {
    built[built.length - 1].amount = round(built[built.length - 1].amount + drift);
  }

  return built;
}
