/**
 * notificationSound
 *
 * Plays a short, mild notification chime when an in-app notification arrives.
 * Sounds are synthesised with the Web Audio API (no audio asset files), so each
 * "mood" is a small note pattern. User preferences (enabled + chosen mood +
 * volume) are persisted in localStorage so they survive reloads.
 */

const STORAGE_KEY = 'notif_sound_settings';

/** Selectable sound "moods". */
export const SOUND_MOODS = [
    { id: 'chime',   label: 'Chime',   emoji: '🎐' },
    { id: 'ping',    label: 'Ping',    emoji: '🔔' },
    { id: 'marimba', label: 'Marimba', emoji: '🎵' },
    { id: 'bell',    label: 'Soft Bell', emoji: '🛎️' },
];

const DEFAULTS = { enabled: true, mood: 'chime', volume: 0.5 };

export const getSoundSettings = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return { ...DEFAULTS, ...(raw || {}) };
    } catch {
        return { ...DEFAULTS };
    }
};

export const saveSoundSettings = (patch) => {
    const next = { ...getSoundSettings(), ...patch };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
};

// Lazily-created shared AudioContext (browsers cap the number of contexts).
let ctx = null;
const audioCtx = () => {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
    }
    return ctx;
};

// Each mood is a sequence of notes: f = frequency (Hz), t = start offset (s),
// d = duration (s), type = oscillator waveform.
const MOOD_NOTES = {
    chime:   [{ f: 880.0, t: 0,    d: 0.18 }, { f: 1318.5, t: 0.12, d: 0.26 }],
    ping:    [{ f: 1244.5, t: 0,   d: 0.14, type: 'triangle' }],
    marimba: [{ f: 587.3, t: 0,    d: 0.14 }, { f: 783.99, t: 0.10, d: 0.16 }, { f: 1046.5, t: 0.20, d: 0.22 }],
    bell:    [{ f: 659.25, t: 0,   d: 0.5,  type: 'sine' }, { f: 987.77, t: 0.02, d: 0.45, type: 'sine' }],
};

/**
 * Play the notification sound for the current (or supplied) settings.
 * No-op when sound is disabled or the Web Audio API is unavailable.
 */
export const playNotificationSound = (settingsArg) => {
    const settings = settingsArg || getSoundSettings();
    if (!settings.enabled) return;

    const c = audioCtx();
    if (!c) return;
    // Autoplay policies suspend the context until a user gesture — resume on play.
    if (c.state === 'suspended') c.resume().catch(() => {});

    const notes = MOOD_NOTES[settings.mood] || MOOD_NOTES.chime;
    const vol = Math.max(0, Math.min(1, settings.volume ?? DEFAULTS.volume));
    const now = c.currentTime;

    notes.forEach((n) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = n.type || 'sine';
        osc.frequency.value = n.f;

        const start = now + n.t;
        const end = start + n.d;
        // Quick attack then exponential decay → a soft, non-jarring tone
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(start);
        osc.stop(end + 0.03);
    });
};

/**
 * Resume the audio context in response to a user gesture so later programmatic
 * plays aren't blocked by autoplay policies. Safe to call repeatedly.
 */
export const unlockNotificationSound = () => {
    const c = audioCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
};
