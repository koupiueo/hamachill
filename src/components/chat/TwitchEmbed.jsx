const TwitchEmbed = ({ channelName }) => {
  if (!channelName) return null;

  return (
    <div className="mt-2 flex max-w-[440px] bg-zinc-50 rounded-xl border-l-[4px] border-l-[#9146FF] border-y border-r border-zinc-200 overflow-hidden select-none media-embed">
      <div className="p-3 flex flex-col gap-1 w-full">
        <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          Twitch
        </div>
        <div className="text-[13px] font-semibold text-zinc-900">{channelName}</div>
        <a
          href={`https://www.twitch.tv/${channelName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[15px] font-medium text-[#0068e0] hover:underline line-clamp-2 mt-1"
        >
          Watch {channelName} on Twitch
        </a>
      </div>
    </div>
  );
};

export default TwitchEmbed;
