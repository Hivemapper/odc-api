import { LED_CONFIG_PATH } from 'config';
import { ILED } from '../types';
import { readFileSync, writeFileSync } from 'fs';

export const COLORS = {
  RED: {
    red: 255,
    blue: 0,
    green: 0,
    on: true,
  },
  YELLOW: {
    red: 255,
    blue: 0,
    green: 255,
    on: true,
  },
  GREEN: {
    red: 0,
    blue: 0,
    green: 255,
    on: true,
  },
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
      const ledPayload = readFileSync(LED_CONFIG_PATH, {
        encoding: 'utf-8',
      });
      leds = JSON.parse(ledPayload).leds;
    } catch (e) {
      console.log('No file for LED. Creating one');
    }

    const frames = framesLED ? { ...leds[2], ...framesLED } : leds[2];
    const gps = gpsLED ? { ...leds[1], ...gpsLED } : leds[1];
    const app = appLED ? { ...leds[0], ...appLED } : leds[0];

    writeFileSync(
      LED_CONFIG_PATH,
      JSON.stringify({
        leds: [frames, gps, app],
      }),
      {
        encoding: 'utf-8',
      },
    );
  } catch (e) {
    console.log('Error updating LEDs', e);
  }
};
