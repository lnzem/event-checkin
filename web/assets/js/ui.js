export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function getToastRegion() {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'false');
    document.body.appendChild(region);
  }
  return region;
}

export function toast(message, { type = 'info', duration = 4000 } = {}) {
  const region = getToastRegion();
  const el = document.createElement('div');
  el.className = `toast${type && type !== 'info' ? ` toast-${type}` : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  region.appendChild(el);

  window.setTimeout(() => {
    el.remove();
  }, duration);
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal({ title = '', content = '', onClose } = {}) {
  const previousFocus = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'modal-header';

  const heading = document.createElement('h2');
  heading.id = titleId;
  heading.style.margin = '0';
  heading.style.fontSize = '1.25rem';
  heading.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.textContent = '×';

  header.append(heading, closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  }

  dialog.append(header, body);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  function close() {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
    if (typeof onClose === 'function') onClose();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKeyDown);

  const firstFocusable = dialog.querySelector(FOCUSABLE_SELECTOR);
  if (firstFocusable) firstFocusable.focus();

  return { close, dialog, body };
}

export function confirmDialog({
  title = 'Confirm',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  requireText = '',
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const wrapper = document.createElement('div');
    wrapper.className = 'stack';

    const p = document.createElement('p');
    p.style.margin = '0';
    p.textContent = message;
    wrapper.appendChild(p);

    let input = null;
    if (requireText) {
      const field = document.createElement('div');
      field.className = 'field';
      const label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = `Type "${requireText}" to confirm`;
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'input';
      input.autocomplete = 'off';
      field.append(label, input);
      wrapper.appendChild(field);
    }

    const actions = document.createElement('div');
    actions.className = 'row';
    actions.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    confirmBtn.textContent = confirmText;
    if (requireText) confirmBtn.disabled = true;

    actions.append(cancelBtn, confirmBtn);
    wrapper.appendChild(actions);

    const modal = openModal({
      title,
      content: wrapper,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });

    if (input) {
      input.addEventListener('input', () => {
        confirmBtn.disabled = input.value.trim() !== requireText;
      });
    }

    cancelBtn.addEventListener('click', () => {
      if (!settled) {
        settled = true;
        modal.close();
        resolve(false);
      }
    });

    confirmBtn.addEventListener('click', () => {
      if (!settled) {
        settled = true;
        modal.close();
        resolve(true);
      }
    });
  });
}

export function renderSkeleton(type = 'card', count = 3) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    if (type === 'row') {
      items.push(
        '<div class="card" style="padding:14px"><div class="skeleton" style="height:20px;width:65%;margin-bottom:8px"></div><div class="skeleton" style="height:14px;width:40%"></div></div>'
      );
    } else {
      items.push(
        '<div class="card stack-sm"><div class="skeleton" style="aspect-ratio:16/9;width:100%"></div><div class="skeleton" style="height:20px;width:75%"></div><div class="skeleton" style="height:14px;width:50%"></div><div class="skeleton" style="height:38px;width:100%"></div></div>'
      );
    }
  }
  return items.join('');
}
