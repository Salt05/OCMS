/**
 * Composable for ChatContactPanel state and actions:
 * - Form population from contact
 * - Save contact info
 * - Fetch appointments for contact
 */
import { ref, watch, reactive } from 'vue';
import { useContacts, type Contact } from '@/composables/use-contacts';
import { api } from '@/api/index';

export interface Appointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string | null;
  type: string | null;
  status: string;
  notes: string | null;
}

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
    salutation: '',
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
    const isInvalid = (name?: string | null) =>
      !name || name === 'Khách hàng' || name === 'Khách hàng Zalo' || name === 'Unknown';
    form.isCompany = false;
    form.fullName = !isInvalid(c.fullName) ? (c.fullName ?? '') : (c.zaloName || '');
    form.salutation = c.salutation ?? '';
    form.zaloName = c.zaloName || (!isInvalid(c.fullName) ? (c.fullName ?? '') : '');
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

  const customerStats = ref<{ totalRevenue: number; totalOrders: number; lastOrderDate: string | null } | null>(null);

  async function fetchContactExtras(contactId: string) {
    try {
      const [appRes, contactRes] = await Promise.all([
        api.get(`/contacts/${contactId}/appointments`),
        api.get(`/contacts/${contactId}`).catch(() => null),
      ]);
      contactAppointments.value = appRes.data.appointments ?? [];
      if (contactRes?.data?.customer) {
        customerStats.value = contactRes.data.customer;
      }
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
      customerStats.value = null;
      return;
    }
    if ((c as any)?.customer) {
      customerStats.value = (c as any).customer;
    }
    if (c.id !== lastContactId) {
      lastContactId = c.id;
      populateForm(c);
      fetchContactExtras(c.id);
    } else if (!customerStats.value) {
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
      salutation: form.salutation || null,
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
      await fetchContactExtras(contactId);
      saveSuccess.value = true;
      onSaved();
      setTimeout(() => { saveSuccess.value = false; }, 2500);
    } else {
      saveError.value = true;
    }
  }

  const loadingOdoo = ref(false);
  const odooSyncMessage = ref('');
  const odooSyncError = ref('');
  const matchedOdooCustomers = ref<any[]>([]);

  function applyOdooCustomer(c: any): boolean {
    if (!c) return false;
    form.customerId = String(c.id);
    if (c.name) form.fullName = c.name;
    if (c.phone) {
      form.phone = c.phone;
    } else if (c.mobile) {
      form.phone = c.mobile;
    }
    if (c.email) form.email = c.email;
    if (c.fullAddress || c.street) {
      form.address = c.fullAddress || c.street;
    }
    if (c.zone || c.state || c.city) {
      form.zone = c.zone || c.state || c.city;
    }
    if (c.salesperson) {
      form.salesperson = c.salesperson;
    }
    form.contactType = 'customer';

    if (c.totalOrders !== undefined || c.orderStats) {
      customerStats.value = {
        totalRevenue: Number(c.totalRevenue ?? c.orderStats?.totalRevenue) || 0,
        totalOrders: Number(c.totalOrders ?? c.orderStats?.totalOrders) || 0,
        lastOrderDate: c.lastOrderDate ?? c.orderStats?.lastOrderDate ?? null,
      };
    }

    const details = [
      c.name,
      form.phone ? `SĐT: ${form.phone}` : '',
      form.address ? `Địa chỉ: ${form.address}` : '',
      form.zone ? `Khu vực: ${form.zone}` : ''
    ].filter(Boolean).join(' • ');

    odooSyncMessage.value = `Đã đồng bộ thông tin từ Odoo: ${details}`;
    matchedOdooCustomers.value = [];
    return true;
  }

  async function lookupAndApplyOdoo(customId?: string): Promise<boolean> {
    let cleanQuery = (customId || form.customerId || '').trim();
    if (cleanQuery.startsWith('#')) cleanQuery = cleanQuery.slice(1).trim();
    if (!cleanQuery) {
      odooSyncError.value = 'Vui lòng nhập ID, Tên, SĐT hoặc Email để tra cứu';
      return false;
    }

    loadingOdoo.value = true;
    odooSyncMessage.value = '';
    odooSyncError.value = '';
    matchedOdooCustomers.value = [];

    try {
      const res = await api.get('/odoo/customers/search', {
        params: { query: cleanQuery },
      });

      const customers = res.data?.customers ?? [];

      if (customers.length === 1) {
        return applyOdooCustomer(customers[0]);
      } else if (customers.length > 1) {
        matchedOdooCustomers.value = customers;
        odooSyncMessage.value = `Tìm thấy ${customers.length} khách hàng phù hợp. Vui lòng chọn bên dưới:`;
        return false;
      } else {
        odooSyncError.value = `Không tìm thấy khách hàng nào trên Odoo với "${cleanQuery}"`;
        return false;
      }
    } catch (err: any) {
      odooSyncError.value = err.response?.data?.error || `Không tìm thấy khách hàng trên Odoo với "${cleanQuery}"`;
      return false;
    } finally {
      loadingOdoo.value = false;
    }
  }

  return {
    form,
    saving, saveSuccess, saveError,
    customerStats,
    loadingOdoo, odooSyncMessage, odooSyncError,
    matchedOdooCustomers,
    contactAppointments,
    saveContact, reloadAppointments,
    lookupAndApplyOdoo,
    applyOdooCustomer,
  };
}
