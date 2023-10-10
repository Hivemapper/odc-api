import {
    Database,
  } from 'sqlite3';
  import { createInstrumentationTable } from './instrumentation';
  import { migrate } from './migration';
  
  const DB_NAME = 'db.sqlite';
  
  export const DATASTORE_VERSION = '5.0';
  
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
  
  export const turnForeignKeyOn = async () => {
    db.run('PRAGMA foreign_keys = ON;');
  };
  
  const initializeDatastore = async () => {
    console.log('[SQLITE] Initializing Datastore');
    await turnForeignKeyOn();
    // const version = (await getDatastoreVersion()) || 0;
    // console.log('Current user datastore version:', version);
    // if (version < Number(DATASTORE_VERSION)) {
    //   // Before doing such an important step, let's double-check that version is outdated for sure
    //   const cachedDatastoreVersion = await getLocalStorage('datastoreVersion');
    //   if (
    //     !cachedDatastoreVersion ||
    //     Number(cachedDatastoreVersion) < Number(DATASTORE_VERSION)
    //   ) {
    //     await migrate();
    //   }
    // } else {
    //   await setLocalStorage('datastoreVersion', DATASTORE_VERSION);
    // }
    // const versionLater = (await getDatastoreVersion()) || 0;
    // console.log('Current user datastore version after migration:', versionLater);
    await createInstrumentationTable();
    console.log('[SQLITE] Tables Initialized');
  };
  
  export const db: Database = connectDB(initializeDatastore);
  