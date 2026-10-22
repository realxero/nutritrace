import { writable } from 'svelte/store';

export const toasts = writable([]);

let _id = 0;

export function showToast(message, duration = 3000, type = 'default', action = null) {
  const id = ++_id;
  toasts.update(list => [...list, { id, message, type, action }]);
  setTimeout(() => {
    toasts.update(list => list.filter(t => t.id !== id));
  }, duration);
}

export function showSuccess(msg) { showToast(msg, 2500, 'success'); }
export function showError(msg)   { showToast(msg, 4000, 'error'); }
export function showInfo(msg)    { showToast(msg, 3000, 'info'); }

// Fork: a success toast with an Undo button. onUndo runs once; the toast closes either way.
export function dismissToast(id) { toasts.update(list => list.filter(t => t.id !== id)); }
export function showUndo(message, onUndo, duration = 7000) {
  return showToast(message, duration, 'success', { label: 'Undo', onClick: onUndo });
}
