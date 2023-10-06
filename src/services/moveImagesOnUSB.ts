import { IService } from '../types';
import { existsSync, mkdirSync, readdir, stat } from 'fs';
import { USB_WRITE_PATH } from 'config';
import { getDateFromUnicodeTimestamp} from 'util/index';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as path from 'path';

const DIRS_EXISTING = new Set<string>();
const execAsync = promisify(exec);

const moveFilesOnUSB = async (sourceDir: string) => {
    readdir(sourceDir, async (err, files) => {
        if (err) {
            console.error(`FROM MOVE IMAGES SERVICE :::::::: Error reading directory: ${err}`);
            return;
        }
        for (const file of files) {
            if (file.endsWith('.jpg')) {

                const formattedDate = getDateFromUnicodeTimestamp(file).toISOString().split('T')[0];
                const moveFileToRightDir = `mv ${path.join(USB_WRITE_PATH, file)} ${path.join(USB_WRITE_PATH, formattedDate)} `;

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
                try{
                    const isFileThereinDestination = existsSync(path.join( USB_WRITE_PATH, formattedDate, file));
                    const isFileThere = existsSync(path.join( USB_WRITE_PATH, file));

                    //Below check is needed to prevent multiple calls for moving same file
                    if (isFileThere && !isFileThereinDestination) {
                        await execAsync(moveFileToRightDir);
                    }
                }
                catch(err){
                    console.error(`FROM MOVE IMAGES SERVICE :::::::: Error moving Image: ${err}`);
                }
            }
        }
    });
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}

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
