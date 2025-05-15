## Terminology

* **Presentation Instruction**: A declarative instruction that updates or modifies a PresentationTemplate
* **Presentation Template**: A representation of the presentation, without applying the system state
* **Presentation State**: The fully resolved, concrete presentation state, with all placeholders replaced by actual game data and variables applied. Anything that is shown in the screen is derived 100% from the Presentation State.
* **System State**: The state of the system, including the game state, the presentation state, and the presentation template.
* **System Instructions**: Instructions that can be sent to the system to change the state.

## Math Notation

$PI = \{i_1, i_2, \ldots, i_n\}$ - Set of presentation instructions

$PT$ - Presentation template

$PT_0$ - Initial empty template

$SS$ - System state

$PS$ - Presentation state

$PI$ = $f(SS)$ - List of all instructions come from pointers and original raw data

<!-- $SI = {i_1, i_2, \dots, i_m}$: Sequence of system instructions

$updateSystemState: (SS, i) \mapsto SS'$

$generateInstructions: (SS, i) \mapsto PI_\Delta$: Optional instruction updates from a system instruction -->


Functions:
$\delta : (PT, i) \mapsto PT$ - Apply single instruction

$applyPresentationInstructions(PT_0, PI) = foldl(\delta, PT_0, PI)$ = $PT$ - Apply multiple instructions

$combineSystemState : (PT, SS) \mapsto PS$ - Resolve template with system state

Complete pipeline:
$PS = combineSystemState(applyPresentationInstructions(PT_0, PI), SS)$

## Implementation Details

This system uses a two-phase rendering approach:

1. **Build Phase**: Instructions are applied sequentially to construct a presentation template
   - Templates contain placeholders rather than concrete values
   - Each instruction makes targeted modifications to the template

2. **Resolution Phase**: The template is combined with the current system state
   - All placeholders are resolved with actual data
   - Conditional elements are evaluated
   - The result is the final renderable presentation

This separation allows for:
- Efficient updates (only changed instructions need reprocessing)
- Clear separation between presentation structure and data
- Predictable rendering pipeline

Functions and Operations

1. Single Instruction Application: $\delta(PT, i) \mapsto PT'$
2. Multiple Instructions: $applyInstructions(PT_0, PI) = foldl(\delta, PT_0, PI)$
3. State Resolution: $combineSystemState(PT, SS) \mapsto PS$

Formal Computation

$PS = combineSystemState(applyInstructions(PT_0, PI), SS)$

This captures: 
1) Build template by applying all instructions to an empty template
2) Combine with system state to produce final presentation
