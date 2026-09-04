<template>
  <v-text-field
    ref="textFieldRef"
    :model-value="displayValue"
    type="text"
    inputmode="numeric"
    :suffix="suffix"
    v-bind="$attrs"
    @input="handleInput"
    @blur="handleBlur"
  />
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: number | null;
    suffix?: string;
  }>(),
  {
    modelValue: null,
    suffix: 'đ',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: number): void;
}>();

const textFieldRef = ref<any>(null);

function formatWithDots(num?: number | null): string {
  if (num === null || num === undefined || isNaN(num)) return '';
  return new Intl.NumberFormat('vi-VN').format(num);
}

function parseRaw(val: string): number {
  const digits = val.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

const displayValue = ref<string>(formatWithDots(props.modelValue));

watch(
  () => props.modelValue,
  (newVal) => {
    const currentParsed = parseRaw(displayValue.value);
    if (newVal !== currentParsed) {
      displayValue.value = formatWithDots(newVal);
    }
  },
  { immediate: true }
);

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target) return;

  const rawInput = target.value;
  const cursor = target.selectionStart || 0;
  const digitsBeforeCursor = rawInput.slice(0, cursor).replace(/\D/g, '').length;

  const cleanDigits = rawInput.replace(/\D/g, '');
  const numericVal = cleanDigits ? parseInt(cleanDigits, 10) : 0;

  const formatted = cleanDigits ? (numericVal === 0 ? '0' : formatWithDots(numericVal)) : '';
  displayValue.value = formatted;
  emit('update:modelValue', numericVal);

  nextTick(() => {
    const inputEl = (textFieldRef.value?.$el?.querySelector('input') || target) as HTMLInputElement;
    if (inputEl && inputEl.setSelectionRange) {
      let newPos = 0;
      let digitsCount = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          digitsCount++;
        }
        if (digitsCount === digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      if (digitsBeforeCursor === 0) newPos = 0;
      if (digitsBeforeCursor >= cleanDigits.length) newPos = formatted.length;
      inputEl.setSelectionRange(newPos, newPos);
    }
  });
}

function handleBlur() {
  displayValue.value = formatWithDots(props.modelValue);
}
</script>
