import { INSTRUMENTATION_TABLE, createInstrumentationTable } from './instrumentation';
import { DATASTORE_VERSION } from './index';
import { deleteTable } from './common';
import { Instrumentation } from 'util/instrumentation';

export const migrate = async () => {
  console.log(`[SQLITE] Migrating to ${DATASTORE_VERSION}`);
  try {
    await deleteTable(INSTRUMENTATION_TABLE);
    await createInstrumentationTable();
    console.log('[SQLITE] Migration completed');

    Instrumentation.add({
      event: 'DashcamMigrated',
      message: JSON.stringify({
        version: DATASTORE_VERSION,
      }),
    });
  } catch (err) {
    console.log('[SQLITE] Error migrating', err);
  }
};
