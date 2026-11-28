import { renderPublicNav } from '../nav.js';
import { getSupabase } from '../supabase-client.js';
import { getProfile, requireUser } from '../auth.js';
import { toast } from '../ui.js';

function setupProfileForm(session, profile) {
  const emailEl = document.getElementById('prof-email');
  const nameEl = document.getElementById('prof-name');
  const orgEl = document.getElementById('prof-org');
  const phoneEl = document.getElementById('prof-phone');
  const form = document.getElementById('profile-form');
  const saveBtn = document.getElementById('prof-save-btn');

  emailEl.value = session.user.email || '';
  nameEl.value = profile?.full_name || '';
  orgEl.value = profile?.organization || '';
  phoneEl.value = profile?.contact_number || '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = nameEl.value.trim();
    const organization = orgEl.value.trim();
    const contactNumber = phoneEl.value.replace(/[\s-]+/g, '').trim();
    const nameErr = document.getElementById('prof-name-err');
    const orgErr = document.getElementById('prof-org-err');
    const phoneErr = document.getElementById('prof-phone-err');
    let valid = true;

    if (fullName.length < 2 || fullName.length > 100) {
      nameEl.setAttribute('aria-invalid', 'true');
      nameErr.textContent = '! Full name must be at least 2 characters.';
      nameErr.hidden = false;
      valid = false;
    } else {
      nameEl.removeAttribute('aria-invalid');
      nameErr.hidden = true;
    }

    if (organization.length < 2 || organization.length > 100) {
      orgEl.setAttribute('aria-invalid', 'true');
      orgErr.textContent = '! Organization must be at least 2 characters.';
      orgErr.hidden = false;
      valid = false;
    } else {
      orgEl.removeAttribute('aria-invalid');
      orgErr.hidden = true;
    }

    if (!/^(09\d{9}|\+639\d{9})$/.test(contactNumber)) {
      phoneEl.setAttribute('aria-invalid', 'true');
      phoneErr.textContent = '! Enter a valid PH mobile number (09XXXXXXXXX or +639XXXXXXXXX).';
      phoneErr.hidden = false;
      valid = false;
    } else {
      phoneEl.removeAttribute('aria-invalid');
      phoneErr.hidden = true;
    }

    if (!valid) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Saving…';
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, organization, contact_number: contactNumber })
        .eq('id', session.user.id);
      if (error) throw error;
      toast('Details saved!', { type: 'success' });
    } catch (err) {
      toast(err.message || 'Could not save details.', { type: 'danger' });
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save details';
    }
  });
}

async function init() {
  renderPublicNav({ active: 'profile' });
  const session = await requireUser();
  if (!session) return;
  setupProfileForm(session, await getProfile());
}

init();
