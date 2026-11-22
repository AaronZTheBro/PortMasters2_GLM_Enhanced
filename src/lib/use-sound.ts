"use client";

// useSound: a tiny Web Audio API based sound effects hook. Synthesizes
// short blips, chords, and arpeggios on demand from primitive oscillators,
// so the app ships zero audio assets and every sound is generated in the
// browser at runtime. The synth is cheap (a few ms of CPU per blip) and
// lazy: the AudioContext is created on first use, not at module load, so
// SSR and the initial render never touch the Web Audio API.
//
// Honors the captain's soundEnabled setting from useSettings: when off, the
// play function does nothing. Also honors the browser's autoplay policy by
// only creating the context in response to a user gesture (any click on the
// page seeds it; subsequent programmatic calls work from then on).
//
// Sound palette (mirrors the game's vocabulary, see play() below):
//   click: short UI tick for button presses
//   toggle: two tone signal for switches and tab changes
//   success: rising arpeggio for toasts like "saved"
//   error: low buzz for failed actions
//   notify: gentle bell for incoming notifications
//   voyage_start: long rising chord for setting sail
//   voyage_complete: triumphant chord sequence for ending a voyage
//   crown: short fanfare for winning Sea Master
//   level_up: ascending arpeggio for Renown level up
//   check_in: bright chord for the daily check in
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSettings } from "./use-settings";

// Each preset describes one or more oscillator "voices", each with its own
// frequency curve from start to end, waveform, gain envelope, and start delay.
// Multiple voices played together form a chord; played in sequence they
// form an arpeggio. Times are in seconds, frequencies in Hz.
type Voice = {
  freqStart: number;
  freqEnd?: number;
  type: OscillatorType;
  gain: number;
  delay: number;
  duration: number;
};

const PRESETS = {
  // A single short triangle wave tick. Quiet and high enough to be polite.
  click: [
    {
      freqStart: 880,
      type: "triangle",
      gain: 0.06,
      delay: 0,
      duration: 0.05,
    },
  ],
  // Two quick blips a fifth apart: a satisfying "on/off" pair.
  toggle: [
    { freqStart: 660, type: "triangle", gain: 0.05, delay: 0, duration: 0.04 },
    {
      freqStart: 990,
      type: "triangle",
      gain: 0.05,
      delay: 0.05,
      duration: 0.04,
    },
  ],
  // A rising C major arpeggio (C5, E5, G5, C6) for positive feedback.
  success: [
    { freqStart: 523.25, type: "sine", gain: 0.07, delay: 0, duration: 0.09 },
    {
      freqStart: 659.25,
      type: "sine",
      gain: 0.07,
      delay: 0.07,
      duration: 0.09,
    },
    {
      freqStart: 783.99,
      type: "sine",
      gain: 0.07,
      delay: 0.14,
      duration: 0.09,
    },
    {
      freqStart: 1046.5,
      type: "sine",
      gain: 0.08,
      delay: 0.21,
      duration: 0.18,
    },
  ],
  // A low square wave buzz with a slight downward bend: a "no" without
  // being harsh.
  error: [
    {
      freqStart: 220,
      freqEnd: 165,
      type: "square",
      gain: 0.06,
      delay: 0,
      duration: 0.18,
    },
  ],
  // A gentle two note bell from E5 to B5, like a single notification chime.
  notify: [
    { freqStart: 659.25, type: "sine", gain: 0.06, delay: 0, duration: 0.16 },
    {
      freqStart: 987.77,
      type: "sine",
      gain: 0.05,
      delay: 0.08,
      duration: 0.22,
    },
  ],
  // A long rising chord (C major across two octaves) for setting sail.
  voyage_start: [
    { freqStart: 261.63, type: "sine", gain: 0.06, delay: 0, duration: 0.6 },
    { freqStart: 329.63, type: "sine", gain: 0.05, delay: 0.05, duration: 0.6 },
    { freqStart: 392.0, type: "sine", gain: 0.05, delay: 0.1, duration: 0.6 },
    {
      freqStart: 523.25,
      type: "triangle",
      gain: 0.05,
      delay: 0.15,
      duration: 0.6,
    },
  ],
  // A triumphant sequence for voyage completion: C major arpeggio then a
  // held C major chord.
  voyage_complete: [
    { freqStart: 523.25, type: "sine", gain: 0.06, delay: 0, duration: 0.14 },
    { freqStart: 659.25, type: "sine", gain: 0.06, delay: 0.1, duration: 0.14 },
    { freqStart: 783.99, type: "sine", gain: 0.06, delay: 0.2, duration: 0.14 },
    { freqStart: 1046.5, type: "sine", gain: 0.07, delay: 0.3, duration: 0.4 },
    { freqStart: 1318.5, type: "sine", gain: 0.06, delay: 0.32, duration: 0.4 },
  ],
  // A short crown fanfare: two notes up, one up an octave.
  crown: [
    {
      freqStart: 659.25,
      type: "triangle",
      gain: 0.08,
      delay: 0,
      duration: 0.1,
    },
    {
      freqStart: 783.99,
      type: "triangle",
      gain: 0.08,
      delay: 0.08,
      duration: 0.1,
    },
    {
      freqStart: 1046.5,
      type: "triangle",
      gain: 0.09,
      delay: 0.16,
      duration: 0.28,
    },
  ],
  // Ascending arpeggio that climbs two octaves: a clear "level up" cue.
  level_up: [
    { freqStart: 523.25, type: "sine", gain: 0.06, delay: 0, duration: 0.1 },
    { freqStart: 659.25, type: "sine", gain: 0.06, delay: 0.07, duration: 0.1 },
    { freqStart: 783.99, type: "sine", gain: 0.06, delay: 0.14, duration: 0.1 },
    { freqStart: 1046.5, type: "sine", gain: 0.07, delay: 0.21, duration: 0.1 },
    { freqStart: 1318.5, type: "sine", gain: 0.07, delay: 0.28, duration: 0.1 },
    {
      freqStart: 1567.98,
      type: "sine",
      gain: 0.08,
      delay: 0.35,
      duration: 0.32,
    },
  ],
  // Bright chord (C major) for the daily check in claim.
  check_in: [
    { freqStart: 523.25, type: "sine", gain: 0.06, delay: 0, duration: 0.3 },
    { freqStart: 659.25, type: "sine", gain: 0.05, delay: 0.02, duration: 0.3 },
    { freqStart: 783.99, type: "sine", gain: 0.05, delay: 0.04, duration: 0.3 },
  ],
} satisfies Record<string, Voice[]>;

export type SoundName = keyof typeof PRESETS;

// Singleton at module scope: the AudioContext and a "seeded" flag. Seeded means
// the context has been resumed (in response to a user gesture) at least
// once, so subsequent programmatic play() calls are not blocked by the
// browser's autoplay policy. We keep it at module level rather than in a ref
// so multiple useSound callers share the same context.
let ctx: AudioContext | null = null;
let seeded = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

// Resume the context inside a user gesture. Browsers gate audio behind a
// gesture; once resumed, the context stays usable for the lifetime of the
// page. Idempotent and cheap, so it's safe to call on every pointerdown.
function seed() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }
  seeded = true;
}

function playVoice(c: AudioContext, voice: Voice, masterGain: GainNode) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const start = c.currentTime + voice.delay;
  const end = start + voice.duration;

  osc.type = voice.type;
  osc.frequency.setValueAtTime(voice.freqStart, start);
  if (voice.freqEnd && voice.freqEnd !== voice.freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, voice.freqEnd), end);
  }

  // Envelope: quick attack to peak, exponential decay to near zero. Avoids
  // the click pop that a flat gain on/off produces.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(voice.gain, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain).connect(masterGain);
  osc.start(start);
  osc.stop(end + 0.02);
}

export function useSound() {
  const { settings } = useSettings();
  // Keep the latest soundEnabled in a ref so the play callback stays stable
  // (the play function identity shouldn't change every time settings load,
  // since it's wired into onClick handlers across the app).
  const enabledRef = useRef(settings.soundEnabled);
  useEffect(() => {
    enabledRef.current = settings.soundEnabled;
  }, [settings.soundEnabled]);

  // Seed the AudioContext on the first user gesture, so the very first
  // programmatic play() (e.g. a toast sound after a button click) actually
  // makes noise. The listener is passive and cheap; it stays for the page
  // lifetime.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onGesture = () => {
      if (seeded) return;
      seed();
    };
    window.addEventListener("pointerdown", onGesture, { passive: true });
    window.addEventListener("keydown", onGesture, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  const play = useCallback((name: SoundName) => {
    if (!enabledRef.current) return;
    const c = getCtx();
    if (!c) return;
    // If the context was never seeded by a user gesture, attempting to play
    // will silently do nothing in most browsers. Try resuming anyway: a
    // programmatic call from inside an event handler chain still counts as
    // a user activation in some browsers.
    if (c.state === "suspended") {
      c.resume().catch(() => {});
    }
    const voices = PRESETS[name];
    if (!voices || voices.length === 0) return;
    // A single master gain per play() call keeps the voices of one sound
    // grouped for cleanup and avoids stacking gains across calls.
    const master = c.createGain();
    master.gain.value = 1;
    master.connect(c.destination);
    for (const v of voices) playVoice(c, v, master);
  }, []);

  return useMemo(
    () => ({ play, enabled: settings.soundEnabled }),
    [play, settings.soundEnabled],
  );
}
