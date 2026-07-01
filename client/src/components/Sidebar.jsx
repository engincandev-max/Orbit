import React, { useEffect } from 'react';
import { Server, Hash, Mic, MicOff, Headphones, Settings, VolumeX, Volume2, UserPlus, Lock, Unlock } from 'lucide-react';
import useAppStore from '../store/useAppStore';

export default function Sidebar() {
  const { 
    activeChannel, 
    setActiveChannel,
    activeVoiceChannel,
    setActiveVoiceChannel,
    isMicOn,
    isDeafened,
    toggleMic,
    toggleDeafen,
    setSettingsOpen,
    roomUsers,
    myPeerId,
    speakingPeers,
    voiceThreshold,
    currentVolume
  } = useAppStore();

  const channels = ['Genel Sohbet', 'Oyun Odası', 'Toplantı'];

  // Uygulama ilk açıldığında URL'de ?join=KanalAdı varsa otomatik katıl
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinChannel = params.get('join');
    if (joinChannel && channels.includes(joinChannel)) {
      setActiveChannel(joinChannel);
      setActiveVoiceChannel(joinChannel);
      // Linki temizle (sayfa yenilendiğinde tekrar bağlanmaya çalışmaması için)
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleChannelClick = (channel) => {
    setActiveChannel(channel);
    setActiveVoiceChannel(channel); // Discord'da voice kanalına tıklandığında hem bağlanılır hem chat'i açılır mantığı
  };

  return (
    <div className="flex h-full">
      {/* Servers */}
      <div className="w-[72px] bg-zinc-950 flex flex-col items-center py-3 space-y-4 shadow-md z-20">
        <button className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-bold hover:rounded-xl transition-all duration-200">
          <Server size={24} />
        </button>
        <div className="w-8 h-1 bg-zinc-800 rounded-full"></div>
        <button className="w-12 h-12 bg-zinc-800 rounded-[24px] flex items-center justify-center text-emerald-500 hover:rounded-xl hover:bg-emerald-500 hover:text-white transition-all duration-200">
          +
        </button>
      </div>

      {/* Channels */}
      <div className="w-60 bg-zinc-900 flex flex-col border-r border-zinc-800/50">
        <div className="h-12 flex items-center justify-between px-4 font-bold border-b border-zinc-800/50 shadow-sm relative group">
          <span>ORBİT Server</span>
          <div className="flex items-center space-x-1">
            {/* TS Style: Server Password is in WelcomeModal, no need for admin lock toggle */}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-xs font-bold text-zinc-400 tracking-wider">SES KANALLARI</h2>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(window.location.origin);
                alert('Sunucu davet bağlantısı kopyalandı!');
              }}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Sunucu Davet Bağlantısını Kopyala"
            >
              <UserPlus size={14} />
            </button>
          </div>
          
          {channels.map((channel) => (
            <div key={channel}>
              <button 
                onClick={() => handleChannelClick(channel)}
                className={`w-full flex items-center px-2 py-1.5 rounded transition-colors group relative ${
                  activeChannel === channel 
                    ? 'bg-zinc-800/80 text-zinc-200' 
                    : 'hover:bg-zinc-800/40 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Hash size={18} className={`${activeChannel === channel ? 'text-zinc-400' : ''} mr-2`} />
                <span className="font-medium">{channel}</span>
                
                <div 
                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(channel)}`;
                    navigator.clipboard.writeText(url);
                    alert(`Davet bağlantısı panoya kopyalandı:\n${url}`);
                  }}
                  title="Davet Bağlantısını Kopyala"
                >
                  <UserPlus size={16} className="text-zinc-400 hover:text-white" />
                </div>
              </button>

              {/* Connected Users List (Discord Style) */}
              {(roomUsers[channel] || []).map((user) => {
                const { peerId, username } = user;
                const displayUsername = username || 'Misafir';
                const isSpeaking = peerId === myPeerId ? (currentVolume >= voiceThreshold) : speakingPeers.includes(peerId);

                return (
                  <div key={peerId} className="flex items-center mt-1 ml-6 px-2 py-1 hover:bg-zinc-800/40 rounded transition-colors cursor-pointer group">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] text-white transition-all ${isSpeaking ? 'ring-2 ring-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : ''} ${peerId === myPeerId ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                      {displayUsername.charAt(0).toUpperCase()}
                    </div>
                    <span className={`ml-2 text-sm font-medium truncate group-hover:text-zinc-100 ${peerId === myPeerId ? 'text-emerald-400' : 'text-zinc-300'}`}>
                      {displayUsername}
                    </span>
                    
                    {peerId === myPeerId ? (
                      <div className="ml-auto flex items-center space-x-1.5">
                        {isDeafened ? (
                          <VolumeX size={14} className="text-red-500" />
                        ) : !isMicOn ? (
                          <MicOff size={14} className="text-red-500" />
                        ) : isSpeaking ? (
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="ml-auto flex items-center space-x-1.5">
                        {user.isDeafened ? (
                          <VolumeX size={14} className="text-red-500" />
                        ) : user.isMuted ? (
                          <MicOff size={14} className="text-red-500" />
                        ) : null}
                        
                        {/* Local mute toggle (only visible on hover) */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              useAppStore.getState().togglePeerMute(peerId);
                            }}
                            className={`p-1 rounded hover:bg-zinc-700 transition-colors ${useAppStore.getState().mutedPeers.includes(peerId) ? 'text-red-500' : 'text-zinc-400 hover:text-white'}`}
                            title={useAppStore.getState().mutedPeers.includes(peerId) ? "Sesi Aç" : "Kullanıcıyı Sustur (Sadece Sen Duymazsın)"}
                          >
                            {useAppStore.getState().mutedPeers.includes(peerId) ? <VolumeX size={14} /> : <Volume2 size={14} />}
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Eğer karşı taraf konuşuyorsa (ve mute edilmemişse) onun için de ikon gösterelim, opacity-0 bypass eder */}
                    {peerId !== myPeerId && isSpeaking && !useAppStore.getState().mutedPeers.includes(peerId) && (
                      <div className="ml-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse group-hover:hidden"></div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          
        </div>
        
        {/* User Controls */}
        <div className="h-14 bg-zinc-950/40 flex items-center px-3 border-t border-zinc-800/50 justify-between">
          <div className="flex items-center flex-1 min-w-0 mr-2 hover:bg-zinc-800/50 p-1 rounded-md cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold relative flex-shrink-0 text-white">
              {useAppStore.getState().username ? useAppStore.getState().username.charAt(0).toUpperCase() : 'U'}
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-900"></div>
            </div>
            <div className="ml-2 flex flex-col min-w-0">
              <span className="text-sm font-semibold leading-tight truncate">{useAppStore.getState().username || 'Kullanıcı'}</span>
              <span className="text-xs text-zinc-400 leading-tight truncate">{activeVoiceChannel ? activeVoiceChannel : 'Çevrimiçi'}</span>
            </div>
          </div>
          
          <div className="flex space-x-1 text-zinc-400">
            <button 
              onClick={toggleMic}
              disabled={isDeafened}
              className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${isDeafened ? 'opacity-50 cursor-not-allowed' : ''} ${!isMicOn && !isDeafened ? 'text-red-500 hover:text-red-400' : 'hover:text-zinc-200'}`}
            >
              {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button 
              onClick={toggleDeafen}
              className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${isDeafened ? 'text-red-500 hover:text-red-400' : 'hover:text-zinc-200'}`}
            >
              {isDeafened ? <VolumeX size={18} /> : <Headphones size={18} />}
            </button>
            <button 
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
