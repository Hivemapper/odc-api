import {
  Database,
} from 'sqlite3';
  
const DB_NAME = 'data-logger.v1.1.1.db';

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
    
export const db: Database = connectDB();
