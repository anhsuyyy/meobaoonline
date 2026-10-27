const STORAGE_KEY = 'meo.effects.reduced';

export function areEffectsReduced() {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function setEffectsReduced(reduced) {
    const value = Boolean(reduced);
    try {
        window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
        // Continue with the in-memory setting if browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('game:effects-preference-changed', { detail: value }));
}

export function subscribeEffectsPreference(listener) {
    window.addEventListener('game:effects-preference-changed', listener);
    return () => window.removeEventListener('game:effects-preference-changed', listener);
}
