/**
 * Customer Fact Integrity Model for AI Auto Chat.
 * Enforces strict distinction between CONFIRMED, UNKNOWN, and INFERRED facts.
 * Handles Source of Truth tracking, confidence scoring, and conflict resolution.
 */

export type FactStatus = 'CONFIRMED' | 'UNKNOWN' | 'INFERRED';
export type FactSource = 'customer_message' | 'crm' | 'inference' | 'system';

export interface FactItem<T> {
  value: T | null;
  status: FactStatus;
  source: FactSource;
  confidence: number;
  updatedAt: string;
}

export function createEmptyFact<T>(defaultValue: T | null = null): FactItem<T> {
  return {
    value: defaultValue,
    status: defaultValue !== null ? 'CONFIRMED' : 'UNKNOWN',
    source: 'system',
    confidence: defaultValue !== null ? 1.0 : 0.0,
    updatedAt: new Date().toISOString(),
  };
}

export function createConfirmedFact<T>(value: T, source: FactSource = 'customer_message', confidence = 1.0): FactItem<T> {
  return {
    value,
    status: 'CONFIRMED',
    source,
    confidence,
    updatedAt: new Date().toISOString(),
  };
}

export function createInferredFact<T>(value: T, source: FactSource = 'inference', confidence = 0.5): FactItem<T> {
  return {
    value,
    status: 'INFERRED',
    source,
    confidence,
    updatedAt: new Date().toISOString(),
  };
}

export interface StructuredPetProfile {
  type: FactItem<'dog' | 'cat' | 'all'>;
  breed: FactItem<string>;
  age_months: FactItem<number>;
  weight_kg: FactItem<number>;
  size: FactItem<'small' | 'medium' | 'large'>;
  gender: FactItem<'male' | 'female'>;
  health_condition: FactItem<string>;
  allergies: FactItem<string[]>;
  texture_preference: FactItem<'soft' | 'hard' | 'chewy' | 'crispy'>;
  food_preference: FactItem<string>;
  special_notes: FactItem<string>;
}

export interface StructuredCustomerProfile {
  name: FactItem<string>;
  phone: FactItem<string>;
  address: FactItem<string>;
  customer_type: FactItem<'retail' | 'wholesale'>;
  budget: FactItem<string>;
  buying_intent: FactItem<'high' | 'medium' | 'low' | 'browsing'>;
}

export function createDefaultPetProfile(): StructuredPetProfile {
  return {
    type: createEmptyFact<'dog' | 'cat' | 'all'>('dog'),
    breed: createEmptyFact<string>(),
    age_months: createEmptyFact<number>(),
    weight_kg: createEmptyFact<number>(),
    size: createEmptyFact<'small' | 'medium' | 'large'>(),
    gender: createEmptyFact<'male' | 'female'>(),
    health_condition: createEmptyFact<string>(),
    allergies: createEmptyFact<string[]>([]),
    texture_preference: createEmptyFact<'soft' | 'hard' | 'chewy' | 'crispy'>(),
    food_preference: createEmptyFact<string>(),
    special_notes: createEmptyFact<string>(),
  };
}

export function createDefaultCustomerProfile(): StructuredCustomerProfile {
  return {
    name: createEmptyFact<string>(),
    phone: createEmptyFact<string>(),
    address: createEmptyFact<string>(),
    customer_type: createEmptyFact<'retail' | 'wholesale'>('retail'),
    budget: createEmptyFact<string>(),
    buying_intent: createEmptyFact<'high' | 'medium' | 'low' | 'browsing'>('medium'),
  };
}

/**
 * Hydrates legacy or plain JSON petInfo into strict StructuredPetProfile
 */
export function hydratePetProfile(raw: any): StructuredPetProfile {
  const profile = createDefaultPetProfile();
  if (!raw || typeof raw !== 'object') return profile;

  // If already structured
  if (raw.breed && typeof raw.breed === 'object' && 'status' in raw.breed) {
    return {
      type: raw.type || profile.type,
      breed: raw.breed || profile.breed,
      age_months: raw.age_months || profile.age_months,
      weight_kg: raw.weight_kg || profile.weight_kg,
      size: raw.size || profile.size,
      gender: raw.gender || profile.gender,
      health_condition: raw.health_condition || profile.health_condition,
      allergies: raw.allergies || profile.allergies,
      texture_preference: raw.texture_preference || profile.texture_preference,
      food_preference: raw.food_preference || profile.food_preference,
      special_notes: raw.special_notes || profile.special_notes,
    };
  }

  // If legacy flat object { breed: 'Poodle', age_months: 4, ... }
  if (raw.type) profile.type = createConfirmedFact(raw.type, 'crm');
  if (raw.breed) profile.breed = createConfirmedFact(raw.breed, 'crm');
  if (typeof raw.age_months === 'number') profile.age_months = createConfirmedFact(raw.age_months, 'crm');
  if (typeof raw.weight_kg === 'number') profile.weight_kg = createConfirmedFact(raw.weight_kg, 'crm');
  if (raw.size) profile.size = createConfirmedFact(raw.size, 'crm');
  if (raw.allergies && Array.isArray(raw.allergies) && raw.allergies.length > 0) {
    profile.allergies = createConfirmedFact(raw.allergies, 'crm');
  }
  if (raw.texture_preference) profile.texture_preference = createConfirmedFact(raw.texture_preference, 'crm');

  return profile;
}

/**
 * Hydrates legacy or plain JSON customerProfile into strict StructuredCustomerProfile
 */
export function hydrateCustomerProfile(raw: any, contact?: any): StructuredCustomerProfile {
  const profile = createDefaultCustomerProfile();

  if (contact) {
    if (contact.fullName) profile.name = createConfirmedFact(contact.fullName, 'crm');
    if (contact.phone) profile.phone = createConfirmedFact(contact.phone, 'crm');
    if (contact.address) profile.address = createConfirmedFact(contact.address, 'crm');
  }

  if (!raw || typeof raw !== 'object') return profile;

  if (raw.name && typeof raw.name === 'object' && 'status' in raw.name) {
    return {
      name: raw.name || profile.name,
      phone: raw.phone || profile.phone,
      address: raw.address || profile.address,
      customer_type: raw.customer_type || profile.customer_type,
      budget: raw.budget || profile.budget,
      buying_intent: raw.buying_intent || profile.buying_intent,
    };
  }

  if (raw.fullName || raw.name) profile.name = createConfirmedFact(raw.fullName || raw.name, 'customer_message');
  if (raw.phone) profile.phone = createConfirmedFact(raw.phone, 'customer_message');
  if (raw.address) profile.address = createConfirmedFact(raw.address, 'customer_message');

  return profile;
}

/**
 * Source priority rules: customer_message > crm > inference > system
 */
const SOURCE_PRIORITY: Record<FactSource, number> = {
  customer_message: 4,
  crm: 3,
  inference: 2,
  system: 1,
};

/**
 * Safely updates a FactItem, enforcing source priority and anti-hallucination rules.
 */
export function updateFact<T>(
  current: FactItem<T>,
  incoming: Partial<FactItem<T>>,
  isCorrection = false
): FactItem<T> {
  if (incoming.value === undefined && incoming.status === undefined) {
    return current;
  }

  const newSource = incoming.source || 'customer_message';
  const newStatus = incoming.status || (incoming.value !== null ? 'CONFIRMED' : 'UNKNOWN');

  // If correction explicitly flagged by customer (e.g. "À nhầm, bé 3kg"), allow overwrite
  if (isCorrection && newSource === 'customer_message') {
    return {
      value: incoming.value !== undefined ? (incoming.value as T) : current.value,
      status: newStatus,
      source: newSource,
      confidence: incoming.confidence ?? 1.0,
      updatedAt: new Date().toISOString(),
    };
  }

  // Check source priority
  const currentPriority = SOURCE_PRIORITY[current.source] || 0;
  const incomingPriority = SOURCE_PRIORITY[newSource] || 0;

  // Never downgrade a CONFIRMED fact to INFERRED from a lower priority source
  if (current.status === 'CONFIRMED' && incomingPriority < currentPriority) {
    return current;
  }

  // If current is UNKNOWN or incoming has equal/higher priority, update
  if (current.status === 'UNKNOWN' || incomingPriority >= currentPriority) {
    return {
      value: incoming.value !== undefined ? (incoming.value as T) : current.value,
      status: newStatus,
      source: newSource,
      confidence: incoming.confidence ?? (newStatus === 'CONFIRMED' ? 1.0 : 0.5),
      updatedAt: new Date().toISOString(),
    };
  }

  return current;
}
