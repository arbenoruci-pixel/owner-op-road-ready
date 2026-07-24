# Module locking checklist

Before marking a module stable:

- [ ] Public API is documented.
- [ ] Inputs and outputs are frozen.
- [ ] Module version is set.
- [ ] Normal document fixtures pass.
- [ ] Blurry, rotated and incomplete fixtures pass safely.
- [ ] Reader failure preserves the original file.
- [ ] Unrelated module state is unchanged.
- [ ] Boundary verification passes.
- [ ] Existing Logbook regression tests pass.
- [ ] Existing scanner regression tests pass when scanner was unchanged.
- [ ] Preview build passes.
- [ ] Stored output changes include migration instructions.
- [ ] PR lists the module paths allowed to change.

After locking, work on another module must not edit this module's internal files.
