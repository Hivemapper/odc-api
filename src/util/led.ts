import { CAMERA_TYPE, LED_CONFIG_PATH } from 'config';
import { CameraType, ILED } from '../types';
import { readFile, writeFile } from 'fs';
import { jsonrepair } from 'jsonrepair';
import { exec } from 'child_process';

export const COLORS: { [key: string]: ILED } = {
  RED: {
    red: 25,
    green: 0,
    blue: 0,
    on: true,
  },
  DIM: {
    red: 1,
    green: 1,
    blue: 2,
    on: true,
  },
  YELLOW: {
    red: 18,
    green: 12,
    blue: 2,
    on: true,
  },
  GREEN: {
    red: 3,
    green: 3,
    blue: 25,
    on: true,
  },
  PURPLE: {
    red: 15,
    green: 5,
    blue: 25,
    on: true,
  },
  BLUE: {
    red: 0,
    green: 0,
    blue: 25,
    on: true,
  },
  PINK: {
    red: 8,
    green: 1,
    blue: 1,
    on: true,
  },
  WHITE: {
    red: 20,
    green: 20,
    blue: 20,
    on: true,
  },
  BLACK: {
    red: 0,
    green: 0,
    blue: 0,
    on: false,
  },
};

let currentLEDs = {
  framesLED: 'DIM',
  gpsLED: 'DIM',
  appLED: 'DIM',
};

export const getCurrentLEDs = () => {
  return currentLEDs;
};

const getColorByLed = (LED: ILED) => {
  let result = 'DIM';
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
    if (CAMERA_TYPE === CameraType.HdcS || CAMERA_TYPE === CameraType.Bee) {
      if (framesLED === COLORS.YELLOW) {
        updateLEDHdcS(255, 255, 0);
      } else if (framesLED === COLORS.RED || framesLED === COLORS.PINK) {
        updateLEDHdcS(255, 0, 0);
      } else if (gpsLED === COLORS.DIM || framesLED === COLORS.DIM) {
        updateLEDHdcS(255, 255, 255);
      } else if (framesLED === COLORS.BLACK) {
        updateLEDHdcS(0, 0, 0);
      } else {
        updateLEDHdcS(0, 0, 255);
      }
    } else {
      let leds: ILED[] = [
        { index: 0, ...COLORS.DIM },
        { index: 1, ...COLORS.DIM },
        { index: 2, ...COLORS.DIM },
      ];
      try {
        readFile(
          LED_CONFIG_PATH,
          {
            encoding: 'utf-8',
          },
          (err: NodeJS.ErrnoException | null, data: string) => {
            if (data && !err) {
              try {
                leds = JSON.parse(jsonrepair(data)).leds;
              } catch (e: unknown) {
                //
              }
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
    }
  } catch (e) {
    console.log('Error updating LEDs', e);
  }
};

export const updateLEDHdcS = (red: number, green: number, blue: number) => {
  if (red >= 0 && red <= 255 && green >= 0 && green <= 255 && blue >= 0 && blue <= 255) {
    exec(`echo ${red} > /sys/class/leds/led_2_red/brightness; echo ${green} > /sys/class/leds/led_2_green/brightness; echo ${blue} > /sys/class/leds/led_2_blue/brightness;`);
  }
}