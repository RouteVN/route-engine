
## Context

it manages isolation

title screen has a title context

when start a game/read it starts a new context with reset variables

when reading a replay is a new context

contex can be ephemeral, where it wont update global variables, they are treated as runtime variables

context can be stacked, but there is always at least 1 context

## Mode

hardcoded to 2 modes: normal and history

left click and right click behavior are different for normal and history mode

## Line pointer

during history mode we need to keep track of current pointer, but also point at previous lines

we keep line pointer and mode separate for flexibility

## LayeredView

there is always a base view outside of layered view.

used to mange stacking views. like showing a menu page, showing dialogs. kind of modals

