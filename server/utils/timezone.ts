/**
 * Timezone utility for handling IST (Asia/Kolkata) conversions
 * This ensures attendance time validation works correctly regardless of server timezone
 */

const IST_OFFSET_HOURS = 5.5; // UTC+5:30

/**
 * Get current time in IST (Asia/Kolkata)
 * Works correctly even if server is running in UTC or any other timezone
 * @returns Date object representing current IST time
 */
export function getCurrentTimeIST(): Date {
  // Get current UTC time
  const now = new Date();

  // Convert to IST by adding offset
  const istTime = new Date(now.getTime() + IST_OFFSET_HOURS * 60 * 60 * 1000);

  return istTime;
}

/**
 * Get current time components in IST
 * @returns Object with hours and minutes in IST
 */
export function getISTTimeComponents(): { hours: number; minutes: number; seconds: number } {
  const istTime = getCurrentTimeIST();

  return {
    hours: istTime.getUTCHours(),
    minutes: istTime.getUTCMinutes(),
    seconds: istTime.getUTCSeconds(),
  };
}

/**
 * Get current time as HHMM format (e.g., 1430 for 2:30 PM)
 * @returns number in HHMM format
 */
export function getCurrentTimeHHMM(): number {
  const { hours, minutes } = getISTTimeComponents();
  return hours * 100 + minutes;
}

/**
 * Convert a Date object to IST
 * @param date - UTC date to convert
 * @returns Date object in IST
 */
export function convertToIST(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_HOURS * 60 * 60 * 1000);
}

/**
 * Check if current time (in IST) falls within allowed attendance windows
 * Allowed: 07:00-12:30 (Morning), 12:30-18:00 (Afternoon)
 * @returns { allowed: boolean; session: 'morning' | 'afternoon' | null }
 */
export function validateAttendanceTimeWindow(): {
  allowed: boolean;
  session: 'morning' | 'afternoon' | null;
  currentTime: string;
} {
  const currentTimeHHMM = getCurrentTimeHHMM();
  const { hours, minutes } = getISTTimeComponents();

  let session: 'morning' | 'afternoon' | null = null;

  // Morning: 07:00 to 12:30
  if (currentTimeHHMM >= 700 && currentTimeHHMM < 1230) {
    session = 'morning';
  }
  // Afternoon: 12:30 to 18:00 (6:00 PM)
  else if (currentTimeHHMM >= 1230 && currentTimeHHMM <= 1800) {
    session = 'afternoon';
  }

  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  return {
    allowed: session !== null,
    session,
    currentTime: timeString,
  };
}

/**
 * Get formatted IST time string for logging/debugging
 * @returns string in format "HH:MM:SS IST"
 */
export function getFormattedISTTime(): string {
  const { hours, minutes, seconds } = getISTTimeComponents();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} IST`;
}
