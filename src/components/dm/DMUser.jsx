import { getNameStyle } from '../../utils/nameStyle';

export const DMUser = ({ id, name, member, avatarUrl, selected = false, onClick, unread = 0, isOnline }) => {
  return (
    <div
      data-channel-id={id}
      onClick={onClick}
      className={`relative z-10 flex items-center pl-2 pr-3 py-2 rounded-lg cursor-pointer group mx-3 select-none ${
        selected ? 'text-zinc-900 font-semibold' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-950/5'
      }`}
    >
      <div className="relative shrink-0">
        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-zinc-950/10 border border-zinc-950/10 flex items-center justify-center text-[10px] font-black overflow-hidden">
          {avatarUrl
            ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            : name?.[0]?.toUpperCase()
          }
        </div>
        <div className={`absolute -bottom-[2px] -right-[2px] w-3 h-3 rounded-full border-[2px] border-[var(--bg-dm)] ${isOnline ? 'bg-green-500' : 'bg-[#80848e]'}`} />
      </div>
      <div className="ml-3 flex-1 min-w-0">
        <span className="text-[14px] font-bold tracking-tight truncate block" style={member ? getNameStyle(member) : undefined}>
          {name}
        </span>
      </div>
      {unread > 0 && (
        <span className="ml-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shrink-0">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </div>
  );
};
