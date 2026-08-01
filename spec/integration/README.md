# Engine integration tests

These suites exercise the public `RouteEngine` API together with the real
effects handler. Rendering, persistence, and ticker time are replaced only at
their external boundaries so journeys stay deterministic.

## Conventions

- Prefer multi-step player and host journeys over direct store-action tests.
- Send UI actions through the renderer event handler when the contract starts
  from rendered input.
- Assert both the user-visible result and important ownership state, such as
  the current pointer, active interaction, timer count, or persisted payload.
- Use ordinary `it` for supported behavior.
- Use `it.fails` only for a reproduced engine defect whose expectation states
  the desired contract. When the defect is fixed, remove `.fails`; Vitest will
  fail if an expected-failure test unexpectedly becomes healthy.
- Keep each expected-failure case narrow enough that setup errors cannot be
  mistaken for the intended regression.

Browser-level counterparts live in `vt/specs/robustness`. Healthy scenarios
have committed references. Known-broken scenarios intentionally have no
reference until their production fix renders the expected state.
