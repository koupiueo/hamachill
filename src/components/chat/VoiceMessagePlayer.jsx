import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Play, Pause, Plus, Loader2, Volume2, VolumeX, Music } from 'lucide-react';
import ModalWrapper from '../ui/ModalWrapper';
import { t } from '../../i18n';

const VoiceMessagePlayer = forwardRef(({ src, isUploading }, ref) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('hc_soundboard_volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [waveform, setWaveform] = useState([]);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [soundName, setSoundName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const audioRef = useRef(null);

  useImperativeHandle(ref, () => ({
    openSoundboardModal: () => setShowAddModal(true)
  }));

  useEffect(() => {
    if (!src || src.startsWith('blob:') || isUploading) return;
    let isMounted = true;
    
    const fetchWaveform = async () => {
      try {
        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        
        const bars = 40;
        const step = Math.ceil(channelData.length / bars);
        const peaks = [];
        for (let i = 0; i < bars; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const datum = Math.abs(channelData[(i * step) + j] || 0);
            if (datum > max) max = datum;
          }
          peaks.push(max);
        }
        
        // Normalize peaks
        const globalMax = Math.max(...peaks, 0.01);
        const normalized = peaks.map(p => p / globalMax);
        if (isMounted) setWaveform(normalized);
      } catch (err) {
        console.error("Waveform error", err);
      }
    };
    fetchWaveform();
    
    return () => { isMounted = false; };
  }, [src, isUploading]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = isMuted ? 0 : volume;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const onLoadedMetadata = () => {
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    audioRef.current.currentTime = newTime;
    setProgress(percentage * 100);
  };

  const formatTime = (time) => {
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) setIsMuted(false);
    localStorage.setItem('hc_soundboard_volume', val.toString());
  };

  const handleAddToSoundboard = async () => {
    if (!soundName.trim() || !src) return;
    setIsAdding(true);
    
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      
      const formData = new FormData();
      const ext = src.split('.').pop().split('?')[0] || 'webm';
      const file = new File([blob], `${soundName}.${ext}`, { type: blob.type });
      formData.append('sound', file);
      formData.append('name', soundName);

      const token = localStorage.getItem('hc_token');
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/soundboards/upload', true);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      
      xhr.onload = () => {
        setIsAdding(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          setShowAddModal(false);
          setSoundName('');
        } else {
          alert(t('voiceMessage.addFailed'));
        }
      };
      
      xhr.onerror = () => {
        setIsAdding(false);
        alert(t('errors.generic'));
      };
      
      xhr.send(formData);
    } catch (err) {
      console.error(err);
      setIsAdding(false);
      alert(t('voiceMessage.fetchFailed'));
    }
  };

  return (
    <div className={`relative group inline-block ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-300 dark:border-white/10 rounded-full px-2 py-1 w-[240px] h-[40px] shadow-sm transition-colors">
        <button 
          onClick={togglePlay}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-800 dark:bg-[#5865F2] dark:hover:bg-[#4752C4] text-white flex items-center justify-center transition-colors shadow-sm"
        >
          {isPlaying ? <Pause size={14} className="fill-current" /> : <Play size={14} className="fill-current ml-1" />}
        </button>
        
        {/* Real Waveform / Progress */}
        <div 
          className="flex-1 h-8 flex items-center cursor-pointer relative group/progress gap-1"
          onClick={handleSeek}
        >
          {waveform.length > 0 ? (
            <div className="absolute inset-0 flex items-center gap-1 pointer-events-none">
              {waveform.map((peak, i) => {
                const p = (i / waveform.length) * 100;
                const isPlayed = progress >= p;
                const height = Math.max(15, peak * 100) + '%';
                return (
                  <div 
                    key={i} 
                    className={`flex-1 rounded-full ${isPlayed ? 'bg-zinc-700 dark:bg-white' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                    style={{ height }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="absolute inset-x-0 h-1.5 bg-zinc-300 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-zinc-700 dark:bg-[#5865F2] rounded-full transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
        
        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium flex-shrink-0 w-[34px] text-right tabular-nums">
          {formatTime(currentTime)}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 border-l border-zinc-300 dark:border-zinc-700 pl-2 ml-1">
          {/* Volume with hover slider */}
          <div className="relative group/vol flex items-center justify-center">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="w-6 h-6 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md transition-colors z-10"
            >
              {isMuted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
            
            <div className="absolute top-1/2 -translate-y-1/2 right-full mr-2 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl opacity-0 invisible group-hover/vol:opacity-100 group-hover/vol:visible flex items-center gap-2 z-20 transition-all duration-200 transform translate-x-2 group-hover/vol:translate-x-0">
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1.5 appearance-none bg-zinc-200 dark:bg-zinc-800 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-white dark:[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-700 dark:[&::-webkit-slider-thumb]:border-[#5865F2] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${document.documentElement.getAttribute('data-theme') === 'dark' ? '#5865F2' : '#3f3f46'} ${(isMuted ? 0 : volume) * 100}%, transparent ${(isMuted ? 0 : volume) * 100}%)`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <ModalWrapper 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)}
        title={t('controls.addToSoundboard')}
        icon={Music}
        footer={
          <>
            <button 
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 text-sm font-medium transition-colors"
              disabled={isAdding}
            >
              {t('common.cancel')}
            </button>
            <button 
              onClick={handleAddToSoundboard}
              disabled={!soundName.trim() || isAdding}
              className="px-4 py-2 rounded-xl bg-zinc-700 dark:bg-[#5865F2] hover:bg-zinc-800 dark:hover:bg-[#4752C4] text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg dark:shadow-[#5865F2]/20"
            >
              {isAdding && <Loader2 size={16} className="animate-spin" />}
              {t('voiceMessage.addButton')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-[12px] font-bold text-zinc-500 dark:text-zinc-400 mb-2 ml-1">
            {t('voiceMessage.nameLabel')} <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input 
            type="text" 
            value={soundName}
            onChange={(e) => setSoundName(e.target.value)}
            placeholder={t('voiceMessage.namePlaceholder')}
            autoFocus
            className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2 text-zinc-900 dark:text-zinc-100 text-[14px] focus:outline-none focus:border-zinc-900 dark:focus:border-[#5865F2] focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-[#5865F2]/20 transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && soundName.trim() && !isAdding) {
                handleAddToSoundboard();
              }
            }}
          />
        </div>
      </ModalWrapper>
    </div>
  );
});

export default VoiceMessagePlayer;
