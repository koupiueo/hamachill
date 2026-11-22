import { ShieldCheck } from 'lucide-react';

export default function AvatarIndicator({ accountId, isOnline, size = 'md' }) {
  const isHamachill = accountId === 'hamachill';

  // サイズの定義
  const sizeClasses = {
    sm: 'w-2.5 h-2.5 border-2',
    md: 'w-3 h-3 border-[2px]',
    lg: 'w-3.5 h-3.5 border-[2.5px]',
    xl: 'w-5 h-5 border-[3px]'
  };

  const iconSizes = {
    sm: 8,
    md: 10,
    lg: 12,
    xl: 14
  };

  const currentSizeClass = sizeClasses[size] || sizeClasses.md;
  const iconSize = iconSizes[size] || iconSizes.md;

  if (isHamachill) {
    return (
      <div className={`absolute bottom-0 right-0 ${currentSizeClass} rounded-full border-[var(--theme-background)] bg-rose-500 flex items-center justify-center text-white`}>
        <ShieldCheck size={iconSize - 2} strokeWidth={3} />
      </div>
    );
  }

  return (
    <div className={`absolute -bottom-[2px] -right-[2px] ${currentSizeClass} rounded-full border-[var(--theme-background)] ${isOnline ? 'bg-green-500' : 'bg-[#80848e]'}`} />
  );
}

