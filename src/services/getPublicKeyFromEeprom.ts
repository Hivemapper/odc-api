import { exec } from 'child_process';
import { promisify } from 'util';
import { promises } from 'fs';
import { CAMERA_TYPE } from 'config';
import { CameraType } from 'types';

const awaitableExec = promisify(exec);
const publicKeyPath = '/tmp/publickey.pem';

export const getPublicKeyFromEeprom = async () => {
  if (CAMERA_TYPE !== CameraType.Hdc) {
    console.log(`Failed to fetch public key. Only HDC is supported.`);
    return '';
  }

  try {
    await awaitableExec(`/opt/dashcam/bin/eeprom_access.py -r -ba 0 -o 101 -l 155 -f ${publicKeyPath}`);
  } catch (error) {
    console.log(`Failed to fetch public key.`);
    return '';
  }

  let keyData = '';
  try {
    keyData = await promises.readFile(publicKeyPath, { encoding: "ascii" });
  } catch (error) {
    console.log(`Could not find the public key file.`);
  }
  return keyData;
}