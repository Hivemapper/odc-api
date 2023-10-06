import { IService } from '../types';
import { existsSync, mkdirSync, readdir } from 'fs';
import { USB_WRITE_PATH } from 'config';
import { getDateFromUnicodeTimestamp, sleep } from 'util/index';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
const MOVE_FILES_INTERVAL = 120000;
const DIRS_EXISTING = new Set<string>();
let num = 0;
const execAsync = promisify(exec);
const moveFilesOnUSB = async (sourceDir: string) => {
    // console.time('moveFilesOnUSB');
    const startTime = Date.now();
    readdir(sourceDir, async (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${err}`);
            return;
        }
        console.log(files.length);
        for (const file of files) {
            num++;
            if (file.endsWith('.jpg')) {
                const formattedDate = getDateFromUnicodeTimestamp(file).toISOString().split('T')[0];
                const moveFileToRightDir = `mv ${path.join(USB_WRITE_PATH, file)} ${path.join(USB_WRITE_PATH, formattedDate)} `;
                if (!DIRS_EXISTING.has(formattedDate)) {
                    try {
                        mkdirSync(path.join(USB_WRITE_PATH, formattedDate));
                        DIRS_EXISTING.add(formattedDate);
                    }
                    catch (err) {
                        console.error(`FROM MOVE IMAGES SERVICE :::::::: Error creating directory: ${err}`);
                    }
                }
                try{
                    await execAsync(moveFileToRightDir);
                    if(num === 1000 || num === 10000 || num === 20000){
                        console.log(`FROM MOVE IMAGES SERVICE :::::::: Time taken to move files: ${Date.now() - startTime} ms, num: ${num}`);
                    }
                }
                catch(err){
                    console.error(`FROM MOVE IMAGES SERVICE :::::::: Error moving Iamge: ${err}`);
                }
            }
        }
    });
    // console.timeEnd('moveFilesOnUSB');
};
const execute = async () => {
    try {
        //Check if USB is connected
        const usbConnected = existsSync(USB_WRITE_PATH);
        if (usbConnected) {
            await moveFilesOnUSB(USB_WRITE_PATH);
            await sleep(10000);
            execute();
        }
    } catch (error) {
        console.error('Error:', error);
    }
}
export const MoveImagesOnUSB: IService = {
    execute
};