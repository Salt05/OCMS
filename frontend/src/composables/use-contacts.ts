/**
 * Composable for contact (khách hàng) management:
 * - List with filters, pagination
 * - CRUD operations
 * - CRM pipeline status
 */
import { ref, reactive } from 'vue';
import { api } from '@/api/index';

export interface Contact {
  id: string;
  fullName: string | null;
  zaloName?: string | null;
  phone: string | null;
  email?: string | null;
  zaloUid?: string | null;
  avatarUrl?: string | null;
  source: string | null;
  status: string | null;
  customerId?: string | null;
  contactType?: 'customer' | 'employee' | 'other';
  address?: string | null;
  zone?: string | null;
  salesperson?: string | null;
  notes: string | null;
  tags: string[];
  assignedUserId?: string | null;
  assignedUser?: { id?: string; fullName: string; email?: string } | null;
  createdAt?: string;
  updatedAt?: string;
  firstContactDate?: string | null;
  appointments?: Array<{ id: string; appointmentDate: string; appointmentTime?: string | null; notes?: string | null; status?: string }>;
  _count?: { conversations?: number; appointments?: number };
}

export interface ContactFilters {
  search: string;
  source: string;
  status: string;
  tags: string[];
  contactType: string;
}

export const SOURCE_OPTIONS = [
  { text: 'Facebook', value: 'FB' },
  { text: 'TikTok', value: 'TT' },
  { text: 'Giới thiệu', value: 'GT' },
  { text: 'Cá nhân', value: 'CN' },
];

export const STATUS_OPTIONS = [
  { text: 'Mới', value: 'new' },
  { text: 'Đã liên hệ', value: 'contacted' },
  { text: 'Quan tâm', value: 'interested' },
  { text: 'Chuyển đổi', value: 'converted' },
  { text: 'Mất', value: 'lost' },
];

export const CONTACT_TYPE_OPTIONS = [
  { text: 'Khách hàng', value: 'customer' },
  { text: 'Nhân viên', value: 'employee' },
  { text: 'Khác', value: 'other' },
];

export function useContacts() {
  const contacts = ref<Contact[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  const deleting = ref(false);

  const filters = reactive<ContactFilters>({
    search: '',
    source: '',
    status: '',
    tags: [],
    contactType: '',
  });

  const pagination = reactive({ page: 1, limit: 20 });

  async function fetchContacts() {
    loading.value = true;
    try {
      const res = await api.get('/contacts', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search || undefined,
          source: filters.source || undefined,
          status: filters.status || undefined,
          tags: filters.tags?.length ? filters.tags.join(',') : undefined,
          contactType: filters.contactType || undefined,
        },
      });
      contacts.value = res.data.contacts ?? res.data;
      total.value = res.data.total ?? contacts.value.length;
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchContact(id: string): Promise<Contact | null> {
    try {
      const res = await api.get(`/contacts/${id}`);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch contact:', err);
      return null;
    }
  }

  async function createContact(payload: Partial<Contact>): Promise<Contact | null> {
    saving.value = true;
    try {
      const res = await api.post('/contacts', payload);
      await fetchContacts();
      return res.data;
    } catch (err) {
      console.error('Failed to create contact:', err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateContact(id: string, payload: Partial<Contact>): Promise<Contact | null> {
    saving.value = true;
    try {
      const res = await api.put(`/contacts/${id}`, payload);
      const idx = contacts.value.findIndex(c => c.id === id);
      if (idx !== -1) contacts.value[idx] = res.data;
      return res.data;
    } catch (err) {
      console.error('Failed to update contact:', err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteContact(id: string): Promise<boolean> {
    deleting.value = true;
    try {
      await api.delete(`/contacts/${id}`);
      await fetchContacts();
      return true;
    } catch (err) {
      console.error('Failed to delete contact:', err);
      return false;
    } finally {
      deleting.value = false;
    }
  }

  async function deleteContacts(ids: string[]): Promise<boolean> {
    if (!ids.length) return false;
    deleting.value = true;
    try {
      await Promise.all(ids.map(id => api.delete(`/contacts/${id}`)));
      await fetchContacts();
      return true;
    } catch (err) {
      console.error('Failed to delete contacts:', err);
      return false;
    } finally {
      deleting.value = false;
    }
  }

  function resetFilters() {
    filters.search = '';
    filters.source = '';
    filters.status = '';
    filters.tags = [];
    filters.contactType = '';
    pagination.page = 1;
    fetchContacts();
  }

  return {
    contacts, total, loading, saving, deleting,
    filters, pagination,
    fetchContacts, fetchContact,
    createContact, updateContact, deleteContact, deleteContacts,
    resetFilters,
  };
}
