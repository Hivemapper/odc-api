import { CAMERA_TYPE, LED_CONFIG_PATH } from 'config';
import { CameraType, ILED } from '../types';
import { readFile, writeFile } from 'fs';
import { jsonrepair } from 'jsonrepair';
import { exec } from 'child_process';

export const COLORS: { [key: string]: ILED } = {
  RED: {
    red: 1,
    blue: 2,
    green: 1,
    on: true,
  },
  YELLOW: {
    red: 18,
    blue: 2,
    green: 12,
    on: true,
  },
  GREEN: {
    red: 3,
    blue: 25,
    green: 3,
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
    red: 20,
    blue: 20,
    green: 20,
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
    if (CAMERA_TYPE === CameraType.HdcS) {
      if (framesLED === COLORS.YELLOW) {
        updateLEDHdcS(255, 255, 0);
      } else if (gpsLED === COLORS.RED || framesLED === COLORS.RED) {
        updateLEDHdcS(255, 255, 255);
      } else {
        updateLEDHdcS(0, 0, 255);
      }
    } else {
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