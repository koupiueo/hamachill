import React, { useState, useRef, Suspense } from 'react';
import { ImageIcon, Camera, Palette, X } from 'lucide-react';
import { Section, Card, InputField } from './SharedComponents';
import { getNameStyle } from '../../../utils/nameStyle';
import { t } from '../../../i18n';

const Cropper = React.lazy(() => import('react-easy-crop'));

const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });

async function getCroppedImg(imageSrc, pixelCrop) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/png');
}

const ProfileTab = ({ userState, setUserState, setHasChanges }) => {
  const [showNameModal, setShowNameModal] = useState(false);
  const [draftState, setDraftState] = useState({});
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const avatarPreview = userState.avatarUrl || null;
  const bannerPreview = userState.bannerUrl || null;

  const [cropConfig, setCropConfig] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const toDataUrl = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const isGifFile = (file) => file?.type === 'image/gif' || /\.gif$/i.test(file?.name || '');

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    if (isGifFile(file)) {
      setUserState(s => ({ ...s, avatarUrl: dataUrl }));
      setHasChanges(true);
      e.target.value = '';
      return;
    }
    setCropConfig({ imageSrc: dataUrl, type: 'avatar' });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    e.target.value = '';
  };

  const handleBannerChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    if (isGifFile(file)) {
      setUserState(s => ({ ...s, bannerUrl: dataUrl }));
      setHasChanges(true);
      e.target.value = '';
      return;
    }
    setCropConfig({ imageSrc: dataUrl, type: 'banner' });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    e.target.value = '';
  };

  return (
    <>
      <Section title={t('settings.tabs.profile')}>
      <Card>
        <div className="flex flex-col gap-6">
          {/* Banner & Avatar */}
          <div className="relative">
            <div
              className="h-40 rounded-2xl border border-zinc-950/10 overflow-hidden relative group cursor-pointer"
              style={bannerPreview
                ? { backgroundImage: `url(${bannerPreview})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { background: `linear-gradient(135deg, ${userState.profileColor1 || '#4f46e5'}, ${userState.profileColor2 || '#9333ea'}${userState.profileColor3 ? `, ${userState.profileColor3}` : ''})` }
              }
              onClick={() => bannerInputRef.current?.click()}
            >
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                <span className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold text-white border border-white/10 shadow-sm">
                  <ImageIcon size={14} /> {t('profile.changeBanner')}
                </span>
              </div>
            </div>
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerChange} />

            <div className="absolute -bottom-6 left-6 sm:left-8">
              <div className="w-24 h-24 rounded-full bg-white dark:bg-[#232428] p-1.5 shadow-sm relative group cursor-pointer"
                onClick={() => avatarInputRef.current?.click()}>
                <div className="w-full h-full rounded-full bg-zinc-100 dark:bg-[#1a1b1e] flex items-center justify-center border border-black/[0.08] dark:border-white/[0.1] overflow-hidden">
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-3xl font-black text-zinc-400">{userState.name?.[0]?.toUpperCase()}</span>
                  }
                </div>
                <div className="absolute inset-1.5 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={24} className="text-white drop-shadow-md" />
                </div>
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
          </div>

          <div className="pt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11.5px] font-bold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase px-1">
                {t('profile.nameAndStyle')}
              </label>
              <button
                type="button"
                onClick={() => { setDraftState({ ...userState }); setShowNameModal(true); }}
                className="flex items-center justify-between w-full p-4 bg-zinc-50 dark:bg-[#1a1b1e] hover:bg-zinc-100/80 dark:hover:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] rounded-xl transition-colors text-left group cursor-pointer"
              >
                <div>
                  <div className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100">
                    {userState.name || t('common.notSet')}
                  </div>
                  <div className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {t('profile.nameAndStyleHint')}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-white dark:bg-[#2b2d31] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center text-zinc-700 dark:text-zinc-200 group-hover:bg-zinc-900 dark:group-hover:bg-white group-hover:text-white dark:group-hover:text-zinc-900 transition-colors">
                  <Palette size={18} />
                </div>
              </button>
            </div>

            <InputField
              label="ID"
              value={userState.accountId || userState.id || ''}
              onChange={() => {}}
              setHasChanges={() => {}}
              readOnly
            />
            <InputField
              label={t('profile.pronouns')}
              value={userState.pronouns || ''}
              onChange={(v) => { setUserState(s => ({ ...s, pronouns: v })); setHasChanges(true); }}
              placeholder={t('profile.pronounsPlaceholder')}
              setHasChanges={setHasChanges}
            />
            <InputField
              label={t('profile.aboutMe')}
              value={userState.bio || ''}
              onChange={(v) => { setUserState(s => ({ ...s, bio: v })); setHasChanges(true); }}
              multiline
              placeholder={t('profile.bioPlaceholder')}
              setHasChanges={setHasChanges}
            />
          </div>
        </div>
      </Card>

    </Section>

      {showNameModal && (
        <div className="fixed inset-0 z-[30000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[840px] max-w-full bg-white rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col h-[600px] relative">
            <button 
              onClick={() => setShowNameModal(false)}
              className="absolute top-4 right-4 z-50 w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 bg-white/50 hover:bg-white transition-colors shadow-sm"
            >
              <X size={20} />
            </button>
            <div className="flex-1 flex overflow-hidden">
              
              {/* Left Panel: Settings */}
              <div className="w-[400px] flex-shrink-0 bg-white p-6 border-r border-zinc-200 flex flex-col justify-center">
                {/* Name Input */}
                <div className="mb-6">
                  <label className="flex items-center gap-2 text-[14px] font-bold text-zinc-800 mb-2">
                    {t('profile.changeName')}
                  </label>
                  <input
                    type="text"
                    value={draftState.name || ''}
                    onChange={(e) => setDraftState(s => ({ ...s, name: e.target.value, displayName: e.target.value }))}
                    className="w-full bg-zinc-100 border border-transparent rounded-xl p-3 text-[15px] font-medium text-zinc-900 focus:outline-none focus:border-zinc-800 focus:bg-white transition-all"
                    placeholder={t('profile.namePlaceholder')}
                  />
                </div>

                {/* Name Style */}
                <div className="mb-6">
                  <label className="flex items-center gap-2 text-[14px] font-bold text-zinc-800 mb-3">
                    {t('profile.chooseEffect')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'solid', label: t('profile.effectSolid') },
                      { id: 'gradient', label: t('common.gradient') },
                      { id: 'pop', label: t('profile.effectPop') }
                    ].map(style => {
                      const isActive = draftState.nameStyle === style.id || (!draftState.nameStyle && style.id === 'solid');
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => setDraftState(s => ({ ...s, nameStyle: style.id }))}
                          className={`relative flex items-center justify-center h-[54px] rounded-xl transition-all border
                            ${isActive ? 'border-[#5865F2] bg-[#5865F2]/5 shadow-sm ring-2 ring-[#5865F2]/20' : 'border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300'}`}
                        >
                          <span 
                            className="text-[14px] font-black tracking-tight"
                            style={getNameStyle({ ...draftState, nameStyle: style.id })}
                          >
                            {style.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Colors */}
                <div>
                  <label className="flex items-center gap-2 text-[14px] font-bold text-zinc-800 mb-3">
                    {t('profile.chooseColor')}
                  </label>
                  <div className="flex items-center gap-4">
                    {/* Main Color Picker */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">
                        {draftState.nameStyle === 'gradient' ? t('profile.startColor') : t('profile.color')}
                      </span>
                      <div className="relative group">
                        <div className="w-14 h-14 rounded-2xl shadow-sm flex items-center justify-center overflow-hidden border-2 border-zinc-200 transition-all group-hover:scale-105 group-hover:border-zinc-300 group-hover:shadow-md cursor-pointer"
                             style={{ background: draftState.profileColor1 || '#4f46e5' }}>
                          <div className="w-6 h-6 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center shadow-sm">
                            <Palette size={14} className="text-white drop-shadow-sm" />
                          </div>
                        </div>
                        <input
                          type="color"
                          value={draftState.profileColor1 || '#4f46e5'}
                          onChange={(e) => setDraftState(s => ({ ...s, profileColor1: e.target.value }))}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                    </div>
                    
                    {/* Sub Color Picker 1 */}
                    {draftState.nameStyle === 'gradient' && (
                      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">{t('profile.middleColor')}</span>
                        <div className="relative group">
                          <div className="w-14 h-14 rounded-2xl shadow-sm flex items-center justify-center overflow-hidden border-2 border-zinc-200 transition-all group-hover:scale-105 group-hover:border-zinc-300 group-hover:shadow-md cursor-pointer"
                               style={{ background: draftState.profileColor2 || '#9333ea' }}>
                            <div className="w-6 h-6 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center shadow-sm">
                              <Palette size={14} className="text-white drop-shadow-sm" />
                            </div>
                          </div>
                          <input
                            type="color"
                            value={draftState.profileColor2 || '#9333ea'}
                            onChange={(e) => setDraftState(s => ({ ...s, profileColor2: e.target.value }))}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Sub Color Picker 2 */}
                    {draftState.nameStyle === 'gradient' && (
                      <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">{t('profile.endColor')}</span>
                        <div className="relative group">
                          <div className="w-14 h-14 rounded-2xl shadow-sm flex items-center justify-center overflow-hidden border-2 border-zinc-200 transition-all group-hover:scale-105 group-hover:border-zinc-300 group-hover:shadow-md cursor-pointer"
                               style={{ background: draftState.profileColor3 || '#f43f5e' }}>
                            <div className="w-6 h-6 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center shadow-sm">
                              <Palette size={14} className="text-white drop-shadow-sm" />
                            </div>
                          </div>
                          <input
                            type="color"
                            value={draftState.profileColor3 || '#f43f5e'}
                            onChange={(e) => setDraftState(s => ({ ...s, profileColor3: e.target.value }))}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex-1"></div>
                  </div>
                </div>
              </div>

              {/* Right Panel: Preview Area */}
              <div className="flex-1 bg-[#d6dcd1] relative flex items-center justify-center p-6 overflow-hidden border-l border-zinc-200">
                <div className="w-full max-w-[340px] flex flex-col gap-6 relative z-10">
                  {/* Mock Profile Card */}
                  <div className="bg-white rounded-2xl overflow-hidden shadow-2xl border border-zinc-200 w-full flex flex-col">
                    <div className="h-[120px] relative" style={draftState.bannerUrl ? { backgroundImage: `url(${draftState.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(135deg, ${draftState.profileColor1 || '#4f46e5'}, ${draftState.profileColor2 || '#9333ea'}${draftState.profileColor3 ? `, ${draftState.profileColor3}` : ''})` }}>
                      <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center text-white/80">
                        <X size={16} />
                      </div>
                    </div>
                    <div className="relative px-4 pb-4">
                      <div className="absolute -top-12 left-5 w-24 h-24 rounded-full border-[6px] border-white bg-zinc-100 flex items-center justify-center overflow-hidden shadow-sm">
                        {draftState.avatarUrl ? (
                          <img src={draftState.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl font-black text-zinc-300">{(draftState.name || 'Y')?.[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="pt-14">
                        <div className="text-[24px] font-black tracking-tight" style={getNameStyle(draftState)}>
                          {draftState.name?.trim() ? draftState.name : 'Your Name'}
                        </div>
                        <div className="text-[14px] text-zinc-500 font-medium mt-1">
                          {draftState.pronouns || 'pronouns'}
                        </div>
                      </div>
                      
                      <div className="w-full h-[1px] bg-zinc-100 my-4" />
                      
                      <div>
                        <div className="text-[12px] font-bold text-zinc-400 mb-2">{t('profile.aboutMe')}</div>
                        <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4 text-[14px] text-zinc-700 min-h-[80px]">
                          {draftState.bio || t('profile.noBio')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mock Chat Message */}
                  <div className="bg-white rounded-2xl p-4 shadow-xl flex gap-3 items-start border border-zinc-200">
                    <div className="w-10 h-10 rounded-full bg-zinc-200 flex-shrink-0 overflow-hidden mt-1">
                      {draftState.avatarUrl ? (
                        <img src={draftState.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-black text-zinc-400 text-sm">{(draftState.name || 'Y')?.[0]?.toUpperCase()}</div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-[15px] font-bold" style={getNameStyle(draftState)}>
                          {draftState.name?.trim() ? draftState.name : 'Your Name'}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-medium">20:38</span>
                      </div>
                      <div className="text-[14px] text-zinc-800 leading-relaxed">
                        {t('profile.previewText')}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Bottom Footer */}
            <div className="h-[72px] bg-zinc-50 border-t border-zinc-200 flex items-center justify-end px-6 gap-3 shrink-0">
              <button
                onClick={() => setShowNameModal(false)}
                className="px-6 py-2 rounded text-[14px] font-bold text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  setUserState(draftState);
                  setHasChanges(true);
                  setShowNameModal(false);
                }}
                className="px-6 py-2 rounded text-[14px] font-bold text-white bg-[#5865F2] hover:bg-[#4752C4] transition-colors shadow-sm"
              >
                {t('common.apply')}
              </button>
            </div>
          </div>
        </div>
      )}
      {cropConfig && (
        <div className="fixed inset-0 z-[40000] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="w-[600px] max-w-full bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-white font-bold text-[15px]">{cropConfig.type === 'avatar' ? t('profile.cropAvatar') : t('profile.cropBanner')}</h3>
              <button onClick={() => setCropConfig(null)} className="text-white/50 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="relative w-full h-[400px] bg-black/50">
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-white/60 text-sm">{t('common.loading')}</div>}>
                <Cropper
                  image={cropConfig.imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={cropConfig.type === 'avatar' ? 1 : 16/9}
                  cropShape={cropConfig.type === 'avatar' ? 'round' : 'rect'}
                  showGrid={true}
                  onCropChange={setCrop}
                  onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                  onZoomChange={setZoom}
                />
              </Suspense>
            </div>
            <div className="p-4 border-t border-white/10 bg-zinc-900 flex justify-between items-center gap-4">
              <div className="flex-1 flex items-center px-4">
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-[120px] accent-[#5865F2]"
                />
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setCropConfig(null)} className="px-4 py-2 rounded font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors text-[14px]">
                  {t('common.cancel')}
                </button>
                <button onClick={async () => {
                  const croppedImage = await getCroppedImg(cropConfig.imageSrc, croppedAreaPixels);
                  if (cropConfig.type === 'avatar') {
                    setUserState(s => ({ ...s, avatarUrl: croppedImage }));
                  } else {
                    setUserState(s => ({ ...s, bannerUrl: croppedImage }));
                  }
                  setHasChanges(true);
                  setCropConfig(null);
                }} className="px-4 py-2 rounded font-bold text-white bg-[#5865F2] hover:bg-[#4752C4] transition-colors shadow-sm text-[14px]">
                  {t('common.apply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(ProfileTab);
