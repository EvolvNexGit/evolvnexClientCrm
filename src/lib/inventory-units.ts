import type { InventoryUnit } from "@/lib/inventory-types";

export type UnitFamily = "weight" | "volume" | "count";

/** Single source of truth for inventory/recipe units. Factor is relative to the family base (g, ml, unit). */
const UNIT_INFO: Record<InventoryUnit, { family: UnitFamily; factor: number }> = {
  g: { family: "weight", factor: 1 },
  kg: { family: "weight", factor: 1000 },
  ml: { family: "volume", factor: 1 },
  l: { family: "volume", factor: 1000 },
  unit: { family: "count", factor: 1 },
};

export const INVENTORY_UNITS = Object.keys(UNIT_INFO) as InventoryUnit[];

export function getUnitFamily(unit: InventoryUnit): UnitFamily {
  return UNIT_INFO[unit].family;
}

export function areUnitsCompatible(left: InventoryUnit, right: InventoryUnit): boolean {
  return getUnitFamily(left) === getUnitFamily(right);
}

/** Units that can be converted to/from the given unit (including itself). */
export function getCompatibleUnits(unit: InventoryUnit): InventoryUnit[] {
  return INVENTORY_UNITS.filter((candidate) => areUnitsCompatible(candidate, unit));
}

/** Converts between units of the same family; returns null for incompatible units. */
export function convertQuantity(value: number, from: InventoryUnit, to: InventoryUnit): number | null {
  if (!areUnitsCompatible(from, to)) {
    return null;
  }

  return (value * UNIT_INFO[from].factor) / UNIT_INFO[to].factor;
}

/** Same as convertQuantity but rounded for display/storage (avoids 0.1 + 0.2 style noise). */
export function convertQuantityRounded(
  value: number,
  from: InventoryUnit,
  to: InventoryUnit,
  decimals = 4,
): number | null {
  const converted = convertQuantity(value, from, to);
  if (converted === null) {
    return null;
  }

  const scale = 10 ** decimals;
  return Math.round(converted * scale) / scale;
}

export function describeUnitMismatch(ingredientName: string, recipeUnit: InventoryUnit, stockUnit: InventoryUnit) {
  return `${ingredientName}: recipe unit (${recipeUnit}) can't be used with stock unit (${stockUnit}). Use ${getCompatibleUnits(stockUnit).join(" / ")}.`;
}
