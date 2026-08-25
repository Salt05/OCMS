/**
 * Composable for ChatContactPanel state and actions:
 * - Form population from contact
 * - Save contact info
 * - Fetch appointments for contact
 */
import { ref, watch, reactive } from 'vue';
import { useContacts, type Contact } from '@/composables/use-contacts';
import { api } from '@/api/index';
import type { Appointment } from '@/components/chat/ChatAppointments.vue';

export function useChatContactPanel(
  getContactId: () => string | null,
  getContact: () => Contact | null,
  onSaved: () => void,
) {
  const { updateContact, fetchContact } = useContacts();

  const saving = ref(false);
  const saveSuccess = ref(false);
  const saveError = ref(false);
  const contactAppointments = ref<Appointment[]>([]);

  const form = reactive({
    isCompany: false,
    fullName: '',
    zaloName: '',
    customerId: '',
    contactType: 'other' as 'customer' | 'employee' | 'other',
    phone: '',
    email: '',
    address: '',
    zone: '',
    salesperson: '',
    source: null as string | null,
    status: null as string | null,
    assignedUserId: null as string | null,
    firstContactDate: '',
    nextAppointmentDate: '',
    tags: [] as string[],
    notes: '',
  });

  function populateForm(c: Contact) {
    form.isCompany = false;
    form.fullName = c.fullName ?? '';
    form.zaloName = c.zaloName || c.fullName || '';
    form.customerId = c.customerId ?? '';
    form.contactType = c.contactType ?? 'other';
    form.phone = c.phone ?? '';
    form.email = c.email ?? '';
    form.address = c.address ?? '';
    form.zone = c.zone ?? '';
    form.salesperson = c.salesperson ?? '';
    form.source = c.source ?? null;
    form.status = c.status ?? null;
    form.assignedUserId = c.assignedUserId ?? (c.assignedUser?.id ?? null);
    form.firstContactDate = c.firstContactDate
      ? new Date(c.firstContactDate).toISOString().split('T')[0]
      : '';
    form.tags = Array.isArray(c.tags) ? [...c.tags] : [];
    form.notes = c.notes ?? '';
  }

  async function fetchContactExtras(contactId: string) {
    try {
      const res = await api.get(`/contacts/${contactId}/appointments`);
      contactAppointments.value = res.data.appointments ?? [];
    } catch (err) {
      console.error('fetchContactExtras error:', err);
    }
  }

  async function reloadAppointments() {
    const id = getContactId();
    if (!id) return;
    try {
      const res = await api.get(`/contacts/${id}/appointments`);
      contactAppointments.value = res.data.appointments ?? [];
    } catch (err) {
      console.error('reloadAppointments error:', err);
    }
  }

  let lastContactId: string | null = null;

  watch(getContact, (c) => {
    if (!c) {
      lastContactId = null;
      return;
    }
    if (c.id !== lastContactId) {
      lastContactId = c.id;
      populateForm(c);
      fetchContactExtras(c.id);
    }
  }, { immediate: true, deep: true });

  async function saveContact() {
    const contactId = getContactId();
    if (!contactId) return;
    saving.value = true;
    saveSuccess.value = false;
    saveError.value = false;

    const result = await updateContact(contactId, {
      fullName: form.fullName || null,
      zaloName: form.zaloName || null,
      customerId: form.customerId || null,
      contactType: form.contactType,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      zone: form.zone || null,
      salesperson: form.salesperson || null,
      source: form.source || null,
      status: form.status || null,
      assignedUserId: form.assignedUserId || null,
      firstContactDate: form.firstContactDate
        ? new Date(form.firstContactDate + 'T00:00:00').toISOString()
        : null,
      tags: form.tags,
      notes: form.notes || null,
    });

    saving.value = false;
    if (result) {
      const fresh = await fetchContact(contactId);
      if (fresh) {
        lastContactId = fresh.id;
        populateForm(fresh);
      }
      saveSuccess.value = true;
      onSaved();
      setTimeout(() => { saveSuccess.value = false; }, 2500);
    } else {
      saveError.value = true;
    }
  }

  return {
    form,
    saving, saveSuccess, saveError,
    contactAppointments,
    saveContact, reloadAppointments,
  };
}
