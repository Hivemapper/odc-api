import { IService } from '../types';
import { existsSync, mkdirSync, readdir, stat } from 'fs';
import { USB_WRITE_PATH } from 'config';
import { getDateFromUnicodeTimestamp, sleep} from 'util/index';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as path from 'path';

const DIRS_EXISTING = new Set<string>();
const execAsync = promisify(exec);
const TIME_UNTIL_NEXT_EXECUTION = 20000;

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
                const destionationForFile =  path.join(USB_WRITE_PATH, formattedDate, file);
                const dest = path.join(USB_WRITE_PATH, formattedDate);

                 // Below "test -f" checks are needed to prevent multiple calls for moving same file when the service is called multiple times
                const moveFileToRightDir = `test -f ${sourceFile} && ! test -f ${destionationForFile} && mv ${sourceFile} ${dest} `;

                if (!DIRS_EXISTING.has(formattedDate)) {
                    try {
                        mkdirSync(path.join(USB_WRITE_PATH, formattedDate));
                        DIRS_EXISTING.add(formattedDate);
                    }
                    catch (err) {
                        if (! ((err as NodeJS.ErrnoException).code === 'EEXIST')) {
                            console.error(`FROM MOVE IMAGES SERVICE :::::::: Error creating directory: ${err}`);
                          }
                    }
                }
                const result = await execAsync(moveFileToRightDir);
                if(result.stderr) {
                    console.error(`FROM MOVE IMAGES SERVICE :::::::: Error moving file: ${result.stderr}`);
                }
                
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
            await sleep(20000);
            execute();
        }
    } catch (error) {
        console.error('Error:', error);
    }
}
export const MoveImagesOnUSB: IService = {
    execute
};
