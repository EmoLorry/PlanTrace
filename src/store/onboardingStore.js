import { getJSON, setJSON } from './storage.js';

const ONBOARDING_SEEN_KEY = 'onboarding_seen';

export function hasSeenOnboarding() {
    return getJSON(ONBOARDING_SEEN_KEY) === true;
}

export function markOnboardingSeen() {
    setJSON(ONBOARDING_SEEN_KEY, true);
}

export function shouldAutoShowOnboarding() {
    if (hasSeenOnboarding()) return false;

    const tasks = getJSON('tasks') || [];
    return tasks.length === 0;
}
