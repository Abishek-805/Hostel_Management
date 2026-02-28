export enum MealSlot {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER',
}

const MEAL_SLOT_HOURS: Record<MealSlot, { hour: number; minute: number }> = {
  [MealSlot.BREAKFAST]: { hour: 7, minute: 0 },
  [MealSlot.LUNCH]: { hour: 12, minute: 30 },
  [MealSlot.DINNER]: { hour: 19, minute: 30 },
};

export function getMealSlotDateTime(date: Date, slot: MealSlot): Date {
  const slotTime = MEAL_SLOT_HOURS[slot];
  const slotDate = new Date(date);
  slotDate.setHours(slotTime.hour, slotTime.minute, 0, 0);
  return slotDate;
}

export function startOfLocalDay(input: Date): Date {
  const value = new Date(input);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfLocalDay(input: Date): Date {
  const value = new Date(input);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function addDays(input: Date, days: number): Date {
  const value = new Date(input);
  value.setDate(value.getDate() + days);
  return value;
}

export function formatLocalIsoDate(input: Date): string {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, '0');
  const day = `${input.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
