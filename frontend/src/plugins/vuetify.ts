import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { h } from 'vue';
import * as LucideIcons from 'lucide-vue-next';

// Utility to convert kebab-case to PascalCase
const toPascalCase = (str: string) => {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
};

const lucideSet = {
  component: (props: any) => {
    const { icon, tag = 'i', class: className, style, ...rest } = props ?? {};
    let iconName = typeof icon === 'string' ? icon : '';

    if (iconName.startsWith('lucide-')) {
      iconName = iconName.replace('lucide-', '');
      const pascalName = toPascalCase(iconName) as keyof typeof LucideIcons;
      const IconComponent = (LucideIcons[pascalName] || LucideIcons.HelpCircle) as any;
      const iconStyle = {
        ...style,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      };

      return h(tag, { class: className, style, ...rest }, [
        h(IconComponent, {
          class: 'v-icon__svg',
          size: '100%',
          style: iconStyle,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      ]);
    }

    return h('i', {
      class: ['mdi', iconName, className],
      ...rest,
    });
  },
};

export const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'lucide',
    sets: {
      lucide: lucideSet,
    },
  },
  theme: {
    defaultTheme: localStorage.getItem('theme') || 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#ffffff',
          surface: '#ffffff',
          'surface-variant': '#f4f5f7',
          'surface-light': '#f0f2f5',
          primary: '#0068ff',
          secondary: '#4b5563',
          accent: '#005ae0',
          error: '#ef4444',
          warning: '#f59e0b',
          success: '#10b981',
          info: '#0068ff',
          'on-background': '#111827',
          'on-surface': '#111827',
          'on-primary': '#ffffff',
          'on-surface-variant': '#1e293b',
        },
      },
      dark: {
        dark: true,
        colors: {
          background: '#18191a',
          surface: '#242526',
          'surface-variant': '#2b2d30',
          'surface-light': '#3a3b3c',
          primary: '#0068ff',
          secondary: '#9ca3af',
          accent: '#2563eb',
          error: '#ef4444',
          warning: '#f59e0b',
          success: '#10b981',
          info: '#38bdf8',
          'on-background': '#e4e6eb',
          'on-surface': '#e4e6eb',
          'on-primary': '#ffffff',
          'on-surface-variant': '#f8fafc',
        },
      },
    },
  },
  defaults: {
    VBtn: { variant: 'flat', rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VSelect: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VAutocomplete: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VTextarea: { variant: 'outlined', density: 'compact', rounded: 'lg' },
    VCard: { rounded: 'lg', variant: 'flat' },
    VChip: { rounded: 'lg', size: 'small' },
    VDialog: { maxWidth: 600 },
  },
});
