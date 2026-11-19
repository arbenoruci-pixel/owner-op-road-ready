export const states = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' ');
export const documents = [
  ['cdl', 'CDL copy'],
  ['registration', 'Truck registration or IRP cab card'],
  ['experience', 'Driving references or work records'],
];
export const drivingRecords = [
  ['clear', 'No accidents, moving violations or suspensions'],
  ['review', 'I have something to discuss or I’m unsure'],
];
export const registrationStatuses = [['current', 'Current'], ['pending', 'Pending'], ['expired', 'Expired']];
export const steps = [
  ['License', 'Your license', 'Tell us about your U.S. Class A commercial driver’s license.'],
  ['Experience', 'Your driving experience', 'Include over-the-road and Amazon Relay work under any carrier’s authority.'],
  ['Contact', 'How can we reach you?', 'We’ll use these details to follow up on your pre-application.'],
  ['Truck', 'Your truck', 'Tell us about the tractor you plan to bring to Narta Express.'],
  ['Parking & coverage', 'Parking & coverage', 'Use the address where you normally park your tractor.'],
  ['Review', 'Review your pre-application', 'Check your answers, then submit them to Narta Express.'],
];

export function amazonDrivingMonths(values) {
  if (values.amazonDuration === 'year') return 12;
  if (values.amazonDuration === 'longer') return Number(values.amazonYears) * 12 + Number(values.amazonExtraMonths);

  return NaN;
}

function whole(value, min, max) {
  return /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

export function canEnterWorkHistory(v) {
  const months = amazonDrivingMonths(v);
  const qualifyingAmazon = v.amazonDuration === 'year' || (
    v.amazonDuration === 'longer' && whole(v.amazonYears, 1, 75) && whole(v.amazonExtraMonths, 0, 11) && months > 12 && months <= 900
  );
  return whole(v.otrYears, 3, 75) && qualifyingAmazon;
}

export function durationLabel(months) {
  const years = Math.floor(months / 12);
  const extra = months % 12;
  return [years > 0 && (years === 1 ? '1 year' : years + ' years'), extra > 0 && (extra === 1 ? '1 month' : extra + ' months')]
    .filter(Boolean).join(' ') || '0 months';
}

export function validateStep(step, v) {
  const errors = {};
  const clean = key => (v[key] || '').trim();
  const requireText = (key, message, min = 1) => {
    if (clean(key).length < min) errors[key] = message;
  };
  if (step === 0) {
    if (v.activeClassA !== 'yes') errors.activeClassA = v.activeClassA === 'no' ? 'You need an active U.S. Class A CDL to apply.' : 'Choose Yes or No for your Class A CDL.';
    if (!states.includes(v.cdlState)) errors.cdlState = 'Select the state that issued your CDL.';
    if (!whole(v.cdlYears, 3, 75)) errors.cdlYears = 'Enter your full years holding a Class A CDL. The minimum is 3 years.';
    if (!['yes', 'no'].includes(v.age24)) errors.age24 = 'Choose Yes or No for the insurance age question.';
  }
  if (step === 1) {
    if (!whole(v.otrYears, 3, 75)) errors.otrYears = 'Enter your recent, verifiable OTR experience in full years. The minimum is 3 years.';
    if (!['under', 'year', 'longer'].includes(v.amazonDuration)) errors.amazonDuration = 'Choose how long you have driven Amazon Relay loads.';
    if (v.amazonDuration === 'under') errors.amazonDuration = 'Narta requires a full year (12 months) of Amazon Relay driving. You can apply once you reach 12 months.';
    if (v.amazonDuration === 'longer') {
      if (!whole(v.amazonYears, 1, 75)) errors.amazonYears = 'Enter at least 1 full year. Use additional months for the remainder.';
      if (!whole(v.amazonExtraMonths, 0, 11)) errors.amazonExtraMonths = 'Select between 0 and 11 additional months.';
      if (amazonDrivingMonths(v) === 12 && v.amazonExtraMonths !== '') errors.amazonExtraMonths = 'For exactly 12 months, select “1 year” above. Otherwise, enter the additional months.';
      if (amazonDrivingMonths(v) > 900) errors.amazonYears = 'Enter up to 75 years of experience.';
    }
    if (canEnterWorkHistory(v)) {
      requireText('priorCarrier', 'Enter a carrier or business that can verify your OTR experience.');
      requireText('amazonCarrier', 'Enter the carrier or business you drove Amazon Relay loads for.');
      if (!drivingRecords.some(([key]) => key === v.drivingHistory)) errors.drivingHistory = 'Choose the answer that describes your driving record.';
    }
  }
  if (step === 2) {
    requireText('fullName', 'Enter your full name.', 2);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean('email'))) errors.email = 'Enter a valid email address, such as name@example.com.';
    const phone = clean('phone');
    if (!/^[+0-9.()\s-]+$/.test(phone) || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) errors.phone = 'Enter your phone number with 10 to 15 digits, including the area code.';
    const date = new Date(clean('startDate') + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.startDate || '') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== v.startDate) errors.startDate = 'Choose a valid available start date.';
  }
  if (step === 3) {
    const maxYear = new Date().getUTCFullYear() + 1;
    if (!whole(v.truckYear, 1900, maxYear)) errors.truckYear = 'Enter a tractor model year from 1900 to ' + maxYear + '.';
    requireText('truckMake', 'Enter the tractor manufacturer.');
    requireText('truckModel', 'Enter the tractor model.');
    if (clean('truckVin') && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(clean('truckVin'))) errors.truckVin = 'Enter 17 letters and numbers, excluding I, O and Q, or leave this blank.';
    if (!states.includes(v.registrationState)) errors.registrationState = 'Select the truck registration state.';
    if (!registrationStatuses.some(([key]) => key === v.registrationStatus)) errors.registrationStatus = 'Choose the current registration status.';
  }
  if (step === 4) {
    requireText('garagingAddress', 'Enter the parking street address, city, state and ZIP code.', 6);
    if (!['yes', 'no'].includes(v.physicalDamage)) errors.physicalDamage = 'Choose whether you want tractor physical damage coverage.';
    if (v.physicalDamage === 'yes' && !whole(v.declaredValue, 1, 10000000)) errors.declaredValue = 'Enter the tractor value in whole dollars, between $1 and $10,000,000.';
  }
  if (step === 5 && !v.consent) errors.consent = 'Confirm permission to submit your details and be contacted about this opportunity.';
  return errors;
}

export function applicationPayload(v) {
  return {
    website: v.website || '', fullName: v.fullName.trim(), email: v.email.trim(), phone: v.phone.trim(),
    age24: v.age24 === 'yes', activeClassA: v.activeClassA === 'yes', cdlState: v.cdlState,
    cdlMonths: Number(v.cdlYears) * 12, otrMonths: Number(v.otrYears) * 12, amazonMonths: amazonDrivingMonths(v),
    priorCarrier: v.priorCarrier.trim(), amazonCarrier: v.amazonCarrier.trim(), drivingHistory: v.drivingHistory,
    startDate: v.startDate, truckYear: Number(v.truckYear), truckMake: v.truckMake.trim(), truckModel: v.truckModel.trim(),
    truckVin: (v.truckVin || '').trim().toUpperCase(), registrationState: v.registrationState, registrationStatus: v.registrationStatus,
    garagingAddress: v.garagingAddress.trim(), trailer: (v.trailer || '').trim(), physicalDamage: v.physicalDamage === 'yes',
    declaredValue: v.physicalDamage === 'yes' ? Number(v.declaredValue) : null, documents: v.documents || [], consent: v.consent === true,
  };
}

export function reviewRows(v) {
  const yesNo = value => value === 'yes' ? 'Yes' : 'No';
  const ready = documents.filter(([key]) => v.documents.includes(key)).map(([, label]) => label);
  return [
    [['Active U.S. Class A CDL', yesNo(v.activeClassA)], ['Issuing state', v.cdlState], ['Time holding CDL', durationLabel(Number(v.cdlYears) * 12)], ['Age 24 or older', yesNo(v.age24)]],
    [['Verifiable OTR driving', durationLabel(Number(v.otrYears) * 12)], ['Amazon Relay driving', durationLabel(amazonDrivingMonths(v))], ['OTR carrier', v.priorCarrier], ['Amazon Relay carrier', v.amazonCarrier], ['Driving record', drivingRecords.find(([key]) => key === v.drivingHistory)?.[1]]],
    [['Full name', v.fullName], ['Email', v.email], ['Phone', v.phone], ['Available start date', new Date(v.startDate + 'T12:00:00Z').toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })]],
    [['Tractor', [v.truckYear, v.truckMake, v.truckModel].join(' ')], ['VIN', v.truckVin?.trim().toUpperCase() || 'Not provided'], ['Registration state', v.registrationState], ['Registration status', registrationStatuses.find(([key]) => key === v.registrationStatus)?.[1]], ['Trailer', v.trailer || 'Not provided']],
    [['Truck parking address', v.garagingAddress], ['Physical damage coverage', yesNo(v.physicalDamage)], ...(v.physicalDamage === 'yes' ? [['Declared tractor value', Number(v.declaredValue).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })]] : []), ['Documents available', ready.join(', ') || 'None selected']],
  ];
}
