import { getAsync } from './index';

export const getLastYaw = async (): Promise<number> => {
    try {
        const query = `SELECT * FROM yaw_data ORDER BY rowid DESC LIMIT 1`;
        const lastYarRow: any = await getAsync(query);
        return lastYarRow.length ? Number(lastYarRow[0].yaw) : 0;
    } catch (error) {
        console.error('Error fetching last yaw:', error);
        return 0;
    }
}