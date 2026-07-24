# Document pipeline

Each imported document follows one stable contract:

1. preserve the original file;
2. optionally produce a normalized scanner file;
3. choose exactly one document kind;
4. invoke exactly one registered reader;
5. store the original, normalized file and versioned reader result in Records Vault.

Readers receive a document input and return data. They do not save files or change application state.

## Example

A Rate Confirmation import uses:

```text
scanner-core -> document-pipeline -> rate-confirmation-reader -> records-vault
```

Improving rate extraction changes only `document-readers/rate-confirmation/**`. The POD, BOL, Scanner, Logbook and Vault implementations remain unchanged.

## Adding a new reader

Create:

```text
source/src/modules/document-readers/<kind>/public-api.js
```

The reader must expose `name`, `version` and `read(input, engine)`. Add tests using only that document type. Do not edit existing readers unless their own behavior is being changed.
