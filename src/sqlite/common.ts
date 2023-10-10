import { db } from './index';
import { SQLError } from 'react-native-sqlite-storage';

export const TIMESTAMP_NOW = "ROUND((julianday('now') - 2440587.5)*86400000)";

export const DEFAULT_ERROR_CALLBACK = (
  err: SQLError,
  reject: (reason?: any) => void,
) => {
  console.log('[SQLITE] Error', err);
  reject(err);
};

export const formatValue = (value: string | number | boolean): string => {
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  return `${value}`;
};

export const deleteTable = async (tableName: string): Promise<void> => {
  const query = `DROP TABLE IF EXISTS ${tableName}`;
  await new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => resolve(result),
        (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
      );
    });
  });
};

export const inspectTable = async (tableName: string): Promise<void> => {
  const query = `SELECT
  COUNT(*) as total
  FROM ${tableName}`;
  await new Promise<any>((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => {
          console.log(
            `[SQLITE] ${tableName} total rows`,
            result.rows.item(0)?.total,
          );
          resolve(result);
        },
        (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
      );
    });
  });
};

export const getRecord = async (
  condition: string,
  table: string,
  limit?: number,
) => {
  const query = `
    SELECT rowid, * FROM ${table}
    WHERE ${condition}
    ${limit ? 'LIMIT ' + limit : ''};
  `;
  // console.log('[SQLITE] query', query);
  const all: any[] = [];
  await new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => {
          for (let i = 0; i < result.rows.length; i++) {
            all.push(result.rows.item(i));
          }
          resolve(result);
        },
        (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
      );
    });
  });
  return all;
};

export const updateRecord = async (
  condition: string,
  properties: Record<string, any>,
  table: string,
): Promise<number> => {
  const statements = [];
  for (const [key, value] of Object.entries(properties)) {
    statements.push(`${key} = ${formatValue(value)}`);
  }
  const query = `
    UPDATE ${table}
    SET ${statements.join(', ')}
    WHERE ${condition};
  `;
  const selectQuery = `
    SELECT * FROM ${table}
    WHERE ${condition};
  `;
  let output = 0;
  await new Promise<number>((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(query, []);
      tx.executeSql(
        selectQuery,
        [],
        (_, result) => {
          output = result.rows.length;
          console.log(`[SQLITE] Updated ${output} rows`);
          resolve(output);
        },
        (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
      );
    });
  });
  return output;
};

export const deleteRecord = async (
  condition: string,
  table: string,
): Promise<void> => {
  const query = `
    DELETE FROM ${table}
    WHERE ${condition}
  `;
  // console.log('[SQLITE]', query);
  await new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => resolve(result),
        (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
      );
    });
  });
};

export const getDataFromTable = async (table: string) => {
  const query = `SELECT rowid, *    
    FROM ${table};
  `;
  return await new Promise<any[]>((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => {
          const data = [];
          for (let i = 0; i < result.rows.length; i++) {
            data.push(result.rows.item(i));
          }
          resolve(data);
        },
        (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
      );
    });
  });
};

export const insertRecord = async (
  properties: Record<string, any>,
  table: string,
  onConflict: 'IGNORE' | 'REPLACE' = 'IGNORE',
) => {
  const fields = Object.keys(properties);
  const values = Object.values(properties);
  const query = `INSERT OR ${onConflict} INTO ${table} 
    (${fields.join(', ')}) 
    VALUES (${values.map(v => formatValue(v)).join(', ')});
  `;
  return await new Promise<any>((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => {
          resolve(result);
        },
        (_, err) => {
          console.log(query, err);
          DEFAULT_ERROR_CALLBACK(err, reject);
        },
      );
    });
  });
};
