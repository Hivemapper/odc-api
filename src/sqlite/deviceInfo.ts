import { generate } from 'shortid';
import { getAsync, runAsync } from './index';

export const ANONYMOUS_ID_FIELD = "anonymousId";

export const insertIntoDeviceInfo = async (
    key: string,
    value: string,
): Promise<void> => { 
    return new Promise(async (resolve) => {
        const insertSQL = `
          INSERT OR IGNORE INTO deviceInfo (
            key, value
          ) VALUES (?,?);
        `;
        try {
            await runAsync(insertSQL, [
                key,
                value,
            ]);
        } catch (error) {
            console.error('Error adding row to Device Info table:', error);
        }
        resolve();
    });
};

export const getAnonymousID = async (): Promise<string> => {
    try {
        const row: any = await getAsync(`SELECT value FROM deviceInfo WHERE key='${ANONYMOUS_ID_FIELD}';`);
        return row[0]?.value;
    } catch (error) {
        console.error('Error getting anonymous ID from Device Info table:', error);
        return '';
    }
};