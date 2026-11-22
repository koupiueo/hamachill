import React, { useEffect, useRef, useState } from 'react';

export default function RecordingVisualizer({ stream }) {
  const [levels, setLevels] = useState(Array(30).fill(0));
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!stream) return;
    
    // Set up AudioContext and Analyser
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64; // Small fft for fewer frequency bins
    analyserRef.current = analyser;
    
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;
    
    const bufferLength = analyser.frequencyBinCount; // 32
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      
      // We take the first 30 bins (or average them)
      const nextLevels = [];
      for (let i = 0; i < 30; i++) {
        const val = dataArray[i] || 0;
        // Normalize to 0 - 1
        nextLevels.push(val / 255);
      }
      setLevels(nextLevels);
    };
    
    draw();
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stream]);

  return (
    <div className="flex-1 h-6 flex items-center justify-between gap-1 px-2 w-full">
      {levels.map((level, i) => {
        const height = Math.max(15, level * 100) + '%';
        return (
          <div 
            key={i} 
            className="flex-1 rounded-full bg-zinc-700 dark:bg-[#5865F2] transition-all duration-75"
            style={{ height }}
          />
        );
      })}
    </div>
  );
}
