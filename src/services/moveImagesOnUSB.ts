import { IService } from '../types';
import { existsSync, mkdirSync, readdir, stat } from 'fs';
import { USB_WRITE_PATH } from 'config';
import { getDateFromUnicodeTimestamp, sleep } from 'util/index';
import { exec } from 'child_process';
import * as path from 'path';

const DIRS_EXISTING = new Set<string>();
const WAIT_TIME_UNTIL_NEXT_EXECUTION = 20000;

//We are using our own execAsync function because the default promisify can not handle test -f command as we want it to.

const execAsync = (command: string): Promise<{ stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                // We are excluding "command failed" from logging because this is a known error the command fails because test -f does not find the file, we don't want to log this error
                if (!error?.message.includes('Command failed')) {
                    console.error(`Error executing command: ${error.message}`);
                }
                resolve({ stdout, stderr });
                return;
            }
            resolve({ stdout, stderr });
        });
    });

const moveFilesOnUSB = async (sourceDir: string) => {
    readdir(sourceDir, async (err, files) => {
        if (err) {
            console.error(`FROM MOVE IMAGES SERVICE :::::::: Error reading directory: ${err}`);
            return;
        }
        for (const file of files) {
            if (file.endsWith('.jpg')) {

                const sourceFile = path.join(USB_WRITE_PATH, file);
                const formattedDate = getDateFromUnicodeTimestamp(file).toISOString().split('T')[0];
                const destionationForFile = path.join(USB_WRITE_PATH, formattedDate, file);
                const dest = path.join(USB_WRITE_PATH, formattedDate);

                // Below "test -f" checks are needed to prevent multiple calls for moving same file when the service is called multiple times
                const moveFileToRightDir = `test -f ${sourceFile} && ! test -f ${destionationForFile} && mv ${sourceFile} ${dest} `;

                if (!DIRS_EXISTING.has(formattedDate)) {
                    try {
                        mkdirSync(path.join(USB_WRITE_PATH, formattedDate));
                        DIRS_EXISTING.add(formattedDate);
                    }
                    catch (err) {
                        if (!((err as NodeJS.ErrnoException).code === 'EEXIST')) {
                            console.error(`FROM MOVE IMAGES SERVICE :::::::: Error creating directory: ${err}`);
                        }
                    }
                }
                const result = await execAsync(moveFileToRightDir);
            }
        }
    });
};

const execute = async () => {
    try {
        //Check if USB is connected
        const usbConnected = existsSync(USB_WRITE_PATH);
        if (usbConnected) {
            await moveFilesOnUSB(USB_WRITE_PATH);
            await sleep(WAIT_TIME_UNTIL_NEXT_EXECUTION);
            execute();
        }
    } catch (error) {
        console.error('Error:', error);
    }
}
export const MoveImagesOnUSB: IService = {
    execute
};
