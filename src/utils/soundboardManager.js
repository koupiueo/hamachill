import { useState, useEffect } from 'react';

/**
 * soundboardManager
 * Manages soundboard audio instances, mute state, and stopping active playback.
 */

const activeAudios = new Set();
let isMuted = localStorage.getItem('hc_soundboard_muted') === 'true';
const listeners = new Set();

function notifyListeners() {
  const state = {
    isMuted,
    isPlaying: activeAudios.size > 0,
    activeCount: activeAudios.size
  };
  listeners.forEach(cb => {
    try { cb(state); } catch (e) { console.error(e); }
  });
  window.dispatchEvent(new CustomEvent('soundboard_state_change', { detail: state }));
}

export const soundboardManager = {
  isMuted() {
    return isMuted;
  },

  isPlaying() {
    return activeAudios.size > 0;
  },

  setMuted(val) {
    isMuted = !!val;
    localStorage.setItem('hc_soundboard_muted', isMuted ? 'true' : 'false');
    if (isMuted) {
      this.stopAll();
    } else {
      notifyListeners();
    }
  },

  toggleMute() {
    this.setMuted(!isMuted);
    return isMuted;
  },

  /**
   * Stop all currently playing soundboard audios immediately
   */
  stopAll() {
    activeAudios.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {
        console.error("Failed to stop soundboard audio:", e);
      }
    });
    activeAudios.clear();
    window.dispatchEvent(new CustomEvent('soundboard_stopped'));
    notifyListeners();
  },

  /**
   * Play a soundboard audio file if not muted
   */
  play(filename) {
    if (isMuted) return null;

    try {
      const audio = new Audio(`/soundboards/${filename}`);
      audio.volume = 0.5;
      const outputDeviceId = localStorage.getItem('hc_audio_output');
      if (outputDeviceId && outputDeviceId !== 'default' && audio.setSinkId) {
        audio.setSinkId(outputDeviceId).catch(() => {});
      }

      const cleanup = () => {
        activeAudios.delete(audio);
        notifyListeners();
      };

      audio.addEventListener('ended', cleanup);
      audio.addEventListener('error', cleanup);
      audio.addEventListener('pause', () => {
        if (audio.currentTime === 0 || audio.ended) {
          cleanup();
        }
      });

      activeAudios.add(audio);
      notifyListeners();

      audio.play().catch(e => {
        console.error("Failed to play soundboard audio:", e);
        cleanup();
      });

      return audio;
    } catch (err) {
      console.error("Soundboard manager audio error:", err);
      return null;
    }
  },

  subscribe(cb) {
    listeners.add(cb);
    cb({
      isMuted,
      isPlaying: activeAudios.size > 0,
      activeCount: activeAudios.size
    });
    return () => listeners.delete(cb);
  }
};

/**
 * React hook to observe soundboard state (isMuted, isPlaying)
 */
export function useSoundboard() {
  const [state, setState] = useState({
    isMuted: soundboardManager.isMuted(),
    isPlaying: soundboardManager.isPlaying()
  });

  useEffect(() => {
    return soundboardManager.subscribe(setState);
  }, []);

  return {
    isMuted: state.isMuted,
    isPlaying: state.isPlaying,
    toggleMute: () => soundboardManager.toggleMute(),
    stopAll: () => soundboardManager.stopAll()
  };
}
