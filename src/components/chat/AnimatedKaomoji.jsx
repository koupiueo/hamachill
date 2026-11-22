import React, { useState } from 'react';
import { t } from '../../i18n';

/**
 * AnimatedShrug:
 * Displays ¯\_(ツ)_/¯ seamlessly inline with:
 * - Glowing aura (without background box)
 * - Animated eyes on (ツ) that glance around and blink
 * - Shrugging arms that bounce
 * - Interactive click effect
 */
export const AnimatedShrug = () => {
  const [active, setActive] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setActive(true);
    setTimeout(() => setActive(false), 600);
  };

  return (
    <span
      onClick={handleClick}
      title={t('kaomoji.shrugTitle')}
      className={`inline-flex items-center gap-1 px-1 my-0 mx-1 text-purple-600 dark:text-purple-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(168,85,247,0.65)] active:scale-95 group/shrug relative ${
        active ? 'scale-110 drop-shadow-[0_0_16px_rgba(168,85,247,0.95)]' : ''
      }`}
    >
      {/* Left arm */}
      <span className="inline-block font-mono text-[14.5px] animate-shrug-arm-left transition-transform group-hover/shrug:-translate-y-0.5">
        ¯\_
      </span>

      {/* Face with animated eyes */}
      <span className="inline-flex items-center justify-center font-mono text-[15.5px] relative px-1">
        (
        <span className="inline-block animate-shrug-eye text-[14.5px] font-sans font-normal transition-transform">{/* i18n-ignore-next-line: kaomoji */}
          ツ
        </span>
        )
      </span>

      {/* Right arm */}
      <span className="inline-block font-mono text-[14.5px] animate-shrug-arm-right transition-transform group-hover/shrug:-translate-y-0.5">
        _/¯
      </span>

      {/* Magical sparkle */}
      <span className="text-[11px] animate-pulse drop-shadow-[0_0_4px_rgba(234,179,8,0.8)]">
        ✨
      </span>
    </span>
  );
};

/**
 * AnimatedTableflip:
 * Displays (╯°□°）╯︵ ┻━┻ seamlessly inline with:
 * - Fiery red glowing aura (without background box)
 * - Rage-trembling eyes (°□°)
 * - Floating and rotating table (┻━┻)
 * - Interactive click flips table 360 degrees!
 */
export const AnimatedTableflip = () => {
  const [flipped, setFlipped] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setFlipped(prev => !prev);
  };

  return (
    <span
      onClick={handleClick}
      title={t('kaomoji.tableflipTitle')}
      className="inline-flex items-center gap-1 px-1 my-0 mx-1 text-red-600 dark:text-red-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(239,68,68,0.65)] active:scale-95 group/tableflip relative"
    >
      {/* Enraged Face */}
      <span className="font-mono text-[14.5px] inline-flex items-center">
        (╯
        <span className="inline-block animate-rage-eyes text-[14px] font-bold text-red-600 dark:text-red-300">
          °□°
        </span>
        ）╯︵
      </span>

      {/* Floating Flipping Table */}
      <span
        className={`inline-block font-mono text-[14.5px] origin-center transition-transform duration-500 animate-table-float ${
          flipped ? 'rotate-[360deg]' : 'group-hover/tableflip:rotate-45'
        }`}
      >
        ┻━┻
      </span>

      {/* Anger vein / flame */}
      <span className="text-[12px] animate-pulse drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]">
        💢
      </span>
    </span>
  );
};

/**
 * AnimatedMagic:
 * Displays (∩^o^)⊃━☆゜.*・。゜
 * - Glowing aura and sparkle trail
 */
export const AnimatedMagic = () => {
  const [active, setActive] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setActive(true);
    setTimeout(() => setActive(false), 800);
  };

  return (
    <span
      onClick={handleClick}
      title={t('kaomoji.magicTitle')}
      className={`inline-flex items-center gap-1 px-1 my-0 mx-1 text-yellow-500 dark:text-yellow-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(234,179,8,0.65)] active:scale-95 relative ${
        active ? 'scale-110 drop-shadow-[0_0_16px_rgba(234,179,8,1)]' : ''
      }`}
    >
      <span className="font-mono text-[14.5px]">(∩^o^)⊃</span>
      <span className="inline-block font-mono text-[14.5px] animate-magic-wand transform origin-left">━☆</span>
      <span className="font-mono text-[13px] animate-pulse drop-shadow-[0_0_6px_rgba(234,179,8,0.8)]">゜.*・。゜</span>{/* i18n-ignore: kaomoji */}
    </span>
  );
};

/**
 * AnimatedParty:
 * Displays ٩( ᐛ )و
 * - Jumping animation with confetti
 */
export const AnimatedParty = () => {
  const [active, setActive] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setActive(true);
    setTimeout(() => setActive(false), 600);
  };

  return (
    <span
      onClick={handleClick}
      title={t('kaomoji.partyTitle')}
      className={`inline-flex items-center px-1 my-0 mx-1 text-pink-500 dark:text-pink-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(236,72,153,0.65)] active:scale-95 relative ${
        active ? 'scale-110 drop-shadow-[0_0_16px_rgba(236,72,153,1)]' : ''
      }`}
    >
      <span className="text-[12px] animate-ping absolute -top-3 left-0 opacity-70">✨</span>
      <span className="text-[12px] animate-ping absolute -top-2 right-0 opacity-70" style={{ animationDelay: '200ms' }}>🎉</span>
      <span className="inline-block font-mono text-[15.5px] animate-party-jump">٩( ᐛ )و</span>
    </span>
  );
};

/**
 * AnimatedThinking:
 * Displays ( ˘•ω•˘ )
 * - Wobbling head and floating question marks
 */
export const AnimatedThinking = () => {
  const [active, setActive] = useState(false);

  const handleClick = (e) => {
    e.stopPropagation();
    setActive(true);
    setTimeout(() => setActive(false), 800);
  };

  return (
    <span
      onClick={handleClick}
      title={t('kaomoji.thinkingTitle')}
      className={`inline-flex items-center gap-1 px-1 my-0 mx-1 text-blue-500 dark:text-blue-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(59,130,246,0.65)] active:scale-95 relative ${
        active ? 'scale-110 drop-shadow-[0_0_16px_rgba(59,130,246,1)]' : ''
      }`}
    >
      <span className="inline-block font-mono text-[15.5px] animate-thinking-wobble">( ˘•ω•˘ )</span>
      <span className="text-[14px] font-black animate-bounce absolute -top-4 -right-2 drop-shadow-sm">❓</span>
    </span>
  );
};

export const AnimatedDance = () => {
  return (
    <span
      title={t('kaomoji.danceTitle')}
      className="inline-flex items-center gap-1 px-1 my-0 mx-1 text-orange-500 dark:text-orange-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(249,115,22,0.65)] active:scale-95"
    >
      <span className="font-mono text-[14.5px] animate-dance-l">ヾ</span>{/* i18n-ignore: kaomoji */}
      <span className="font-mono text-[15.5px] animate-dance-body">(≧▽≦)</span>
      <span className="font-mono text-[14.5px] animate-dance-r">ﾉ</span>{/* i18n-ignore: kaomoji */}
      <span className="text-[12px] animate-pulse drop-shadow-[0_0_4px_rgba(249,115,22,0.8)] ml-1">♪</span>
    </span>
  );
};

export const AnimatedSleep = () => {
  return (
    <span
      title={t('kaomoji.sleepTitle')}
      className="inline-flex items-center px-1 my-0 mx-1 text-indigo-400 dark:text-indigo-300 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(129,140,248,0.65)] active:scale-95 relative"
    >
      <span className="font-mono text-[15.5px]">( ˘ω˘)ｽﾔｧ</span>{/* i18n-ignore: kaomoji */}
      <span className="text-[10px] font-black absolute -top-4 -right-1 text-indigo-300 animate-sleep-z1">z</span>
      <span className="text-[12px] font-black absolute -top-6 -right-3 text-indigo-300 animate-sleep-z2">Z</span>
      <span className="text-[14px] font-black absolute -top-9 -right-5 text-indigo-300 animate-sleep-z3">Z</span>
    </span>
  );
};

export const AnimatedLove = () => {
  return (
    <span
      title={t('kaomoji.loveTitle')}
      className="inline-flex items-center px-1 my-0 mx-1 text-rose-500 dark:text-rose-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(244,63,94,0.65)] active:scale-95"
    >
      <span className="font-mono text-[15.5px]">(</span>
      <span className="text-[14px] animate-love-heart mx-1">♡</span>
      <span className="font-mono text-[15.5px]"> &gt;ω&lt; </span>
      <span className="text-[14px] animate-love-heart mx-1" style={{ animationDelay: '0.5s' }}>♡</span>
      <span className="font-mono text-[15.5px]">)</span>
    </span>
  );
};

export const AnimatedCry = () => {
  return (
    <span
      title={t('kaomoji.cryTitle')}
      className="inline-flex items-center px-1 my-0 mx-1 text-cyan-500 dark:text-cyan-400 font-bold select-none cursor-pointer transition-all duration-200 hover:scale-105 filter drop-shadow-[0_0_8px_rgba(6,182,212,0.65)] active:scale-95"
    >
      <span className="font-mono text-[15.5px] animate-cry-body">(´</span>
      <span className="font-mono text-[15.5px] animate-cry-tear">；</span>
      <span className="font-mono text-[15.5px] animate-cry-body">ω</span>
      <span className="font-mono text-[15.5px] animate-cry-tear-delay">；</span>
      <span className="font-mono text-[15.5px] animate-cry-body">｀)</span>
    </span>
  );
};
