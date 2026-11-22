import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Speaker, RefreshCw, AlertCircle, Check, ChevronDown } from 'lucide-react';
import { Section, Card } from './SharedComponents';
import { t } from '../../../i18n';

const STORAGE_KEY_INPUT  = 'hc_audio_input';
const STORAGE_KEY_OUTPUT = 'hc_audio_output';

const VoiceTab = () => {
  const [inputs,  setInputs]  = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [selInput,  setSelInput]  = useState(() => localStorage.getItem(STORAGE_KEY_INPUT)  || 'default');
  const [selOutput, setSelOutput] = useState(() => localStorage.getItem(STORAGE_KEY_OUTPUT) || 'default');
  const [noiseSuppression, setNoiseSuppression] = useState(() => localStorage.getItem('hc_noise_suppression') === 'true');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 先に enumerateDevices を呼んでラベルが取れるなら不要な getUserMedia をスキップ
      let devices = await navigator.mediaDevices.enumerateDevices();
      let inputDevices = devices.filter(d => d.kind === 'audioinput');
      let hasLabels = inputDevices.some(d => d.label !== '');

      if (!hasLabels) {
        try {
          const perm = await navigator.permissions?.query?.({ name: 'microphone' });
          if (perm?.state === 'granted') {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
            inputDevices = devices.filter(d => d.kind === 'audioinput');
            hasLabels = inputDevices.some(d => d.label !== '');
          }
        } catch {
          // Permissions API 非対応や拒否時はそのまま続行
        }
      }

      setInputs(inputDevices);
      setOutputs(devices.filter(d => d.kind === 'audiooutput'));
      setHasMicrophonePermission(hasLabels);
    } catch (e) {
      console.error('Error loading devices:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleRequestPermission = async () => {
    setRequestingPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setHasMicrophonePermission(true);
      setError('');
      await loadDevices();
    } catch {
      setError(t('voiceSettings.micDenied'));
      setHasMicrophonePermission(false);
    } finally {
      setRequestingPermission(false);
    }
  };

  const handleInputChange = (deviceId) => {
    setSelInput(deviceId);
    localStorage.setItem(STORAGE_KEY_INPUT, deviceId);
    window.dispatchEvent(new CustomEvent('hc_audio_device_change', { detail: { type: 'input', deviceId } }));
  };

  const handleOutputChange = (deviceId) => {
    setSelOutput(deviceId);
    localStorage.setItem(STORAGE_KEY_OUTPUT, deviceId);
    document.querySelectorAll('audio[id^="audio-"]').forEach(audio => {
      if (audio.setSinkId) audio.setSinkId(deviceId).catch(() => {});
    });
    window.dispatchEvent(new CustomEvent('hc_audio_device_change', { detail: { type: 'output', deviceId } }));
  };

  const handleNoiseSuppressionChange = (enabled) => {
    setNoiseSuppression(enabled);
    localStorage.setItem('hc_noise_suppression', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('hc_noise_suppression_change', { detail: enabled }));
  };

  const selectCls = "bg-zinc-50 dark:bg-[#1a1b1e] border border-black/[0.09] dark:border-white/[0.1] rounded-xl pl-3.5 pr-9 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition-colors appearance-none cursor-pointer w-full disabled:opacity-50";

  return (
    <Section title={t('settings.tabs.voice')}>
      <Card title={t('voiceSettings.title')}>
        {error && (
          <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* 入力 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Mic size={12} /> {t('voiceSettings.input')}
            </span>
            {hasMicrophonePermission ? (
              <div className="relative">
                <select
                  value={selInput}
                  onChange={e => handleInputChange(e.target.value)}
                  className={selectCls}
                  disabled={loading}
                >
                  <option value="default">{t('common.default')}</option>
                  {inputs.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || t('voiceSettings.micN', { id: d.deviceId.slice(0, 8) })}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              </div>
            ) : (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-3.5 py-2.5 text-sm text-red-500 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{t('voiceSettings.notAllowed')}</span>
              </div>
            )}
          </div>

          {/* 出力 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Speaker size={12} /> {t('voiceSettings.output')}
            </span>
            <div className="relative">
              <select
                value={selOutput}
                onChange={e => handleOutputChange(e.target.value)}
                className={selectCls}
                disabled={loading || outputs.length === 0}
              >
                <option value="default">{t('common.default')}</option>
                {outputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t('voiceSettings.speakerN', { id: d.deviceId.slice(0, 8) })}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            </div>
            {outputs.length === 0 && !loading && (
              <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                {t('voiceSettings.outputNote')}
              </p>
            )}
          </div>
          
          {/* ノイズキャンセリング */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Mic size={12} /> {t('voiceSettings.noiseCancel')}
            </span>
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-zinc-50 dark:bg-[#1a1b1e] border border-black/[0.09] dark:border-white/[0.1] rounded-xl hover:bg-zinc-100 dark:hover:bg-white/[0.04] transition-colors">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${noiseSuppression ? 'bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                <Check size={12} className={`text-white dark:text-zinc-900 transition-transform duration-140 ${noiseSuppression ? 'scale-100' : 'scale-0'}`} />
              </div>
              <input 
                type="checkbox" 
                checked={noiseSuppression}
                onChange={(e) => handleNoiseSuppressionChange(e.target.checked)}
                className="sr-only"
              />
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t('voiceSettings.rnnoise')}
              </span>
            </label>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1">{t('voiceSettings.appliesNextCall')}</p>
          </div>
        </div>

        <button
          onClick={loadDevices}
          disabled={loading}
          className="w-fit flex items-center gap-2 px-4 py-2 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {t('voiceSettings.reloadDevices')}
        </button>

        {!hasMicrophonePermission && (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRequestPermission}
              disabled={requestingPermission}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <AlertCircle size={13} />
              {requestingPermission ? t('common.checking') : t('voiceSettings.requestMic')}
            </button>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 text-center">
              {t('voiceSettings.deniedHint')}
            </p>
          </div>
        )}
      </Card>
    </Section>
  );
};

export default React.memo(VoiceTab);
