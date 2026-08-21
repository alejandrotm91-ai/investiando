/**
 * Utility to check if the US stock market is currently open.
 * US Stock Market (NYSE/NASDAQ) hours:
 * - Monday to Friday
 * - 9:30 AM to 4:00 PM Eastern Time (EST/EDT)
 */
export function getMarketStatus(): { isOpen: boolean; currentNYTime: string } {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", // "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  let weekday = "";
  let hourStr = "";
  let minuteStr = "";

  for (const part of parts) {
    if (part.type === "weekday") weekday = part.value;
    if (part.type === "hour") hourStr = part.value;
    if (part.type === "minute") minuteStr = part.value;
  }

  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  // Market is open Monday to Friday
  const isWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  
  // Market hours: 9:30 to 16:00 (4:00 PM)
  const currentMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 570
  const closeMinutes = 16 * 60;    // 960

  const isOpen = isWeekday && currentMinutes >= openMinutes && currentMinutes < closeMinutes;

  const nyTimeStr = `${weekday} ${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')} EST/EDT`;

  return { isOpen, currentNYTime: nyTimeStr };
}
