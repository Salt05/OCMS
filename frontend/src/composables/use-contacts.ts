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
  salutation?: string | null;
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
  conversations?: Array<{ id: string; aiActive: boolean; aiPaused: boolean; pausedUntil?: string | null; currentState?: string }>;
  _count?: { conversations?: number; appointments?: number };
}

export interface ContactFilters {
  search: string;
  source: string;
  status: string;
  tags: string[];
  contactType: string;
  assignedUserId: string;
}

export const SALUTATION_OPTIONS = ['Anh', 'Chị', 'Bạn', 'Cô', 'Chú', 'Bác', 'Em'];

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
    assignedUserId: '',
  });

  const pagination = reactive({ page: 1, limit: 20 });

  async function fetchContacts(options?: { page?: number; itemsPerPage?: number }) {
    if (options && typeof options === 'object') {
      if (typeof options.page === 'number' && options.page > 0) pagination.page = options.page;
      if (typeof options.itemsPerPage === 'number' && options.itemsPerPage > 0) pagination.limit = options.itemsPerPage;
    }
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
          assignedUserId: filters.assignedUserId || undefined,
        },
      });
      contacts.value = res.data.contacts ?? (Array.isArray(res.data) ? res.data : []);
      total.value = res.data.total ?? (Array.isArray(res.data.contacts) ? res.data.contacts.length : (Array.isArray(res.data) ? res.data.length : 0));
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
    filters.assignedUserId = '';
    pagination.page = 1;
    fetchContacts();
  }

  async function toggleContactAi(contact: Contact) {
    if (!contact || contact.contactType !== 'customer') return;
    const currentActive = contact.conversations?.[0]?.aiActive ?? false;
    const newActive = !currentActive;
    try {
      await api.post(`/contacts/${contact.id}/toggle-ai`, { aiActive: newActive });
      if (contact.conversations && contact.conversations.length > 0) {
        contact.conversations[0].aiActive = newActive;
        if (!newActive) {
          contact.conversations[0].aiPaused = false;
        }
      } else {
        contact.conversations = [{
          id: '',
          aiActive: newActive,
          aiPaused: false,
        }];
      }
    } catch (err) {
      console.error('Failed to toggle AI for contact:', err);
    }
  }

  async function mergeContacts(primaryContactId: string, sourceContactIds: string[]): Promise<boolean> {
    try {
      const res = await api.post('/contacts/merge', { primaryContactId, sourceContactIds });
      await fetchContacts();
      return res.data.success ?? true;
    } catch (err) {
      console.error('Failed to merge contacts:', err);
      return false;
    }
  }

  return {
    contacts, total, loading, saving, deleting,
    filters, pagination,
    fetchContacts, fetchContact,
    createContact, updateContact, deleteContact, deleteContacts,
    mergeContacts,
    toggleContactAi,
    resetFilters,
  };
}
