const { execSync } = require('child_process');
const { existsSync, rmSync, appendFileSync } = require('fs');
const HEALTH_MARKER_PATH = '/mnt/data/healthy.txt';
const LOG_FILE_PATH = '/mnt/data/camera-node.log';
const LOOP_MS = 5000;

const sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const writeErrorLog = () => {
    try {
        appendFileSync(LOG_FILE_PATH, `[INFO]|${Date.now()}|Unknown|Unknown|DashcamApiRepaired|0|0|0|\r\n`);
    } catch (e) {
        console.log(e);
    }
}

const main = async () => {
    // Let camera-node service to fully load
    await sleep(10000);

    while (true) {
        let output = '';
        try {
            output = execSync('systemctl is-active camera-node', {
                encoding: 'utf-8'
            });
        } catch (e) {
            console.log('failed checking if camera-node is active');
        }
        if (output.indexOf('active') === 0) {
            if (existsSync(HEALTH_MARKER_PATH)) {
                // console.log('healthy');
                rmSync(HEALTH_MARKER_PATH);
            } else {
                await sleep(LOOP_MS);
                if (existsSync(HEALTH_MARKER_PATH)) {
                    // console.log('healthy');
                    rmSync(HEALTH_MARKER_PATH);
                } else {
                    try {
                        writeErrorLog();
                        execSync('systemctl restart camera-node');
                    } catch (e) {
                        console.log('failed restarting camera-node');
                    }
                    await sleep(LOOP_MS);
                }
            }
        } else {
            try {
                writeErrorLog();
                execSync('systemctl restart camera-node');
            } catch (e) {
                console.log('failed restarting camera-node');
            }
            await sleep(LOOP_MS);
        }
        await sleep(LOOP_MS);
    }
}

main();