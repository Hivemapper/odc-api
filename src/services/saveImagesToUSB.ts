import { IService } from '../types';
import { readdirSync, existsSync, mkdirSync, rename, statSync, readdir } from 'fs';
import { USB_WRITE_PATH } from 'config';

export const SaveImagesToUSB: IService = {
    execute: async () => {
        try {
            const directoryPath = USB_WRITE_PATH;
            const files = readdir(directoryPath, (err, files) => {
                files.forEach((file) => {
                    if (file.endsWith("jpg")) {

                        const formattedDate = new Date().toISOString().split('T')[0];

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
                if (err) {
                    console.log("Failed to read directory frm serviceeeeeee");
                }
            });
        } catch (error) {
            console.error('Error:', error);
        }
    },
    interval: 118888,
};
