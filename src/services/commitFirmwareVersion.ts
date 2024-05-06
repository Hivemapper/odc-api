import { exec } from 'child_process';
import { CAMERA_TYPE } from 'config';
import { stdout } from 'process';
import { CameraType, IService } from 'types';
import { execAsync } from 'util/index';
import { Instrumentation } from 'util/instrumentation';

export const CommitFirmwareVersion: IService = {
  execute: async () => {
    try {
      if (CAMERA_TYPE === CameraType.HdcS) {
        // Check if firmware update is available
        const upgradeAvailable = await checkFirmwareUpgrade();
        if (upgradeAvailable) {
          // Run health checks
          const healthChecksPassed = await runHealthChecks();
          if (healthChecksPassed) {
            // If all health checks passed, commit firmware update
            exec('mender --commit', (err, stdout, stderr) => {
                if (err) {
                    Instrumentation.add({
                        event: 'DashcamCommitFailed',
                        message: JSON.stringify({ error: err, stdout, stderr })
                    });
                } else {
                    Instrumentation.add({
                        event: 'DashcamCommitSuccess',
                        message: JSON.stringify({ stdout })
                    });
                }
            });
          }
        }
      }
    } catch (error: unknown) {
      console.error(error);
    }
  },
  delay: 20000,
};

async function checkFirmwareUpgrade() {
  return new Promise((resolve, reject) => {
    exec('fw_printenv -n upgrade_available', (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim() === '1');
      }
    });
  });
}

async function runHealthChecks() {
  try {
    // Check network interface operstate
    const operstate = await execAsync('cat /sys/class/net/wlp1s0/operstate');
    if (operstate.trim() !== 'up') return false;

    const servicesToCheck = [
      'hostapd',
      'dnsmasq',
      'hivemapper-data-logger',
      'odc-api',
    ];
    for (const service of servicesToCheck) {
      // Check if service is active
      await execAsync(`systemctl is-active --quiet ${service}`);
    }

    return true; // All checks passed
  } catch (error) {
    return false; // Health check failed
  }
}
