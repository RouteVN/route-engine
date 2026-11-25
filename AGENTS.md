# Route Engine agent notes

- Do not hand UI or interaction fixes back for manual testing until you have reproduced the issue locally and passed the relevant automated checks yourself.
- For click, reveal, animation, or timing bugs, validate both:
  - targeted unit/system coverage for the state transition
  - VT or browser-level reproduction for the actual visual/input path
- If a test page is exercising more than one problem at once, simplify it first so it isolates the intended behavior before claiming the bug is fixed.

## Version bumps

A pull request that changes the published package bumps `version` in
`package.json` itself, in the same pull request. Do not leave the bump for a
later release pull request. Each release is a `v<version>` tag on the merge
commit of the pull request that set that version, and the tag publishes to npm
(`.github/workflows/publish-npm.yaml`). A change merged without a bump only
ships when a later pull request bumps for its own change.

- `fix`: patch, for example 1.55.0 → 1.55.1
- `feat`: minor, for example 1.55.0 → 1.56.0
- Breaking change (`!` after the type, or a `BREAKING CHANGE` footer): minor,
  as #392 did (1.54.0 → 1.55.0). Do not bump the major version unless the
  maintainer asks for it.
- Any other change to the package, such as a refactor or a runtime
  dependency update: patch

The npm package contains `dist/` and `README.md`. Bump for changes to `src/`,
the build, or runtime `dependencies`. Do not bump for changes that only touch
tests, VT specs and references, docs, CI, or `devDependencies`.

Bump from the version on `main`. If `main` gets a new version before your pull
request merges, rebase and bump again from it. `package.json` is the only file
that holds the version.

Before opening a pull request, and again before asking for review, check that
`package.json` has a higher version than `main` when the change ships in the
package, and say the new version in the description.
