import { spawn, execSync } from 'child_process';
import { CAMERA_TYPE } from 'config';

import { Router } from 'express';
import { CameraType } from 'types';
const router = Router();

const HDC_ROOT = '/mnt/data/'
const HDCS_ROOT = '/data/'
const MENDER_PATH = HDCS_ROOT + 'core.mender'
const FIP_PATH = HDCS_ROOT + 'fip.bin'

let message = '';

const runSpawn = (cmd: string) => {
    const child = spawn(cmd, {
        shell: true
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
        message = data.toString();
    });

    child.on('error', (error) => {
        message = "Error" + error.toString();
        console.error(`Error in Spawn process for cmd ${cmd} stderr: ${error}`);
    });

    child.on('close', (code, err) => {
        if (code !== 0) {
            message = "Closing spawn with code" + code?.toString() + "Error:" + err?.toString();
            console.error(`Closing spawn due to error for cmd ${cmd} stderr: ${err?.toString()}`);
        } else {
            message = "Spawn ran successfully"
        }
    });
};

router.get('/install', async (req, res) => {

    const firmwareFile = req?.body?.fileName || '';

    try {
        if (CAMERA_TYPE === CameraType.Hdc) {
            try {
                execSync(`test -f ${HDC_ROOT + firmwareFile}`, {
                    encoding: 'utf-8',
                });
            } catch (error: unknown) {
                console.log("Rauc file is not present")
            }
            runSpawn(`rauc install ${HDC_ROOT + firmwareFile} && reboot`)
            res.json({ output: 'received install command' });

        } else if (CAMERA_TYPE === CameraType.HdcS) {
            try {
                execSync(`test -f ${MENDER_PATH} && rm ${MENDER_PATH}`, {
                    encoding: 'utf-8',
                });
                console.log("done 1");
            } catch (error: unknown) {
                console.log("Mender file is not present")
            }
            try {
                execSync(`test -f ${FIP_PATH}  && rm ${FIP_PATH}`, {
                    encoding: 'utf-8',
                });
                console.log("done 2")
            } catch (error: unknown) {
                console.log("Fip file is not present")
            }
            runSpawn(`tar -xzf /data/${firmwareFile} -C /data && os-update --install ${MENDER_PATH} && movisoc-fwu -a ${FIP_PATH} && reboot`)
            res.json({ output: 'received install command' });
        }
    } catch (error: unknown) {
        res.json({ error });
    }
});

router.get('/progress', async (req, res) => {
    res.json({ message });
});

export default router;