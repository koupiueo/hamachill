import { useState, useRef, useEffect } from 'react';
import { Upload, Music, Trash2, X, RefreshCw, Edit2, Play } from 'lucide-react';
import { api } from '../../utils/api';
import { t, serverError } from '../../i18n';

export default function CustomSoundboard({ socket, currentUserState, onOpenMenu }) {
  const [categories, setCategories] = useState([]);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [soundName, setSoundName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);

  const fetchSounds = async () => {
    try {
      const data = await api.get(`/soundboards?t=${Date.now()}`);
      setCategories(data);
    } catch (e) {
      console.error('Failed to fetch soundboards:', e);
    }
  };

  useEffect(() => {
    fetchSounds();

    if (socket) {
      const handleUpdate = () => fetchSounds();
      socket.on('soundboard_updated', handleUpdate);
      return () => socket.off('soundboard_updated', handleUpdate);
    }
  }, [socket]);

  const handleDelete = async (file) => {
    if (!window.confirm(t('soundboard.confirmDelete'))) return;
    try {
      await api.post('/soundboards/delete', { file });
      // The socket event will trigger a refetch, but we can also manually refetch
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
      const audio = new Audio(`/soundboards/${file}`);
      audio.volume = 0.5;
      audio.play().catch(err => console.error('Preview error:', err));
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
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
    
    const formData = new FormData();
    formData.append('sound', fileToUpload);
    formData.append('name', soundName);

    const token = localStorage.getItem('hc_token');
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/soundboards/upload', true);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        setUploadProgress(percentComplete);
      }
    };
    
    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(0);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setSuccessMessage(t('soundboard.uploadSuccess', { soundName }));
          setFileToUpload(null);
          setSoundName('');
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          setError(serverError(data, 'common.uploadFailed'));
        }
      } catch (err) {
        setError(t('errors.server'));
      }
    };
    
    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(0);
      setError(t('errors.network'));
    };
    
    xhr.send(formData);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white relative overflow-hidden">
      {/* Header */}
      <header className="h-14 shrink-0 flex flex-col justify-center px-4 border-b border-zinc-950/5 relative z-10 bg-white">
        <div className="flex items-center gap-3">
          <button className="md:hidden p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors" onClick={onOpenMenu}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <Music className="text-zinc-400" size={20} />
          <h2 className="text-base font-bold text-zinc-900">{t('channels.customSoundboard')}</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 pb-32 custom-scrollbar relative">
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
          
          {/* Upload Section */}
          <div className="bg-zinc-50 rounded-2xl p-6 border border-zinc-950/10">
            <h3 className="text-lg font-bold text-zinc-800 mb-2">{t('soundboard.addSound')}</h3>
            <p className="text-sm text-zinc-500 mb-6">{t('soundboard.addSoundDescription')}</p>
            
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4 border border-red-100">
                {error}
              </div>
            )}
            
            {successMessage && (
              <div className="bg-emerald-50 text-emerald-600 text-sm p-3 rounded-lg mb-4 border border-emerald-100">
                {successMessage}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-1">{t('soundboard.audioFile')}</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file" 
                    accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" 
                    onChange={handleFileChange}
                    className="hidden"
                    ref={fileInputRef}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white border border-zinc-950/10 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <Upload size={16} />
                    {t('common.chooseFile')}
                  </button>
                  <span className="text-sm text-zinc-500 truncate max-w-[200px]">
                    {fileToUpload ? fileToUpload.name : t('common.noFileChosen')}
                  </span>
                </div>
              </div>

              {fileToUpload && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-sm font-semibold text-zinc-700 mb-1">{t('soundboard.soundName')}</label>
                  <input 
                    type="text" 
                    value={soundName}
                    onChange={(e) => setSoundName(e.target.value)}
                    placeholder={t('soundboard.soundNamePlaceholder')}
                    className="w-full max-w-md px-4 py-2 bg-white border border-zinc-950/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                  />
                  
                  <div className="mt-6">
                    {uploading ? (
                      <div className="w-full max-w-md bg-zinc-200 rounded-full h-3 mb-2 overflow-hidden relative">
                        <div 
                          className="bg-indigo-500 h-3 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                        <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-md">
                          {Math.round(uploadProgress)}%
                        </div>
                      </div>
                    ) : null}
                    
                    <button 
                      onClick={handleUpload}
                      disabled={uploading || !soundName}
                      className="px-6 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/20 hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                      {uploading ? t('common.uploading') : t('common.upload')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Soundboard List Section */}
          <div className="bg-white rounded-2xl border border-zinc-950/10 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-zinc-950/10 bg-zinc-50/50">
              <h3 className="text-base font-bold text-zinc-800">{t('soundboard.registered')}</h3>
              <p className="text-xs text-zinc-500 mt-1">{t('soundboard.registeredDescription')}</p>
            </div>
            
            <div className="divide-y divide-zinc-950/5">
              {categories.length === 0 ? (
                <div className="p-6 text-center text-sm text-zinc-500">
                  {t('soundboard.empty')}
                </div>
              ) : (
                categories.map(cat => (
                  <div key={cat.owner} className="p-4">
                    <h4 className="text-sm font-bold text-zinc-600 mb-3">{cat.owner}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {cat.files.map(file => {
                        const displayName = file.split('/').pop().replace(/\.[^/.]+$/, "");
                        return (
                          <div key={file} className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-50 border border-transparent hover:border-zinc-950/5 transition-all group">
                            <span className="text-sm font-medium text-zinc-700 truncate pr-4">{displayName}</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handlePreview(file)}
                                className="p-1 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"
                                title={t('soundboard.preview')}
                              >
                                <Play size={14} />
                              </button>
                              <button 
                                onClick={() => handleRename(file)}
                                className="p-1 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                title={t('common.rename')}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDelete(file)}
                                className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title={t('common.delete')}
                              >
                                <Trash2 size={14} />
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
          </div>

        </div>
      </div>
    </div>
  );
}
