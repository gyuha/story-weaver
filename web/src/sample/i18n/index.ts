import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enSample from './locales/en/sample.json';
import koSample from './locales/ko/sample.json';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      ko: { sample: koSample },
      en: { sample: enSample },
    },
    lng: 'ko',
    fallbackLng: 'en',
    defaultNS: 'sample',
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;
