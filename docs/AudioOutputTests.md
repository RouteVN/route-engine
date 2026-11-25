# Audio Output Tests

Audio output tests check what a player hears. Each spec plays a story through
the real Route Engine, its effects handler, and the Route Graphics audio
graph in headless Chromium. They run on Route Graphics' deterministic offline
audio clock, so a run is exact and needs no speakers. The rendered audio is
then measured: the volume, pan, and playback rate of every sound at the
times the spec names. It is also compared byte for byte with a checked-in
reference recording.

Unit tests check the render state that Route Engine hands to Route Graphics.
They cannot tell whether Route Graphics plays that state the way the engine
assumes, or whether the result matches what the story authored. These tests
close that gap.

```sh
bun run test:audio                       # every spec in avt/specs
bun run test:audio bgm-duck-persists     # selected specs by file name
bun run test:audio:report                # also write avt/output/report.html
bun run test:audio:generate [name ...]   # rewrite references
```

CI runs every spec on each pull request.

## Writing a Spec

A spec in `avt/specs/<name>.yaml` declares:

- `durationMs`: how much audio to render.
- `tones`: one sine tone per sound file ID, with a whole-hertz `frequency`
  and an `amplitude`. Give sounds that play at once different frequencies,
  at least 200 Hz apart, so each one is measured separately. A tone outlasts
  the spec unless it sets `seconds`.
- `projectData`: an ordinary project. Sound and voice resources point at the
  tones by `fileId`.
- `runtime`: optional runtime values. Music and sound volume default to 100,
  so the authored mix is heard unscaled.
- `steps`: engine actions to dispatch at `at` milliseconds, for example
  `nextLine`. A `lineId` checks the line the step reached. Every step must
  run: one the clock never reaches, such as one in the render's last
  moment, fails the spec. Steps run on the next 128-frame render quantum,
  which is up to 2.67 ms after `at` unless `at` is a multiple of 8 ms.
- `expect`: what is heard.
  - `{ source, at, window, volume, pan, rate }` measures one window, by
    default 100 ms from `at`. `volume` is 0-100 of the source at full gain.
    During a linear fade, the window measures its center.
  - `left` and `right` check each channel's amplitude, 0-100 of the
    source amplitude, where the volume and pan formula below does not hold.
    For example, a Web Audio stereo panner on a channel of already panned
    sounds folds one side into the other.
  - `{ source, from, to, maxVolume }` checks that the sound is never louder
    than `maxVolume` anywhere in that range. This catches a sound that jumps
    to full volume before it settles. It measures 20 ms windows centred on
    every point of the range, so they reach 10 ms past each end and a spike
    at an end counts in full. End a range 10 ms before a change that may make
    the sound louder, and start one 10 to 20 ms after a change that makes it
    quieter. Cover every step and every line start with a range, so a spike
    when something changes cannot go unheard. Add `rate` to measure a sound
    played at another speed; the range must then hold that rate.
  - `tolerance` overrides the defaults of 0.75 volume points, 0.02 pan, and
    0.005 playback rate. `left` and `right` use the volume tolerance.

A spec with an unknown key, an unknown action, a range shorter than a
window, or an expectation that checks nothing fails to load. A warning or
error in the page's console fails the run: Route Graphics only warns when a
sound's asset is missing, and the spec would otherwise hear silence.

Derive every expected value from the authored numbers, and say how in a
comment, for example `# channel 75 x sound 40`. Never copy a value from a
run. A spec whose expectations come from the output only records what the
engine does, and a reference captured from a wrong mix keeps the bug.

Then record the spec's reference with `bun run test:audio:generate <name>`
and commit both files.

Video audio plays through the `<video>` element's own volume rather than
Web Audio, so it cannot be rendered offline. The
`robustness/video-volume-settings` VT covers it.

Show that a new spec catches the bug it covers. Run it against the code from
before the fix, and check that it fails:

```sh
RE_AVT_ENGINE_ROOT=../route-engine-before bun run test:audio <name>
```

## References

Each spec has two reference files in `avt/references`:

- `<name>.wav`: the rendered audio as 48 kHz stereo 16-bit PCM, stored in
  Git LFS. Run `git lfs pull` before running the tests locally; without it,
  every spec fails with `WAV differs from the reference`.
- `<name>.json`: the WAV's SHA-256, length, and signal level, the line each
  step reached, the Route Graphics events with their times, and every
  measurement rounded to four decimals.

Measurements are taken from the WAV's samples, so the JSON follows from the
WAV. Each spec renders twice, and both renders must be identical. A spec then
passes when its expectations hold, its WAV is byte-identical to the
reference, and its JSON matches. The expectations decide whether the audio
is right. The references catch any change at all, including one inside the
tolerances, such as a volume 0.4% lower or a fade that ends a frame later.

When a change alters the audio on purpose, run
`bun run test:audio:generate` with the affected spec names, or none for all
of them, and commit the new files. Generate writes only the references of
specs whose expectations pass, so a reference never records a wrong mix.
Review the JSON diff: its measurements show what a listener now hears
differently.

To listen, run `bun run test:audio:report` and open
`avt/output/report.html`. It plays each spec's audio with its waveform,
spectrogram, and expected and heard values. A failing spec also plays its
reference. A failing run writes the report as well, and CI uploads
`avt/output` as the `audio-output-<run>` artifact.

The references belong to this checkout's Route Engine and the
`route-graphics` version in `package.json`. A Route Graphics upgrade can
change them, so regenerate them in the same pull request and check that every
expectation still passes.

The references are recorded with Playwright's Chromium on x86-64 Linux, as
CI runs it. Rendering is exact there, run after run. Chromium on another
platform, such as macOS on Apple silicon, may compute some samples a bit
differently, and then its bytes differ from the references even though the
expectations pass. Record references on x86-64 Linux.

## Route Graphics Version

The tests use the `route-graphics` bundle from `node_modules`. To check
another version, such as the one an application ships with, point
`RE_AVT_ROUTE_GRAPHICS` at its `dist/RouteGraphics.js`:

```sh
RE_AVT_ROUTE_GRAPHICS=../app/node_modules/route-graphics/dist/RouteGraphics.js \
  bun run test:audio
```

`RE_AVT_ROUTE_GRAPHICS` and `RE_AVT_ENGINE_ROOT` skip the reference
comparison, because another Route Graphics or Route Engine renders different
bytes even when it plays the mix correctly. Only the expectations apply.
Generate refuses to run with either one set.

## Measurement

`avt/analyzeAudio.js` measures one tone at a time. Route Graphics plays a mono
sound through a gain node and a stereo panner. For gain `g` and pan `p`, the
two channels carry `amplitude * g * cos(x * PI / 2)` and
`amplitude * g * sin(x * PI / 2)`, where `x = (p + 1) / 2`. Volume and pan
therefore follow directly from the measured left and right amplitudes. The
playback rate is the tone's measured frequency over its authored frequency.
`spec/audioOutputAnalysis.test.js` checks these measurements on synthetic
signals.
