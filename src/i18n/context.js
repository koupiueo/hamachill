import { createContext, useContext } from 'react';
import { t, getLanguage, setLanguage, getSavedLanguage, LANGUAGES } from './index';

export const I18nContext = createContext({
  t, lang: getLanguage(), savedLang: getSavedLanguage(), setLang: setLanguage, languages: LANGUAGES,
});

/** { t, lang, savedLang, setLang, languages } */
export const useI18n = () => useContext(I18nContext);
/** The translate function. Plain `import { t } from '.../i18n'` works too (outside components as well). */
export const useT = () => useContext(I18nContext).t;
