# Route Engine agent notes

- Do not hand UI or interaction fixes back for manual testing until you have reproduced the issue locally and passed the relevant automated checks yourself.
- For click, reveal, animation, or timing bugs, validate both:
  - targeted unit/system coverage for the state transition
  - VT or browser-level reproduction for the actual visual/input path
- If a test page is exercising more than one problem at once, simplify it first so it isolates the intended behavior before claiming the bug is fixed.
