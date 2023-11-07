import {
  Database,
} from 'sqlite3';
  
const DB_NAME = '/data/recording/data-logger.v1.2.0.db';

export const connectDB = (
  callback?: () => void,
): Database => {
  console.log('[SQLITE] CONNECT DB');
  return new Database(DB_NAME, (err) => {
    if (err) {
      console.error('[SQLITE] DB connect error', err.message)
      throw err
    }else{
        callback?.();
    }
  });
};

export const listAllTables = (callback: (tables: string[]) => void): void => {
  const query = "SELECT name FROM sqlite_master WHERE type='table';";

  // Array to store the names of all tables
  const tables: string[] = [];

  db.each(query, (err: any, row: any) => {
    if (err) {
      console.error('[SQLITE] Error fetching tables', err.message);
      return;
    }
    tables.push(row.name);
  }, (err: any) => { // This callback gets executed when all rows have been retrieved
    if (err) {
      console.error('[SQLITE] Error completing the fetch operation', err.message);
      return;
    }
    callback(tables);
  });
};

// Helper function to promisify db.run
export const runAsync = (db: Database, sql: string, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};

// Helper function to promisify db.all for running SELECT queries
export const getAsync = (db: Database, sql: string, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

export const runSchemaAsync = (db: Database, sql: string) => {
  return new Promise((resolve, reject) => {
    db.run(sql, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};
    
export const db: Database = connectDB();
