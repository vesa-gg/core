import { formatInTimeZone, getTimezoneOffset } from "date-fns-tz";

export const setEasternHours = (
  date: Date,
  hour: number,
  min?: number,
  sec?: number,
  milli?: number,
): Date => {
  const hourFormat = String(hour).padStart(2, "0");
  const dateString = formatInTimeZone(
    date,
    "America/New_York",
    `yyyy-MM-dd ${hourFormat}:mm:ssxxxxx`,
  ).replace(" ", "T");
  const zonedDate = new Date(dateString);
  zonedDate.setMinutes(min ?? date.getMinutes());
  zonedDate.setSeconds(sec ?? date.getSeconds());
  zonedDate.setMilliseconds(milli ?? date.getMilliseconds());
  return zonedDate;
};

export const parseDate = (dateTimeString: string) => {
  const firstSpaceIndex = dateTimeString.indexOf(" ");
  let dateString = dateTimeString.substring(0, firstSpaceIndex);
  let timeString = dateTimeString.substring(firstSpaceIndex + 1);
  if (firstSpaceIndex === -1) {
    dateString = dateTimeString;
    timeString = "12 am";
  }
  const formattedDateString = getDateString(dateString);
  const formattedTimeString = getTimeString(timeString);
  const utcOffset = getUtcOffset(new Date(formattedDateString));
  const formattedDateTimeString = `${formattedDateString}T${formattedTimeString}${utcOffset}`;
  return new Date(formattedDateTimeString);
};

const getDateString = (monthDay: string): string => {
  const monthDaySplit = monthDay.split("/");
  const month = Number(monthDaySplit[0]);
  const day = Number(monthDaySplit[1]);
  let year = Number(monthDaySplit[2]);
  if (isNaN(month) || month <= 0 || month > 12) {
    throw Error("Month not valid");
  } else if (isNaN(day) || day <= 0 || day > 31) {
    throw Error("Day not valid");
  } else if (isNaN(year)) {
    const now = new Date();
    year = now.getFullYear();
    // if we're likely to be trying to set up a date in the next year use it.
    if (month === 1 && now.getMonth() >= 4) {
      year++;
    }
  } else if (year < 100) {
    // yes this is disgusting but also there's no way this code is being used in 75 years
    year += 2000;
  }
  const monthString = String(month).padStart(2, "0");
  const dayString = String(day).padStart(2, "0");
  return `${year}-${monthString}-${dayString}`;
};

const getTimeString = (time: string) => {
  let timeString = "";
  let ampmLabelString = "";
  let labelFlag = false;
  for (const char of time.toLowerCase()) {
    if (char === " " || char === "a" || char === "p") {
      labelFlag = true;
    }
    if (!labelFlag) {
      timeString += char;
    } else {
      ampmLabelString += char;
    }
  }
  const ampmLabel = ampmLabelString.trim().toLowerCase();

  const hourMinuteArray = timeString.split(":");
  const hour = Number(hourMinuteArray[0]);
  let minute = Number(hourMinuteArray[1]);
  if (isNaN(hour) || hour <= 0 || hour > 12) {
    throw Error("Hour not valid");
  } else if (isNaN(minute)) {
    minute = 0;
  } else if (minute < 0 || minute > 59) {
    throw Error("Minute not valid");
  }

  let hourString;
  if (ampmLabel === "am") {
    if (hour == 12) {
      hourString = "00";
    } else {
      hourString = hour.toString().padStart(2, "0");
    }
    // check if 12, else keep same
  } else if (ampmLabel === "pm") {
    if (hour == 12) {
      hourString = "12";
    } else {
      hourString = (hour + 12).toString().padStart(2, "0");
    }
  } else {
    throw Error("am/pm label not valid");
  }
  const minuteString = minute.toString().padStart(2, "0");
  return `${hourString}:${minuteString}:00`;
};

const getUtcOffset = (date: Date) => {
  const offsetHours =
    getTimezoneOffset("America/New_York", date) / 60 / 60 / 1000;
  return `-${String(Math.abs(offsetHours)).padStart(2, "0")}:00`;
};

export const formatDateForDiscord = (date: Date): string => {
  return `<t:${Math.floor(date.valueOf() / 1000)}:f>`;
};

export const formatTimeForDiscord = (date: Date): string => {
  return `<t:${Math.floor(date.valueOf() / 1000)}:t>`;
};
