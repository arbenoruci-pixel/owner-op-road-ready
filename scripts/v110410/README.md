# BOL column reader — v110.4.10 / Reader 0.3.35

A supplied phone review exposed reproducible parser defects: `BOL/Delivery No`
and `Cust. P.O. No` were omitted; adjacent shipping headings were interpreted as
party values; detached legal prose became a consignee; check-in/out text became
a carrier. Replaying the original observations locally verifies those failures.
Only synthetic names, references and source IDs are committed in the fixture.

The core now recognizes the explicit combined BOL label, stops before the SO/STO
reference, and accepts the dotted customer-PO abbreviation. Paired shipping
headings establish observation-local column bounds. Carrier blocks can offer the
name below the label. Party headings and the identified footer prose are excluded.

Below-label names remain proposals requiring original-page confirmation. Weak or
conflicting readings stay visible; INC/ING disagreement is not silently resolved.
No gross weight is inferred from product/pallet labels, and vehicle numbers are
not relabeled as trailer numbers. Automatic acceptance and filing remain disabled.

## Verification

- 374 core tests, including nine targeted regression groups.
- Synthetic Chromium/WebKit intake → source review → confirm both parties →
  export → save → reload, with cloud/account requests intercepted.
- The final production build and existing repository workflow gates.
- No physical-device or customer-account writes performed.

## Small physical-device check

After Tools → Check app update → Reload latest shows 110.4.10, open the original
BOL image through the phone/iPad file picker and read it again. Confirm that the
combined BOL and PO values appear; open each party proposal and check its source
highlight stays in the correct column. Confirm the two company names, inspect
the carrier spelling on the original, save to the intended load, then reopen the
saved document after a reload. The original image and confirmed names must remain.
An old exported review is a snapshot and does not update itself.
