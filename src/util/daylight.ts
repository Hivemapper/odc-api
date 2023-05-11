import Suncalc from 'suncalc';

enum SunlightLevel {
  SolarNoon = 'solarNoon',
  Nadir = 'nadir',
  Sunrise = 'sunrise',
  Sunset = 'sunset',
  SunriseEnd = 'sunriseEnd',
  SunsetStart = 'sunsetStart',
  Dawn = 'dawn',
  Dusk = 'dusk',
  NauticalDawn = 'nauticalDawn',
  NauticalDusk = 'nauticalDusk',
  NightEnd = 'nightEnd',
  Night = 'night',
  GoldenHourEnd = 'goldenHourEnd',
  GoldenHour = 'goldenHour',
}

export let startOfDaylight: string | null = null;
export const getStartOfDaylight = () => startOfDaylight;

export function setStartOfDaylight(lon: number, lat: number) {
  const date = new Date();
  if (date.getHours() <= 12) {
    date.setDate(date.getDate() + 1);
  }
  const times = Suncalc.getTimes(date, lat, lon);
  const hours = times[SunlightLevel.GoldenHourEnd].getHours();
  const mins = times[SunlightLevel.GoldenHourEnd].getMinutes();
  const daylight = `${hours}:${
    mins >= 10 ? String(mins) : '0' + String(mins)
  }AM`;

  startOfDaylight = daylight;
}

const MOST_LIKELY_LIGHT = new Set<SunlightLevel>([
  SunlightLevel.GoldenHourEnd,
  SunlightLevel.SolarNoon,
]);

export function getMinSunlightLevelForSpaceTime(
  date: Date,
  lon: number,
  lat: number,
) {
  const t = date.getTime();
  const { times, timeToLabel } = getSunlightLevelsForSpaceTime(date, lon, lat);
  const sortedTimes = Object.values(times as unknown as Date[]).sort(
    (a: Date, b: Date) => a.getTime() - b.getTime(),
  );

  for (let i = 0; i < sortedTimes.length - 1; i++) {
    if (t >= sortedTimes[i].getTime() && t < sortedTimes[i + 1].getTime()) {
      return timeToLabel[String(sortedTimes[i])];
    }
  }

  return timeToLabel[String(sortedTimes.pop())];
}

export function getSunlightLevelsForSpaceTime(
  date: Date,
  lon: number,
  lat: number,
) {
  const timeToLabel: Record<string, SunlightLevel> = {};
  const times = Suncalc.getTimes(date, lat, lon);

  timeToLabel[String(times.dawn)] = SunlightLevel.Dawn;
  timeToLabel[String(times.dusk)] = SunlightLevel.Dusk;
  timeToLabel[String(times.goldenHour)] = SunlightLevel.GoldenHour;
  timeToLabel[String(times.goldenHourEnd)] = SunlightLevel.GoldenHourEnd;
  timeToLabel[String(times.nadir)] = SunlightLevel.Nadir;
  timeToLabel[String(times.nauticalDawn)] = SunlightLevel.NauticalDawn;
  timeToLabel[String(times.nauticalDusk)] = SunlightLevel.NauticalDusk;
  timeToLabel[String(times.night)] = SunlightLevel.Night;
  timeToLabel[String(times.nightEnd)] = SunlightLevel.NightEnd;
  timeToLabel[String(times.solarNoon)] = SunlightLevel.SolarNoon;
  timeToLabel[String(times.sunrise)] = SunlightLevel.Sunrise;
  timeToLabel[String(times.sunriseEnd)] = SunlightLevel.SunriseEnd;
  timeToLabel[String(times.sunset)] = SunlightLevel.Sunset;
  timeToLabel[String(times.sunsetStart)] = SunlightLevel.SunsetStart;

  return { times, timeToLabel };
}

export function timeIsMostLikelyLight(date: Date, lon: number, lat: number) {
  const level = getMinSunlightLevelForSpaceTime(date, lon, lat);
  return MOST_LIKELY_LIGHT.has(level);
}
