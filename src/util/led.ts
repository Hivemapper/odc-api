import { LED_CONFIG_PATH } from '../config';
import { ILED } from '../types';
import { readFile, writeFile } from 'fs';

export const COLORS: { [key: string]: ILED } = {
  RED: {
    red: 25,
    blue: 0,
    green: 0,
    on: true,
  },
  YELLOW: {
    red: 25,
    blue: 0,
    green: 8,
    on: true,
  },
  GREEN: {
    red: 0,
    blue: 0,
    green: 25,
    on: true,
  },
  PURPLE: {
    red: 15,
    blue: 25,
    green: 5,
    on: true,
  },
  BLUE: {
    red: 0,
    blue: 25,
    green: 0,
    on: true,
  },
  PINK: {
    red: 25,
    blue: 25,
    green: 0,
    on: true,
  },
  WHITE: {
    red: 25,
    blue: 25,
    green: 25,
    on: true,
  },
};

let currentLEDs = {
  framesLED: 'RED',
  gpsLED: 'RED',
  appLED: 'RED',
};

export const getCurrentLEDs = () => {
  return currentLEDs;
};

const getColorByLed = (LED: ILED) => {
  let result = 'RED';
  Object.keys(COLORS).map((color: string) => {
    if (
      COLORS[color] &&
      LED &&
      COLORS[color].red === LED.red &&
      COLORS[color].blue === LED.blue &&
      COLORS[color].green === LED.green
    ) {
      result = color;
    }
  });
  return result;
};

export const updateLED = async (
  framesLED: ILED,
  gpsLED: ILED,
  appLED: ILED,
) => {
  try {
    let leds: ILED[] = [
      { index: 0, ...COLORS.RED },
      { index: 1, ...COLORS.RED },
      { index: 2, ...COLORS.RED },
    ];
    try {
      readFile(
        LED_CONFIG_PATH,
        {
          encoding: 'utf-8',
        },
        (err: NodeJS.ErrnoException | null, data: string) => {
          if (data && !err) {
            leds = JSON.parse(data).leds;
          }

          const frames = framesLED ? { ...leds[0], ...framesLED } : leds[0];
          const gps = gpsLED ? { ...leds[1], ...gpsLED } : leds[1];
          const app = appLED ? { ...leds[2], ...appLED } : leds[2];

          writeFile(
            LED_CONFIG_PATH,
            JSON.stringify({
              leds: [frames, gps, app],
            }),
            {
              encoding: 'utf-8',
            },
            () => {
              currentLEDs = {
                framesLED: getColorByLed(frames),
                gpsLED: getColorByLed(gps),
                appLED: getColorByLed(app),
              };
            },
          );
        },
      );
    } catch (e) {
      console.log('No file for LED. Creating one');
    }
  } catch (e) {
    console.log('Error updating LEDs', e);
  }
};
