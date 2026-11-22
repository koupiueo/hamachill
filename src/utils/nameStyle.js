export const getNameStyle = (user) => {
  if (!user) return {};
  const c1 = user.profileColor1 || '#ffffff';
  const styleType = user.nameStyle || 'solid';
  const c2 = styleType === 'gradient' ? (user.profileColor2 || c1) : c1;
  const c3 = styleType === 'gradient' && user.profileColor3 ? user.profileColor3 : null;

  let baseStyle = {};
  if (user.fontFamily) {
    baseStyle.fontFamily = user.fontFamily;
  }

  switch (styleType) {
    case 'gradient':
      return {
        ...baseStyle,
        backgroundImage: `linear-gradient(to right, ${c1}, ${c2}${c3 ? `, ${c3}` : ''})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        color: 'transparent',
        display: 'inline-block',
        maxWidth: '100%'
      };

    case 'pop':
      return {
        ...baseStyle,
        color: '#ffffff',
        textShadow: `
          -1px -1px 0 ${c2}, 1px -1px 0 ${c2}, -1px 1px 0 ${c2}, 1px 1px 0 ${c2},
          0px 2px 0 ${c2}, 1px 2px 0 ${c2}, -1px 2px 0 ${c2},
          0px 3px 0 ${c1}, 1px 3px 0 ${c1}, -1px 3px 0 ${c1},
          0px 4px 0 ${c2}, 1px 4px 0 ${c2}, -1px 4px 0 ${c2}
        `,
        fontWeight: '900',
        display: 'inline-block',
        maxWidth: '100%'
      };
    case 'solid':
    default:
      return { ...baseStyle, color: c1 };
  }
};
