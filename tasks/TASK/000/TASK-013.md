---
title: support variables
status: todo
priority: medium
---

# Description

we have some variables related code implemented but is mostly broken, we need to do it properly.

## Persistence

there are 3 types of variebles persistence:

context:
- reset on every game/story start
- needs to be saved in save data
- example:
  - flags on which actions user performed
  - in game point systems


global-device
- stored per device, saved globally in device
- will persist over restarts
- not saved in save data
- examples:
  - audio volume
  - text display speed

global-account
- persists across game/story starts
- unlike global-device, should be tied to the user in cloud systems.
- example:
  - show extra section only when user has completed a specifc route or entire story


## Types

boolean, string, number/integer, object, array, enum, etc...

## Actions

need action to edit/mutate variable values. currently I think we have only basic increment


