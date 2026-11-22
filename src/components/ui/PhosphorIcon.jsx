import React from 'react';

/**
 * PhosphorIcon
 * 軽量でシンプルな Phosphor アイコンラッパー
 */
export default function PhosphorIcon({
  icon: Icon,
  size = 20,
  active,
  className = '',
  weight = 'regular',
  activeWeight = 'fill',
  style,
  ...props
}) {
  if (!Icon) return null;

  const currentWeight = (typeof active === 'boolean' && active) ? activeWeight : weight;

  return (
    <Icon
      size={size}
      weight={currentWeight}
      className={`shrink-0 ${className}`}
      style={style}
      aria-hidden="true"
      {...props}
    />
  );
}
