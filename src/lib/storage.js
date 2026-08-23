import { resetState } from '../state.js';

const KEY = 'sacred-sandbox:setup:v1';

/**
 * Persist the whole instrument — every parameter plus where the camera is
 * standing. An artwork here is the combination of the two: the same settings
 * seen from a different angle is a different piece.
 */
export function saveSetup(state, camera, controls) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: 1,
      at: Date.now(),
      state: { ...state },
      cam: camera.position.toArray(),
      target: controls.target.toArray(),
    }));
    return true;
  } catch (err) {
    // Private browsing and full quotas both throw here; failing to save is not
    // worth taking the piece down for.
    console.warn('Could not save setup', err);
    return false;
  }
}

export function loadSetup() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.v === 1 ? data : null;
  } catch (err) {
    console.warn('Could not read saved setup', err);
    return null;
  }
}

export function clearSetup() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn('Could not clear saved setup', err);
  }
}

/**
 * Apply a saved payload. Only keys the current build still recognises are
 * copied across, so an old save cannot inject parameters that no longer exist.
 *
 * Reset first, then apply. Merging onto whatever was on screen meant anything
 * the save did not mention survived underneath it — load a spare setup over a
 * busy one and you kept the busy one's leftovers, which reads as the save being
 * wrong rather than as two setups being mixed.
 */
export function applySetup(data, state, camera, controls) {
  if (!data) return false;
  resetState(state);
  for (const k of Object.keys(state)) {
    if (Object.prototype.hasOwnProperty.call(data.state, k)) state[k] = data.state[k];
  }
  if (data.cam) camera.position.fromArray(data.cam);
  if (data.target) controls.target.fromArray(data.target);
  // Zoom is deliberately not stored: the layout code owns it, shrinking the
  // view when the panel is open, so a restored value would just be overwritten.
  camera.updateProjectionMatrix();
  controls.update();
  return true;
}

export function describeSetup(data) {
  if (!data) return 'nothing saved yet';
  const d = new Date(data.at);
  return `saved ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
