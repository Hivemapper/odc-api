import { db } from '@utils/datastore';
import { ProcessingStat } from '@utils/instrumentation';
import { DEFAULT_ERROR_CALLBACK, TIMESTAMP_NOW, formatValue } from './common';
import { getLocalStorage, setLocalStorage } from '@utils/localStorage';

export const INSTRUMENTATION_TABLE = 'Instrumentation';

export const createInstrumentationTable = async (): Promise<void> => {
  const query = `CREATE TABLE IF NOT EXISTS ${INSTRUMENTATION_TABLE}(
        event TEXT,
        size INTEGER DEFAULT 0,
        start INTEGER DEFAULT (${TIMESTAMP_NOW}),
        end INTEGER DEFAULT (${TIMESTAMP_NOW}),
        createdAt INTEGER DEFAULT (${TIMESTAMP_NOW}),
        session TEXT DEFAULT '',
        freeDisk INTEGER DEFAULT 0,
        totalDisk INTEGER DEFAULT 0,
        usedMemory INTEGER DEFAULT 0,
        totalMemory INTEGER DEFAULT 0,
        batteryLevel REAL DEFAULT 0,
        charging TEXT DEFAULT '',
        lowPowerMode INTEGER DEFAULT 0,
        version TEXT DEFAULT '',
        deviceModel TEXT DEFAULT '',
        os TEXT DEFAULT '',
        firmware TEXT DEFAULT '',
        unit TEXT DEFAULT '',
        boardConfig TEXT DEFAULT '',
        serialNumber TEXT DEFAULT '',
        dashcamType TEXT DEFAULT '',
        value TEXT DEFAULT '',
        appState INTEGER DEFAULT 1,
        network INTEGER DEFAULT 1
      );`;

  // Preparing the table to be indexed by event and start fields to be unique
  // First, we need to selete any existing duplicates
  const deleteDuplicatesQuery = `
    DELETE FROM ${INSTRUMENTATION_TABLE}
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM ${INSTRUMENTATION_TABLE}
      GROUP BY event, start
    );`;

  // Then, we can create an index if not yet done
  const uniqueIndexQuery = `CREATE UNIQUE INDEX IF NOT EXISTS index_event_start ON ${INSTRUMENTATION_TABLE}(event, start);`;

  const wasInstrumentationIndexUpdated = await getLocalStorage(
    'wasInstrumentationIndexUpdated',
  );

  await new Promise(resolve => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        () => {
          if (!wasInstrumentationIndexUpdated) {
            tx.executeSql(
              deleteDuplicatesQuery,
              [],
              () => {
                tx.executeSql(
                  uniqueIndexQuery,
                  [],
                  (_, indexResult) => {
                    setLocalStorage('wasInstrumentationIndexUpdated', true);
                    resolve(indexResult);
                  },
                  (_, err) => DEFAULT_ERROR_CALLBACK(err, resolve),
                );
              },
              (_, err) => DEFAULT_ERROR_CALLBACK(err, resolve),
            );
          } else {
            tx.executeSql(
              uniqueIndexQuery,
              [],
              (_, indexResult) => {
                setLocalStorage('wasInstrumentationIndexUpdated', true);
                resolve(indexResult);
              },
              (_, err) => DEFAULT_ERROR_CALLBACK(err, resolve),
            );
          }
        },
        (_, err) => DEFAULT_ERROR_CALLBACK(err, resolve),
      );
    });
  });
};

export const existsInstrumentationRecord = async (
  event: string,
  start: number,
): Promise<boolean> => {
  const query = `SELECT rowid FROM ${INSTRUMENTATION_TABLE} WHERE event='${event}' AND start=${start};`;
  return new Promise<boolean>(resolve => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => resolve(!!result.rows.item(0)),
        () => {
          resolve(false);
        },
      );
    });
  });
};

export const addInstrumentationRecord = async (
  record: ProcessingStat,
): Promise<void> => {
  const fields = Object.keys(record).filter(
    key =>
      record[key as keyof ProcessingStat] !== null &&
      record[key as keyof ProcessingStat] !== undefined,
  );
  const query = `
        INSERT INTO ${INSTRUMENTATION_TABLE} 
        (${fields.join(', ')}) 
        VALUES (${fields
          .map(f =>
            formatValue(
              record[f as keyof ProcessingStat] as boolean | string | number,
            ),
          )
          .join(', ')});
      `;
  await new Promise<any>((resolve, reject) => {
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

export const getRecordsCount = async () => {
  const query = `SELECT
        COUNT(*) as total
        FROM ${INSTRUMENTATION_TABLE};
      `;
  return await new Promise<number>((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        query,
        [],
        (_, result) => {
          const { total } = result.rows.item(0) || {};
          resolve(total || 0);
        },
        (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
      );
    });
  });
};

export const getRecords = async (count: number): Promise<ProcessingStat[]> => {
  const query = `
    SELECT rowid, * FROM ${INSTRUMENTATION_TABLE}
    ORDER BY createdAt
    LIMIT ${count};
  `;

  const runQuery: (
    _query: string,
  ) => Promise<ProcessingStat[]> = async _query => {
    return await new Promise((resolve, reject) => {
      db.transaction(tx => {
        tx.executeSql(
          _query,
          [],
          (_, res) => {
            var result: ProcessingStat[] = [];

            for (let i = 0; i < res.rows.length; i++) {
              result.push(res.rows.item(i) as ProcessingStat);
            }
            console.log('[SQLITE] Length:', result.length);

            resolve(result);
          },
          (_, err) => DEFAULT_ERROR_CALLBACK(err, reject),
        );
      });
    });
  };
  let records: ProcessingStat[] = [];
  try {
    records = await runQuery(query);
  } catch (e: unknown) {
    console.log(`[SQLITE] Error fetching instrumentation: ${e}`);
  }
  console.log(`[SQLITE] ${records.length} Instrumentation records fetched`);

  return records;
};

export const deleteRecords = async (
  records: ProcessingStat[],
): Promise<void> => {
  const query = `
          DELETE FROM ${INSTRUMENTATION_TABLE}
          WHERE rowid IN (${records.map(r => r.rowid).join(', ')})
        `;

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
