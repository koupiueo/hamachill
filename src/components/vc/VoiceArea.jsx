import VoiceJoin from './VoiceJoin';
import VoiceRoom from './VoiceRoom';

export default function VoiceArea({ channel, isConnected, onJoin, onLeave, participants, currentSocketId, currentUserState, setCurrentUserState, socket, roomId, screenStreams, localScreenStream, onStartScreenShare, onStopScreenShare }) {
  // socketId・isMe を保持したまま VoiceRoom に渡す
  const participantsList = participants.map(p => {
    const isMe = p.isMe ?? false;
    return {
      ...p,
      ...p.userState,
      // 自分自身の場合は、サーバーからのイベントを待たずに最新のローカル状態を即座にマージする
      ...(isMe ? currentUserState : {}),
      socketId: p.socketId,
      peerId: p.peerId,
      isMe,
    };
  });

  // VoiceJoin 用（未接続時の背景表示）
  const joinParticipants = participantsList.map(p => ({ name: p.name, avatarUrl: p.avatarUrl }));

  if (!isConnected) {
    return (
      <VoiceJoin
        channel={channel}
        onJoin={onJoin}
        participants={joinParticipants}
        currentUserState={currentUserState}
        setCurrentUserState={setCurrentUserState}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-row min-w-0 h-full relative">
      <VoiceRoom
        participants={participantsList}
        onLeave={onLeave}
        currentSocketId={currentSocketId}
        currentUserState={currentUserState}
        setCurrentUserState={setCurrentUserState}
        socket={socket}
        roomId={roomId}
        screenStreams={screenStreams}
        localScreenStream={localScreenStream}
        onStartScreenShare={onStartScreenShare}
        onStopScreenShare={onStopScreenShare}
      />
    </div>
  );
}
