import { initAdminPage } from '../admin-shell.js';
import { getSupabase } from '../supabase-client.js';
import { renderEventCard } from '../events.js';
import { confirmDialog, escapeHtml, openModal, toast } from '../ui.js';

const root = document.getElementById('editor-root');
const pageTitle = document.getElementById('page-title');
const statusChip = document.getElementById('edit-status-chip');
const mobilePreviewBtn = document.getElementById('mobile-preview-btn');

const params = new URLSearchParams(window.location.search);
const eventId = params.get('id')?.trim() || '';
const isEdit = Boolean(eventId);

let registeredCount = 0;
let currentCoverUrl = null;
let originalCoverUrl = null;
let dirty = false;
let saving = false;

export function manilaInputToUtcIso(val) {
  if (!val) return null;
  const d = new Date(`${val}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function utcIsoToManilaInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  const hh = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hh}:${get('minute')}`;
}

function getStoragePathFromUrl(url) {
  if (!url) return null;
  const marker = '/storage/v1/object/public/event-covers/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

async function deleteStorageObject(url) {
  const path = getStoragePathFromUrl(url);
  if (!path) return;
  try {
    const supabase = getSupabase();
    await supabase.storage.from('event-covers').remove([path]);
  } catch {
    // non-fatal
  }
}

function renderEditor(initial = {}) {
  const titleVal = initial.title || '';
  const descVal = initial.description || '';
  const venueVal = initial.venue || '';
  const startsVal = utcIsoToManilaInput(initial.starts_at);
  const endsVal = utcIsoToManilaInput(initial.ends_at);
  const capVal = initial.capacity ?? '';
  const statusVal = initial.status || 'draft';

  const regNotice =
    isEdit && registeredCount > 0
      ? `<div class="banner banner-warning">${escapeHtml(String(registeredCount))} ${registeredCount === 1 ? 'person is' : 'people are'} registered. Changing the date, time, or venue won’t notify them automatically.</div>`
      : '';

  const statusOptions = isEdit
    ? `
      <option value="draft"${statusVal === 'draft' ? ' selected' : ''}>Draft</option>
      <option value="published"${statusVal === 'published' ? ' selected' : ''}>Published</option>
      <option value="cancelled"${statusVal === 'cancelled' ? ' selected' : ''}>Cancelled</option>
    `
    : `
      <option value="draft"${statusVal === 'draft' ? ' selected' : ''}>Draft</option>
      <option value="published"${statusVal === 'published' ? ' selected' : ''}>Published</option>
    `;

  root.innerHTML = `
    <div id="save-banner" aria-live="polite" style="margin-bottom:16px;"></div>
    ${regNotice ? `<div style="margin-bottom:16px;">${regNotice}</div>` : ''}

    <div class="editor-grid">
      <form id="event-form" class="card stack" novalidate>
        <div class="field">
          <div class="row-between">
            <label class="field-label" for="ev-title">Title</label>
            <span id="title-count" class="muted" style="font-size:0.75rem;">${titleVal.length}/100</span>
          </div>
          <input id="ev-title" class="input" type="text" maxlength="100" required value="${escapeHtml(titleVal)}" aria-describedby="err-title">
          <span id="err-title" class="field-error" hidden></span>
        </div>

        <div class="field">
          <div class="row-between">
            <label class="field-label" for="ev-desc">Description</label>
            <span id="desc-count" class="muted" style="font-size:0.75rem;">${descVal.length}/2000</span>
          </div>
          <textarea id="ev-desc" class="textarea" maxlength="2000" aria-describedby="err-desc">${escapeHtml(descVal)}</textarea>
          <span id="err-desc" class="field-error" hidden></span>
        </div>

        <div class="field">
          <label class="field-label" for="ev-venue">Venue</label>
          <input id="ev-venue" class="input" type="text" maxlength="150" value="${escapeHtml(venueVal)}" aria-describedby="err-venue">
          <span id="err-venue" class="field-error" hidden></span>
        </div>

        <div class="row" style="align-items:flex-start;">
          <div class="field" style="flex:1;min-width:200px;">
            <label class="field-label" for="ev-starts">Starts at (Asia/Manila)</label>
            <input id="ev-starts" class="input" type="datetime-local" value="${escapeHtml(startsVal)}" aria-describedby="err-starts">
            <span id="err-starts" class="field-error" hidden></span>
          </div>
          <div class="field" style="flex:1;min-width:200px;">
            <label class="field-label" for="ev-ends">Ends at (Asia/Manila)</label>
            <input id="ev-ends" class="input" type="datetime-local" value="${escapeHtml(endsVal)}" aria-describedby="err-ends">
            <span id="err-ends" class="field-error" hidden></span>
          </div>
        </div>

        <div class="row" style="align-items:flex-start;">
          <div class="field" style="flex:1;min-width:160px;">
            <label class="field-label" for="ev-capacity">Capacity</label>
            <input id="ev-capacity" class="input" type="number" min="${Math.max(1, registeredCount)}" step="1" value="${escapeHtml(String(capVal))}" aria-describedby="hint-capacity err-capacity">
            ${registeredCount > 0 ? `<span id="hint-capacity" class="field-hint">${escapeHtml(String(registeredCount))} already registered</span>` : '<span id="hint-capacity" class="field-hint">Minimum 1</span>'}
            <span id="err-capacity" class="field-error" hidden></span>
          </div>

          <div class="field" style="flex:1;min-width:160px;">
            <label class="field-label" for="ev-status">Status</label>
            <select id="ev-status" class="select">${statusOptions}</select>
          </div>
        </div>

        <div class="field">
          <span class="field-label">Cover image (JPG, PNG, WebP, max 2 MB)</span>
          <div id="cover-dropzone" class="dropzone stack-sm">
            <input id="cover-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
            <div id="cover-preview-wrap" ${currentCoverUrl ? '' : 'hidden'}>
              <img id="cover-preview-img" src="${escapeHtml(currentCoverUrl || '')}" alt="Cover preview" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;">
            </div>
            <div class="row" style="justify-content:center;">
              <button type="button" class="btn btn-secondary btn-sm" id="choose-cover-btn">Choose file</button>
              <button type="button" class="btn btn-ghost btn-sm" id="remove-cover-btn" ${currentCoverUrl ? '' : 'hidden'}>Remove</button>
            </div>
            <div id="cover-progress" class="muted" style="font-size:0.8125rem;">Drag &amp; drop an image here, or click Choose file.</div>
          </div>
          <span id="err-cover" class="field-error" hidden></span>
        </div>

        <div class="sticky-bar">
          <div class="row-between">
            <button type="button" id="cancel-btn" class="btn btn-ghost">Cancel</button>
            <div class="row">
              <button type="button" id="save-draft-btn" class="btn btn-secondary">Save draft</button>
              <button type="submit" id="publish-btn" class="btn btn-primary">${isEdit ? 'Save changes' : 'Publish'}</button>
            </div>
          </div>
        </div>
      </form>

      <aside class="preview-col stack-sm">
        <div class="muted" style="font-size:0.8125rem;font-weight:600;">LIVE PREVIEW</div>
        <div id="live-preview-card"></div>
      </aside>
    </div>
  `;

  const form = document.getElementById('event-form');
  const titleEl = document.getElementById('ev-title');
  const descEl = document.getElementById('ev-desc');
  const venueEl = document.getElementById('ev-venue');
  const startsEl = document.getElementById('ev-starts');
  const endsEl = document.getElementById('ev-ends');
  const capEl = document.getElementById('ev-capacity');
  const statusEl = document.getElementById('ev-status');
  const previewCard = document.getElementById('live-preview-card');
  const saveBanner = document.getElementById('save-banner');

  function getPreviewEvent() {
    return {
      id: eventId || 'preview',
      title: titleEl.value.trim() || 'Untitled event',
      description: descEl.value,
      venue: venueEl.value.trim() || 'Venue TBA',
      starts_at: manilaInputToUtcIso(startsEl.value),
      ends_at: manilaInputToUtcIso(endsEl.value),
      capacity: Number(capEl.value) || 50,
      registered_count: registeredCount,
      cover_image_url: currentCoverUrl,
      status: statusEl.value === 'cancelled' ? 'cancelled' : 'published',
    };
  }

  function updatePreview() {
    document.getElementById('title-count').textContent = `${titleEl.value.length}/100`;
    document.getElementById('desc-count').textContent = `${descEl.value.length}/2000`;
    previewCard.innerHTML = renderEventCard(getPreviewEvent(), { preview: true });
  }

  updatePreview();
  [titleEl, descEl, venueEl, startsEl, endsEl, capEl, statusEl].forEach((el) => {
    el.addEventListener('input', () => {
      dirty = true;
      updatePreview();
    });
  });

  mobilePreviewBtn.addEventListener('click', () => {
    openModal({
      title: 'Event card preview',
      content: renderEventCard(getPreviewEvent(), { preview: true }),
    });
  });

  // Cover upload
  const dropzone = document.getElementById('cover-dropzone');
  const fileInput = document.getElementById('cover-file');
  const chooseBtn = document.getElementById('choose-cover-btn');
  const removeBtn = document.getElementById('remove-cover-btn');
  const previewWrap = document.getElementById('cover-preview-wrap');
  const previewImg = document.getElementById('cover-preview-img');
  const coverProgress = document.getElementById('cover-progress');
  const coverErr = document.getElementById('err-cover');

  async function handleFile(file) {
    coverErr.hidden = true;
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      coverErr.textContent = '! Only JPG, PNG, and WebP images are allowed.';
      coverErr.hidden = false;
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      coverErr.textContent = '! Image must be 2 MB or smaller.';
      coverErr.hidden = false;
      return;
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const folder = eventId || 'temp';
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    coverProgress.textContent = 'Uploading…';
    try {
      const supabase = getSupabase();
      const { error } = await supabase.storage.from('event-covers').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;

      const { data: pub } = supabase.storage.from('event-covers').getPublicUrl(path);
      if (currentCoverUrl && currentCoverUrl !== originalCoverUrl) {
        await deleteStorageObject(currentCoverUrl);
      }
      currentCoverUrl = pub.publicUrl;
      previewImg.src = currentCoverUrl;
      previewWrap.hidden = false;
      removeBtn.hidden = false;
      coverProgress.textContent = 'Uploaded!';
      dirty = true;
      updatePreview();
    } catch (err) {
      coverProgress.textContent = 'Upload failed.';
      coverErr.textContent = `! ${err.message || 'Could not upload cover image.'}`;
      coverErr.hidden = false;
    }
  }

  chooseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files?.[0]));
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFile(e.dataTransfer?.files?.[0]);
  });

  removeBtn.addEventListener('click', async () => {
    if (currentCoverUrl && currentCoverUrl !== originalCoverUrl) {
      await deleteStorageObject(currentCoverUrl);
    }
    currentCoverUrl = null;
    previewWrap.hidden = true;
    removeBtn.hidden = true;
    fileInput.value = '';
    coverProgress.textContent = 'Cover removed.';
    dirty = true;
    updatePreview();
  });

  function setErr(el, errId, msg) {
    const errEl = document.getElementById(errId);
    if (msg) {
      el.setAttribute('aria-invalid', 'true');
      errEl.textContent = `! ${msg}`;
      errEl.hidden = false;
    } else {
      el.removeAttribute('aria-invalid');
      errEl.hidden = true;
    }
  }

  function validate(full) {
    let firstBad = null;
    const title = titleEl.value.trim();
    const titleMsg = title.length < 3 || title.length > 100 ? 'Title must be between 3 and 100 characters.' : '';
    setErr(titleEl, 'err-title', titleMsg);
    if (titleMsg && !firstBad) firstBad = titleEl;

    if (!full) {
      setErr(descEl, 'err-desc', '');
      setErr(venueEl, 'err-venue', '');
      setErr(startsEl, 'err-starts', '');
      setErr(endsEl, 'err-ends', '');
      setErr(capEl, 'err-capacity', '');
      if (firstBad) firstBad.focus();
      return !firstBad;
    }

    const descMsg = descEl.value.length > 2000 ? 'Description must be 2,000 characters or less.' : '';
    setErr(descEl, 'err-desc', descMsg);
    if (descMsg && !firstBad) firstBad = descEl;

    const venue = venueEl.value.trim();
    const venueMsg = !venue || venue.length > 150 ? 'Venue is required (up to 150 characters).' : '';
    setErr(venueEl, 'err-venue', venueMsg);
    if (venueMsg && !firstBad) firstBad = venueEl;

    const startsIso = manilaInputToUtcIso(startsEl.value);
    const startsMsg = !startsIso ? 'Start date and time is required.' : '';
    setErr(startsEl, 'err-starts', startsMsg);
    if (startsMsg && !firstBad) firstBad = startsEl;

    const endsIso = manilaInputToUtcIso(endsEl.value);
    let endsMsg = '';
    if (!endsIso) endsMsg = 'End date and time is required.';
    else if (startsIso && new Date(endsIso) <= new Date(startsIso)) endsMsg = 'End time must be after start time.';
    setErr(endsEl, 'err-ends', endsMsg);
    if (endsMsg && !firstBad) firstBad = endsEl;

    const cap = Number(capEl.value);
    let capMsg = '';
    if (!Number.isInteger(cap) || cap < 1) capMsg = 'Capacity must be a whole number of at least 1.';
    else if (cap < registeredCount) capMsg = `Capacity cannot be less than ${registeredCount} already registered.`;
    setErr(capEl, 'err-capacity', capMsg);
    if (capMsg && !firstBad) firstBad = capEl;

    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  async function saveEvent(targetStatus) {
    if (saving) return;
    saveBanner.innerHTML = '';

    const fullValidation = targetStatus !== 'draft';
    if (!validate(fullValidation)) return;

    if (targetStatus === 'cancelled') {
      const ok = await confirmDialog({
        title: 'Cancel this event?',
        message: 'Existing attendees’ tickets stay on record, and registration will close.',
        confirmText: 'Cancel event',
        danger: true,
      });
      if (!ok) return;
    }

    saving = true;
    const draftBtn = document.getElementById('save-draft-btn');
    const pubBtn = document.getElementById('publish-btn');
    draftBtn.disabled = true;
    pubBtn.disabled = true;

    const payload = {
      title: titleEl.value.trim(),
      description: descEl.value,
      venue: venueEl.value.trim(),
      starts_at: manilaInputToUtcIso(startsEl.value),
      ends_at: manilaInputToUtcIso(endsEl.value),
      capacity: capEl.value ? Number(capEl.value) : null,
      cover_image_url: currentCoverUrl,
      status: targetStatus,
    };

    try {
      const supabase = getSupabase();
      let savedId = eventId;
      if (isEdit) {
        const { error } = await supabase.from('events').update(payload).eq('id', eventId);
        if (error) throw error;
        if (originalCoverUrl && originalCoverUrl !== currentCoverUrl) {
          await deleteStorageObject(originalCoverUrl);
        }
      } else {
        const { data, error } = await supabase.from('events').insert(payload).select('id').single();
        if (error) throw error;
        savedId = data.id;
      }

      dirty = false;
      if (targetStatus === 'published') {
        toast('Event published!', { type: 'success' });
        window.location.assign(`/admin`);
      } else {
        toast('Draft saved.', { type: 'success' });
        if (!isEdit && savedId) {
          window.location.assign(`/admin/event?id=${encodeURIComponent(savedId)}`);
        } else {
          window.location.assign('/admin');
        }
      }
    } catch (err) {
      saveBanner.innerHTML = `<div class="banner banner-danger">${escapeHtml(err.message || 'Could not save event.')}</div>`;
    } finally {
      saving = false;
      draftBtn.disabled = false;
      pubBtn.disabled = false;
    }
  }

  document.getElementById('save-draft-btn').addEventListener('click', () => saveEvent('draft'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const target = isEdit ? statusEl.value : 'published';
    saveEvent(target);
  });

  async function confirmLeave(href) {
    if (!dirty) {
      window.location.assign(href);
      return;
    }
    const ok = await confirmDialog({
      title: 'Discard unsaved changes?',
      message: 'You have unsaved changes that will be lost.',
      confirmText: 'Discard',
      danger: true,
    });
    if (ok) {
      dirty = false;
      window.location.assign(href);
    }
  }

  document.getElementById('cancel-btn').addEventListener('click', () => confirmLeave('/admin'));
  document.getElementById('back-link').addEventListener('click', (e) => {
    if (dirty) {
      e.preventDefault();
      confirmLeave('/admin');
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

async function init() {
  const auth = await initAdminPage({ active: 'events' });
  if (!auth) return;

  if (!isEdit) {
    renderEditor({});
    return;
  }

  pageTitle.textContent = 'Edit event';
  root.innerHTML = '<div class="card"><div class="skeleton" style="height:300px;"></div></div>';

  try {
    const supabase = getSupabase();
    const [evRes, statsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.rpc('admin_event_stats'),
    ]);

    if (evRes.error) throw evRes.error;
    if (!evRes.data) {
      root.innerHTML = `<div class="empty-state stack-sm"><h2>Event not found</h2><div><a href="/admin" class="btn btn-primary">Back to events</a></div></div>`;
      return;
    }

    const st = (statsRes.data || []).find((s) => s.event_id === eventId);
    registeredCount = st?.registered_count || 0;
    currentCoverUrl = evRes.data.cover_image_url || null;
    originalCoverUrl = currentCoverUrl;

    const chipCls = evRes.data.status === 'published' ? 'chip-success' : evRes.data.status === 'cancelled' ? 'chip-danger' : 'chip-muted';
    statusChip.innerHTML = `<span class="chip ${chipCls}">${escapeHtml(evRes.data.status)}</span>`;

    renderEditor(evRes.data);
  } catch (err) {
    root.innerHTML = `<div class="banner banner-danger">${escapeHtml(err.message || 'Could not load event.')}</div>`;
  }
}

init();
