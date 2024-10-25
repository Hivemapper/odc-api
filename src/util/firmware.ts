import { spawn, execSync } from 'child_process';
import { CAMERA_TYPE } from 'config';
import { CameraType } from 'types';

const HDC_ROOT = '/mnt/data/';
const HDCS_ROOT = '/data/';
const MENDER_PATH = HDCS_ROOT + 'core.mender';
const FIP_PATH = HDCS_ROOT + 'fip.bin';

export const SUCCESS_MESSAGE = 'Spawn ran successfully';

class FirmwareManager {
  private hdcRoot: string;
  private hdcsRoot: string;
  private menderPath: string;
  private fipPath: string;
  private message: string;
  private errorSeen: boolean;

  constructor() {
    this.hdcRoot = HDC_ROOT;
    this.hdcsRoot = HDCS_ROOT;
    this.menderPath = MENDER_PATH;
    this.fipPath = FIP_PATH;
    this.message = 'started';
    this.errorSeen = false;
  }

  public getMessage(): string {
    return this.message;
  }

  public getErrorSeen(): boolean {
    return this.errorSeen;
  }

  private runSpawn(cmd: string) {
    const child = spawn(cmd, { shell: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
      this.message = data.toString();
      this.errorSeen = false;
    });

    child.on('error', error => {
      this.message = 'Error: ' + error.toString();
      this.errorSeen = true;
      console.error(`Error in Spawn process for cmd ${cmd}: ${error}`);
    });

    child.on('close', (code, err) => {
      if (code !== 0) {
        const errMsg =
          'Closing spawn with code ' +
          code?.toString() +
          ' Error: ' +
          err?.toString();
        console.error(
          `Closing spawn due to error for cmd ${cmd}: ${err?.toString()}`,
        );
        this.message = errMsg;
        this.errorSeen = true;
      } else {
        this.message = SUCCESS_MESSAGE;
        this.errorSeen = false;
      }
    });
  }

  public installFirmware(firmwareFile: string) {
    try {
      if (CAMERA_TYPE === CameraType.Hdc) {
        try {
          execSync(`test -f ${this.hdcRoot + firmwareFile}`, {
            encoding: 'utf-8',
          });
        } catch (error: unknown) {
          console.log('Rauc file is not present');
        }
        this.runSpawn(`rauc install ${this.hdcRoot + firmwareFile}`);
        return { output: 'received install command' };
      } else if (
        CAMERA_TYPE === CameraType.HdcS ||
        CAMERA_TYPE === CameraType.Bee
      ) {
        try {
          execSync(`test -f ${this.menderPath} && rm ${this.menderPath}`, {
            encoding: 'utf-8',
          });
        } catch (error: unknown) {
          this.message = 'Mender file is not present';
          this.errorSeen = true;
          console.log('Mender file is not present');
        }
        try {
          execSync(`test -f ${this.fipPath} && rm ${this.fipPath}`, {
            encoding: 'utf-8',
          });
        } catch (error: unknown) {
          this.message = 'Fip file is not present';
          this.errorSeen = true;
          console.log('Fip file is not present');
        }
        this.runSpawn(
          `tar -xzf /data/${firmwareFile} -C /data && os-update --install ${this.menderPath} && movisoc-fwu -a ${this.fipPath}`,
        );
        return { output: 'received install command' };
      }
    } catch (error: any) {
      this.message = 'Error: ' + error.toString();
      this.errorSeen = true;
      return { error };
    }
  }
}

export default FirmwareManager;
