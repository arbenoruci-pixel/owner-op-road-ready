import {captureLegacyDutyFixture} from './legacy-duty-tests.mjs';
const result=captureLegacyDutyFixture();
console.log(`PASS preserved ${result.files} exact pre-review sources for isolated duty installer tests`);
