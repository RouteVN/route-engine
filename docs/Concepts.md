
## Context

it manages isolated environmnts

for example, in the title screen you are in the title screen. 
when you press new game, it has to create a new context, because in this new game, all game variables needs to be reset.

so, the title screen will be a context. the game play whether gong there from start game or load game, will be another context.

Replays will also have their own context. In replay mode, we don't want to update again some global variables.

All context do share global variables.

## Configuration

Each context has its own config.
Configuration is informatino about how the system should behave.
This will be the main place to insert custom behavior that otherwise cannot be done.
It is expected to get messy and grow indefinitively.
We will use this untill we figure something need to be so customizable that we need to extractout of config

## Mode

This is for hardcoded logic. That is too specific to be configured.

Currently we have 2 modes: normal and history

left click and right click behavior are different for normal and history mode

## Line pointer

during history mode we need to keep track of current pointer, but also point at previous lines

we keep line pointer and mode separate for flexibility

## Layered View

there is always a base view outside of layered view.

used to mange stacking views. like showing a menu page, showing dialogs. kind of modals

