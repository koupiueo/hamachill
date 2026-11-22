const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freqs, duration = 0.1, type = 'sine') {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = type;
  
  // Create an arpeggio effect if an array of frequencies is passed
  if (Array.isArray(freqs)) {
    const step = duration / freqs.length;
    freqs.forEach((freq, i) => {
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * step);
    });
  } else {
    osc.frequency.value = freqs;
  }

  // Envelope
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export const playJoinSound = () => {
  // Rising arpeggio (C5, E5, G5, C6)
  playTone([523.25, 659.25, 783.99, 1046.50], 0.3, 'sine');
};

export const playLeaveSound = () => {
  // Falling arpeggio (C6, G5, E5, C5)
  playTone([1046.50, 783.99, 659.25, 523.25], 0.3, 'sine');
};

export const playMuteSound = () => {
  // Short falling tone (G4 to C4)
  playTone([392.00, 261.63], 0.2, 'triangle');
};

export const playUnmuteSound = () => {
  // Short rising tone (C4 to G4)
  playTone([261.63, 392.00], 0.2, 'triangle');
};

export const playDeafenSound = () => {
  // Lower falling tone (E4 to A3)
  playTone([329.63, 220.00], 0.2, 'triangle');
};

export const playUndeafenSound = () => {
  // Lower rising tone (A3 to E4)
  playTone([220.00, 329.63], 0.2, 'triangle');
};

export const playScreenShareSound = () => {
  // Upward double chime (A5 to E6)
  playTone([880.00, 1318.51], 0.3, 'sine');
};
