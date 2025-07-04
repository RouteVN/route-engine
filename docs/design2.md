## Terminology

- **ProjectData**: `PD` The whole content of the Visual Novel
- **Presentation Actions**: `PA` Imperative actions that updates or modifies a PresentationState
- **Presentation State**: `PS` A representation of the presentation, without applying the system state
- **Render State**: `RS` The fully resolved render state, that fully represents what is visible in the screen.
- **System State**: `SS` The state of the system, including the game state, the presentation state, and the presentation template.
- **System Actions**: `SA` Instructions that can be sent to the system to change the state.

## Relations

- `SS = f(SS, SA, PD)`
- `PA = f(PD, SS)`
- `PS = constructPresentationState(PA)`
- `RS = constructRenderState(PS, SS)`
