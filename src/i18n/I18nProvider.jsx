import { useMemo } from 'react';
import { I18nContext } from './context';
import { t, getLanguage, setLanguage, getSavedLanguage, LANGUAGES } from './index';

export default function I18nProvider({ children }) {
  const value = useMemo(() => ({
    t,
    lang: getLanguage(),
    savedLang: getSavedLanguage(),
    setLang: setLanguage,
    languages: LANGUAGES,
  }), []);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
