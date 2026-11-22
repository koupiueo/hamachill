import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, User, Headphones, Shield, Check, Palette, Volume2, RotateCcw, SmilePlus } from 'lucide-react';
import Sidebar from './settings/Sidebar';
import ProfileTab from './settings/ProfileTab';
import VoiceTab from './settings/VoiceTab';
import AccountTab from './settings/AccountTab';
import AppearanceTab from './settings/AppearanceTab';
import ServerTab from './settings/ServerTab';
import CustomEmojiTab from './settings/CustomEmojiTab';
import { api, profileToUserState } from '../../utils/api';
import { t } from '../../i18n';

export default function SettingsScreen({ onClose, userState, setUserState, onLogout, socket }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['profile']));
  const [draftUser, setDraftUser] = useState(() => ({ ...userState }));
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleTabSelect = useCallback((id) => {
    setActiveTab(id);
    setVisitedTabs(prev => (prev.has(id) ? prev : new Set([...prev, id])));
  }, []);

  const tabs = useMemo(() => [
    { id: 'profile', label: t('settings.tabs.profile'), icon: <User size={17} />, section: 'user' },
    { id: 'appearance', label: t('settings.tabs.appearance'), icon: <Palette size={17} />, section: 'user' },
    { id: 'voice', label: t('settings.tabs.voice'), icon: <Headphones size={17} />, section: 'user' },
    { id: 'account', label: t('settings.tabs.account'), icon: <Shield size={17} />, section: 'user' },
    { id: 'server', label: t('settings.tabs.soundboard'), icon: <Volume2 size={17} />, section: 'server' },
    { id: 'custom-emojis', label: t('emoji.custom'), icon: <SmilePlus size={17} />, section: 'server' },
  ], []);

  const handleReset = useCallback(() => {
    setDraftUser({ ...userState });
    setHasChanges(false);
  }, [userState]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        displayName: draftUser.name,
        pronouns: draftUser.pronouns,
        bio: draftUser.bio,
        profileColor1: draftUser.profileColor1,
        profileColor2: draftUser.profileColor2,
        profileColor3: draftUser.profileColor3,
        profileBannerColor: draftUser.profileBannerColor,
        nameStyle: draftUser.nameStyle,
        avatarUrl: draftUser.avatarUrl,
        bannerUrl: draftUser.bannerUrl,
      });
      const synced = profileToUserState(updated.profile);
      setUserState(prev => ({
        ...prev,
        ...synced,
      }));
      setDraftUser(prev => ({
        ...prev,
        ...synced,
      }));
      setHasChanges(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2200);
    } catch (err) {
      console.error('[Settings] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[20000] bg-white dark:bg-[#2b2d31] flex flex-col md:flex-row hc-fade-in overflow-hidden">
      <Sidebar activeTab={activeTab} onTabSelect={handleTabSelect} tabs={tabs} onLogout={onLogout} />

      <div className="flex-1 bg-[#fbfbfb] dark:bg-[#2b2d31] relative flex flex-col h-full min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[740px] px-5 sm:px-8 md:px-12 py-8 md:py-12 pb-32 mx-auto relative">
            <div className={activeTab === 'profile' ? 'block hc-fade-in' : 'hidden'}>
              <ProfileTab userState={draftUser} setUserState={setDraftUser} setHasChanges={setHasChanges} />
            </div>
            {visitedTabs.has('appearance') && (
              <div className={activeTab === 'appearance' ? 'block hc-fade-in' : 'hidden'}>
                <AppearanceTab />
              </div>
            )}
            {visitedTabs.has('voice') && (
              <div className={activeTab === 'voice' ? 'block hc-fade-in' : 'hidden'}>
                <VoiceTab />
              </div>
            )}
            {visitedTabs.has('account') && (
              <div className={activeTab === 'account' ? 'block hc-fade-in' : 'hidden'}>
                <AccountTab userState={userState} onLogout={onLogout} />
              </div>
            )}
            {visitedTabs.has('server') && (
              <div className={activeTab === 'server' ? 'block hc-fade-in' : 'hidden'}>
                <ServerTab socket={socket} currentUserState={userState} />
              </div>
            )}
            {visitedTabs.has('custom-emojis') && (
              <div className={activeTab === 'custom-emojis' ? 'block hc-fade-in' : 'hidden'}>
                <CustomEmojiTab socket={socket} currentUserState={userState} />
              </div>
            )}
          </div>
        </div>

        {/* Save bar */}
        <div className="px-4 sm:px-6 pb-5 pointer-events-none sticky bottom-0 left-0 right-0 z-20">
          <div className="max-w-[740px] mx-auto">
            <div
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#1e1f22] border border-black/[0.1] dark:border-white/[0.12] shadow-lg transition-all duration-200 ${
                hasChanges || saveOk
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-16 opacity-0 pointer-events-none'
              }`}
            >
              <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                {saveOk ? t('settings.saved') : t('settings.unsaved')}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {hasChanges && !saveOk && (
                  <button
                    onClick={handleReset}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <RotateCcw size={14} /> {t('common.reset')}
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || saveOk}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold text-white transition-colors cursor-pointer disabled:opacity-70 ${
                    saveOk ? 'bg-emerald-600' : 'bg-[#248046] hover:bg-[#1a6334]'
                  }`}
                >
                  {saveOk ? <><Check size={15} /> {t('settings.savedButton')}</> : saving ? t('settings.saving') : t('settings.saveChanges')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Close */}
        <div className="absolute top-3 right-3 md:top-10 md:right-10 z-30 flex flex-col items-center gap-1">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-black/[0.14] dark:border-white/[0.18] flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer bg-white/90 dark:bg-[#1e1f22]/90"
            title={t('settings.closeEsc')}
          >
            <X size={18} />
          </button>
          <span className="hidden md:block text-[10px] font-bold text-zinc-400 dark:text-zinc-500">ESC</span>
        </div>
      </div>
    </div>
  );
}


