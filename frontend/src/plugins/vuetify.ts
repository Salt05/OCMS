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
          background: '#f8f8f6',
          surface: '#ffffff',
          'surface-variant': '#efeeeb',
          'surface-light': '#efeeeb',
          primary: '#121212',
          secondary: '#373734',
          accent: '#d97757',
          error: '#8b4513',
          warning: '#7b7974',
          success: '#373734',
          info: '#373734',
          'on-background': '#121212',
          'on-surface': '#121212',
          'on-primary': '#f8f8f6',
        },
      },
      dark: {
        dark: true,
        colors: {
          background: '#1a1a18',
          surface: '#252522',
          'surface-variant': '#2e2e2b',
          'surface-light': '#373734',
          primary: '#efeeeb',
          secondary: '#b7b7b5',
          accent: '#d97757',
          error: '#c4956a',
          warning: '#9c9a92',
          success: '#b7b7b5',
          info: '#b7b7b5',
          'on-background': '#efeeeb',
          'on-surface': '#efeeeb',
          'on-primary': '#121212',
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
