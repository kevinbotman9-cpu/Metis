/**
 * METIS Internationalization
 * Message catalogues in ICU format
 * English first, with externalised strings for all UI text
 */

export type MessageKey = string;
export type MessageLocale = 'en' | 'de' | 'fr' | 'ja' | 'zh';

export interface MessageCatalogue {
  [key: string]: string;
}

export interface I18nProvider {
  locale: MessageLocale;
  messages: MessageCatalogue;
  format: (key: MessageKey, values?: Record<string, any>) => string;
}

export const EN_US: MessageCatalogue = {
  'app.title': 'METIS Console',
  'app.description': 'AI-native decision platform',

  'nav.strategies': 'Strategies',
  'nav.decisions': 'Decisions',
  'nav.approvals': 'Approvals',
  'nav.settings': 'Settings',

  'button.publish': 'Publish',
  'button.approve': 'Approve',
  'button.reject': 'Reject',
  'button.replay': 'Replay',
  'button.export': 'Export',

  'state.pass': 'Approved',
  'state.block': 'Blocked',
  'state.hold': 'Pending',
};

export function createI18n(locale: MessageLocale, catalogue?: MessageCatalogue): I18nProvider {
  return {
    locale,
    messages: catalogue || EN_US,
    format: (key: MessageKey, values?: Record<string, any>) => {
      const msg = catalogue?.[key] || EN_US[key] || key;
      if (!values) return msg;

      return msg.replace(/\{(\w+)\}/g, (_, varName) => {
        return String(values[varName] ?? `{${varName}}`);
      });
    },
  };
}

export const defaultI18n = createI18n('en', EN_US);
