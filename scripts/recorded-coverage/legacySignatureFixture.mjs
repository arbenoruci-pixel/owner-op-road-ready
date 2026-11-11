import {certificationContent, certificationFingerprintV1032} from '../../source/src/modules/logbook/certificationV110.js';

// Test data for reading attestations created by older releases, including
// incomplete records. Production creation now rejects these records; export
// must still preserve their original evidence. This helper is never installed.
export function historicalCertificationFixture(state,day,{now,driverName,signatureDataUrl}) {
  const old=state.signatureByDay?.[day]||{}, content=certificationContent(state,day);
  return {...old, signed:true, driverName, signedAt:now, signatureDataUrl,
    certifiedFingerprint:certificationFingerprintV1032(state,day), certifiedContent:content,
    certificationContext:old.certificationContext||{version:1, form:content.form, homeTimezone:content.homeTimezone}};
}
