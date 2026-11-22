import { Mic, MicOff, Headphones, HeadphoneOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import PanelHeader from '../ui/PanelHeader';
import { t } from '../../i18n';

export default function VoiceJoin({ channel, onJoin, participants, currentUserState, setCurrentUserState }) {
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  // マイク許可を確認
  useEffect(() => {
    const checkMicPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' });
        setHasMicrophonePermission(result.state === 'granted');
      } catch (err) {
        // Fallback: try to get microphone
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
          setHasMicrophonePermission(true);
        } catch {
          setHasMicrophonePermission(false);
        }
      } finally {
        setCheckingPermission(false);
      }
    };
    checkMicPermission();
  }, []);

  const handleMuteToggle = () => {
    setCurrentUserState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  };

  const handleDeafToggle = () => {
    setCurrentUserState(prev => ({ ...prev, isDeafened: !prev.isDeafened }));
  };

  return (
    <main className="flex-1 h-full bg-white relative flex flex-col min-w-0 font-sans">
      <PanelHeader title={channel.name} type="voice" borderVar="--border-chat" />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center max-w-md w-full animate-in fade-in zoom-in-95 duration-300">
          <h2 className="text-[32px] font-semibold text-zinc-950 mb-3 tracking-tight text-center">
            {channel.name}
          </h2>
          <p className="text-zinc-500 text-center mb-10 text-[14px] font-medium leading-relaxed">
            {t('vc.checkDevices')}
          </p>

          <div className="flex items-center justify-center gap-4 mb-6">
            <button 
              onClick={handleMuteToggle}
              className={`w-14 h-14 rounded-full transition-all flex items-center justify-center cursor-pointer ${
                currentUserState.isMuted 
                  ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {currentUserState.isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <button 
              onClick={handleDeafToggle}
              className={`w-14 h-14 rounded-full transition-all flex items-center justify-center cursor-pointer ${
                currentUserState.isDeafened 
                  ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {currentUserState.isDeafened ? <HeadphoneOff size={24} /> : <Headphones size={24} />}
            </button>
          </div>

          <button
            onClick={onJoin}
            disabled={checkingPermission}
            className="w-full max-w-[240px] h-12 rounded-lg font-semibold text-[15px] transition-all transform active:scale-95 cursor-pointer bg-[#5865f2] hover:bg-[#4752c4] text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {checkingPermission ? t('common.checking') : t('vc.join')}
          </button>
        </div>
      </div>
    </main>
  );
}
