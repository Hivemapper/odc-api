import { IService } from '../types';
import { DiskUsage } from 'types/motionModel';
import { readdirSync, existsSync, mkdirSync, rename } from 'fs';
import { USB_WRITE_PATH } from 'config';
import { getDateFromUnicodeTimestamp } from '../util';

const diskUsage: DiskUsage = {};

export const getDiskUsage = () => {
    return diskUsage;
};

export const SaveImagesToUSB: IService = {
    execute: async () => {
        try {
            const directoryPath = USB_WRITE_PATH;
            const files = readdirSync(directoryPath);

            files.forEach((file) => {
                if (file.endsWith("jpg")) {
                    const dateFromFileName = getDateFromUnicodeTimestamp(file);
                    const year = dateFromFileName.getFullYear();
                    const month = String(dateFromFileName.getMonth() + 1).padStart(2, "0"); // Add 1 because months are 0-based
                    const day = String(dateFromFileName.getDate()).padStart(2, "0");

                    // Create the formatted date string
                    const formattedDate = `${year}-${month}-${day}`;
                    const directoryPath = `${USB_WRITE_PATH}/${formattedDate}`;

                    //Check if directory exists for the day on which image was collected
                    if (!existsSync(directoryPath)) {
                        try {
                            mkdirSync(directoryPath, { recursive: true });
                        } catch (error) {
                            console.error(`FROM SAVEIMAGESTOUSB SERVICE :::: Error creating directory '${directoryPath}':`, error);
                        }
                    }

                    //Move the JPG image file to the right directory
                    const sourcePath = `${USB_WRITE_PATH}/${file}`;
                    const destinationPath = `${USB_WRITE_PATH}/${formattedDate}/${file}`;
                    rename(sourcePath, destinationPath, (err) => {
                        if (err) {
                            console.error(`FROM SAVEIMAGESTOUSB SERVICE :::: Error moving file: ${err}`);
                        }
                    });
                }
            });
        } catch (error) {
            console.error('Error:', error);
        }
    },
    interval: 118888,
};
