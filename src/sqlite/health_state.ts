import { db, getAsync, runAsync } from 'sqlite';

export const getServiceStatus = async (serviceName: string) => {
  const selectSQL = `SELECT status FROM health_state WHERE service_name = ?`;

  try {
    const row = (await getAsync(db, selectSQL, [serviceName])) as {
      status: string;
    }[];
    return row && row.length ? row[0].status : undefined;
  } catch (error) {
    console.error(
      'Error during retrieving status from health state table:',
      error,
    );
    return undefined;
  }
};

export const setServiceStatus = async (serviceName: string, status: string) => {
  const insertOrReplaceSQL = `
      INSERT OR REPLACE INTO health_state (service_name, status) 
      VALUES (?, ?)`;

  try {
    await runAsync(db, insertOrReplaceSQL, [serviceName, status]);
  } catch (error) {
    console.error('Error during setting status in health state table:', error);
    throw error;
  }
};
