import { localDayKey } from '../shared/utils/date.js';

const today = localDayKey();

// Production builds must not seed any sample duty records.
// Demo/test data should be loaded only through an explicit demo flag/fixture.
export const initialEventsByDay = {};

export const initialCertifyStatus = {
  [today]: 'Active day / Not certified yet',
};
