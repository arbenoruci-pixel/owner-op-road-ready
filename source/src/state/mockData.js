import { nowMin } from '../shared/utils/time.js';
import { addDays, localDayKey } from '../shared/utils/date.js';

const n = nowMin();
const today = localDayKey();
const yesterday = addDays(today, -1);
const twoDaysAgo = addDays(today, -2);

export const initialEventsByDay = {
  [today]: [],
  [yesterday]: [
    { id:'yesterday_sb', status:'SB', startMin:0, endMin:572, city:'Chicago', state:'IL', description:'', note:'Sleeper', source:'manual' },
    { id:'yesterday_on1', status:'ON', startMin:572, endMin:630, city:'Waukesha', state:'WI', description:'', note:'Pre-Trip Inspection', source:'manual' },
    { id:'yesterday_d1', status:'D', startMin:631, endMin:768, city:'Mukwonago', state:'WI', description:'4.1 mi SW of Mukwonago, WI', note:'Driving', source:'manual' },
    { id:'yesterday_on2', status:'ON', startMin:769, endMin:784, city:'Elgin', state:'IL', description:'', note:'Drop-off', source:'manual' },
    { id:'yesterday_off', status:'OFF', startMin:785, endMin:1439, city:'Chicago', state:'IL', description:'', note:'going to parking', source:'manual' },
  ],
  [twoDaysAgo]: [
    { id:'twodays_off1', status:'OFF', startMin:0, endMin:480, city:'Chicago', state:'IL', description:'', note:'Off Duty', source:'manual' },
    { id:'twodays_d1', status:'D', startMin:480, endMin:901, city:'Gary', state:'IN', description:'', note:'Driving', source:'manual' },
    { id:'twodays_off2', status:'OFF', startMin:901, endMin:1439, city:'Chicago', state:'IL', description:'', note:'Off Duty', source:'manual' },
  ],
};

export const initialCertifyStatus = {
  [today]: 'Active day / Not certified yet',
  [yesterday]: 'Needs signature',
  [twoDaysAgo]: 'Certified',
};
