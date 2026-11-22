import { useState, useEffect } from 'react';
import { formatDate } from '../../i18n';

export default function RealTimeClock({ className = "" }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = formatDate(time, { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = formatDate(time, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className={`flex items-center gap-2 font-bold tracking-widest ${className}`}>
      <span className="text-[11px] opacity-70">{dateStr}</span>
      <span className="text-[13px]">{timeStr}</span>
    </div>
  );
}
