import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Upload, Trash2, RefreshCw, Edit2, Play, Square, Volume2, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { Section, Card } from './SharedComponents';
import { api } from '../../../utils/api';
import { t, serverError } from '../../../i18n';

function ServerTab({ socket }) {
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [soundName, setSoundName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [previewingFile, setPreviewingFile] = useState(null);
  const fileInputRef = useRef(null);
  const currentAudioRef = useRef(null);

  const fetchSounds = useCallback(async () => {
    try {
      const data = await api.get(`/soundboards?t=${Date.now()}`);
      setCategories(data || []);
    } catch (e) {
      console.error('Failed to fetch soundboards:', e);
    }
  }, []);

  useEffect(() => {
    fetchSounds();

    if (socket) {
      const handleUpdate = () => fetchSounds();
      socket.on('soundboard_updated', handleUpdate);
      return () => {
        socket.off('soundboard_updated', handleUpdate);
      };
    }
  }, [socket, fetchSounds]);

  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map(cat => ({
        ...cat,
        files: cat.files.filter(f => {
          const name = f.split('/').pop().replace(/\.[^/.]+$/, '').toLowerCase();
          return name.includes(q) || cat.owner.toLowerCase().includes(q);
        })
      }))
      .filter(cat => cat.files.length > 0);
  }, [categories, searchQuery]);

  const handleDelete = async (file) => {
    if (!window.confirm(t('soundboard.confirmDelete'))) return;
    try {
      await api.post('/soundboards/delete', { file });
      fetchSounds();
    } catch (err) {
      alert(t('soundboard.deleteFailed') + serverError(err, 'common.error'));
    }
  };

  const handleRename = async (file) => {
    const currentName = file.split('/').pop().replace(/\.[^/.]+$/, "");
    const newName = window.prompt(t('soundboard.promptNewName'), currentName);
    if (!newName || newName.trim() === '' || newName === currentName) return;

    try {
      await api.post('/soundboards/rename', { file, newName: newName.trim() });
      fetchSounds();
    } catch (err) {
      alert(t('soundboard.renameFailed') + serverError(err, 'common.error'));
    }
  };

  const handlePreview = (file) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (previewingFile === file) {
        setPreviewingFile(null);
        return;
      }
      const audio = new Audio(`/soundboards/${file}`);
      audio.volume = 0.5;
      currentAudioRef.current = audio;
      setPreviewingFile(file);
      audio.onended = () => {
        setPreviewingFile(null);
        currentAudioRef.current = null;
      };
      audio.play().catch(err => {
        console.error('Preview error:', err);
        setPreviewingFile(null);
      });
    } catch (err) {
      console.error(err);
      setPreviewingFile(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(t('soundboard.fileTooLarge5mb'));
      return;
    }
    if (!['audio/mpeg', 'audio/wav', 'audio/ogg'].includes(file.type) && !file.name.match(/\.(mp3|wav|ogg)$/i)) {
      setError(t('soundboard.onlyAudioFormats'));
      return;
    }
    setError('');
    setSuccessMessage('');
    setFileToUpload(file);
    setSoundName(file.name.replace(/\.[^/.]+$/, ""));
  };

  const handleUpload = () => {
    if (!fileToUpload || !soundName) return;
    setUploading(true);
    setUploadProgress(0);
    setError('');
    setSuccessMessage('');

    const formData = new FormData();
    formData.append('sound', fileToUpload);
    formData.append('name', soundName);

    const token = localStorage.getItem('hc_token');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/soundboards/upload', true);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        setSuccessMessage(t('serverSettings.soundAdded'));
        setFileToUpload(null);
        setSoundName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchSounds();
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setError(serverError(res, 'common.uploadFailedDot'));
        } catch {
          setError(t('common.uploadFailedDot'));
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError(t('errors.networkDot'));
    };

    xhr.send(formData);
  };

  return (
    <Section title={t('settings.serverSettings')}>
      {/* Soundboard Upload Card */}
      <Card 
        title={t('serverSettings.addSound')} 
        description={t('serverSettings.addSoundDesc')}
      >
        <div className="flex flex-col gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".mp3,.wav,.ogg,audio/*"
            className="hidden"
          />

          {!fileToUpload ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-200 dark:border-white/[0.12] hover:border-zinc-400 dark:hover:border-white/[0.25] rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-[#1a1b1e] hover:bg-zinc-50 dark:hover:bg-white/[0.03] group"
            >
              <div className="w-11 h-11 rounded-full bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:scale-105 transition-transform mb-2.5">
                <Upload size={20} />
              </div>
              <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">{t('serverSettings.clickToChoose')}</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{t('serverSettings.formats')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 bg-zinc-50 dark:bg-[#1a1b1e] p-4 rounded-xl border border-zinc-200/80 dark:border-white/[0.08]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-white/[0.08] flex items-center justify-center text-zinc-700 dark:text-zinc-200">
                    <Volume2 size={18} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{fileToUpload.name}</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 block">{(fileToUpload.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                </div>
                <button 
                  onClick={() => { setFileToUpload(null); setSoundName(''); }}
                  className="text-xs font-bold text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-2 uppercase tracking-wider">{t('serverSettings.displayName')}</label>
                <input
                  type="text"
                  value={soundName}
                  onChange={(e) => setSoundName(e.target.value)}
                  placeholder={t('soundboard.soundNamePlaceholder')}
                  className="w-full bg-white dark:bg-[#232428] border border-zinc-200 dark:border-white/[0.1] rounded-xl px-4 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition-colors"
                />
              </div>

              {uploading && (
                <div className="w-full bg-zinc-200 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                  <div className="bg-zinc-800 dark:bg-white h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !soundName.trim()}
                  className="px-5 py-2 bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {uploading ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                  {uploading ? t('common.uploading') : t('common.upload')}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Soundboard List Card */}
      <Card
        title={t('soundboard.registered')}
        description={t('serverSettings.listDesc')}
      >
        <div className="flex flex-col gap-4">
          {categories.length > 0 && (
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('serverSettings.searchPlaceholder')}
                className="w-full bg-zinc-50 dark:bg-[#1a1b1e] border border-black/[0.08] dark:border-white/[0.1] rounded-xl pl-9 pr-3.5 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition-colors"
              />
            </div>
          )}
          {filteredCategories.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-400">
              {categories.length === 0 ? t('serverSettings.noSounds') : t('serverSettings.noMatches')}
            </div>
          ) : (
            filteredCategories.map(cat => (
              <div key={cat.owner} className="flex flex-col gap-2">
                <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase px-1">
                  {cat.owner} ({cat.files.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.files.map(file => {
                    const displayName = file.split('/').pop().replace(/\.[^/.]+$/, "");
                    const isPlaying = previewingFile === file;
                    return (
                      <div 
                        key={file} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                          isPlaying 
                            ? 'bg-zinc-100 dark:bg-white/[0.1] border-zinc-300 dark:border-white/20' 
                            : 'bg-zinc-50/70 dark:bg-[#1a1b1e] hover:bg-zinc-100/70 dark:hover:bg-white/[0.05] border-black/[0.07] dark:border-white/[0.08]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <button
                            onClick={() => handlePreview(file)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                              isPlaying 
                                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900' 
                                : 'bg-black/[0.06] dark:bg-white/[0.08] hover:bg-black/[0.12] dark:hover:bg-white/[0.14] text-zinc-700 dark:text-zinc-200'
                            }`}
                            title={isPlaying ? t('common.stop') : t('serverSettings.preview')}
                          >
                            {isPlaying ? <Square size={11} className="fill-current" /> : <Play size={13} />}
                          </button>
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 truncate">{displayName}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleRename(file)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] rounded-lg transition-colors cursor-pointer"
                            title={t('common.rename')}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(file)}
                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                            title={t('common.delete')}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </Section>
  );
}

export default React.memo(ServerTab);
