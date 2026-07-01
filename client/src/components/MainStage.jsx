import React, { useEffect, useRef } from 'react';
import { Hash, Users, Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare } from 'lucide-react';
import useAppStore from '../store/useAppStore';

function RemoteVideo({ stream, peerId, isMuted, username }) {
  const ref = useRef(null);
  
  useEffect(() => {
    let audioContext;
    let analyser;
    let microphone;
    let animationId;

    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.muted = isMuted;
      ref.current.play().catch(e => console.error('Remote video play error:', e));

      // Uzak kullanıcının ses seviyesini analiz et (Işık yanıp sönmesi için)
      if (stream.getAudioTracks().length > 0) {
        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          if (audioContext.state === 'suspended') audioContext.resume();
          
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          
          const analysisStream = stream.clone();
          microphone = audioContext.createMediaStreamSource(analysisStream);
          microphone.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          
          const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const average = sum / dataArray.length;
            const volume = Math.round((average / 255) * 100);
            
            useAppStore.getState().setPeerSpeaking(peerId, volume > 5);
            animationId = requestAnimationFrame(checkVolume);
          };
          checkVolume();
        } catch (e) {
          console.error('Remote VAD error:', e);
        }
      }
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (microphone) microphone.disconnect();
      if (analyser) analyser.disconnect();
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
      useAppStore.getState().setPeerSpeaking(peerId, false);
    };
  }, [stream, isMuted, peerId]);

  // Check if track is enabled to show placeholder
  const hasVideo = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;
  const hasAudio = stream && stream.getAudioTracks().length > 0 && stream.getAudioTracks()[0].enabled;

  const displayName = username || `Kullanıcı (${peerId.substring(0,4)})`;

  return (
    <div className="bg-zinc-950 rounded-xl aspect-video relative group overflow-hidden border border-zinc-800 shadow-lg flex items-center justify-center">
      <video 
        ref={ref} 
        autoPlay 
        playsInline 
        muted={isMuted}
        className={`w-full h-full object-cover ${!hasVideo ? 'opacity-0 absolute inset-0 pointer-events-none' : ''}`}
      />
      {!hasVideo && (
        <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center border-4 border-zinc-700 shadow-inner z-10">
          <span className="text-3xl font-bold text-zinc-400">{displayName.charAt(0).toUpperCase()}</span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-sm text-zinc-100 flex items-center z-10">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
        {displayName}
      </div>
      {!hasAudio && (
        <div className="absolute top-3 right-3 bg-red-500/80 p-1.5 rounded-full text-white backdrop-blur-sm z-10">
          <MicOff size={16} />
        </div>
      )}
    </div>
  );
}

export default function MainStage() {
  const { 
    activeChannel, 
    activeVoiceChannel,
    isMicOn, 
    isVideoOn, 
    isScreenSharing, 
    toggleMic, 
    toggleVideo, 
    toggleScreenShare,
    localStream,
    setLocalStream,
    disconnectMedia,
    selectedMicId,
    selectedCameraId,
    socket,
    peer,
    remoteStreams,
    addRemoteStream,
    removeRemoteStream,
    clearRemoteStreams,
    mutedPeers
  } = useAppStore();

  const videoRef = useRef(null);
  // Aramaları tutmak için (kapatmak gerekirse diye)
  const callsRef = useRef({});

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
      videoRef.current.play().catch(e => console.error('Local video play error:', e));
    }
  }, [localStream, isVideoOn]);

  const { voiceThreshold, setCurrentVolume } = useAppStore();

  // Voice Activity Detection (VAD) Logic
  useEffect(() => {
    if (!localStream || !isMicOn) {
      setCurrentVolume(0);
      return;
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Ses analizini yapmak için stream'i klonluyoruz ki, asıl stream'i (WebRTC) sessize alsak bile analizi durdurmayalım
    const analysisStream = localStream.clone();
    
    // Klondaki audio track her zaman açık kalsın ki okuyabilelim
    analysisStream.getAudioTracks().forEach(track => track.enabled = true);
    
    const source = audioContext.createMediaStreamSource(analysisStream);
    const analyser = audioContext.createAnalyser();
    
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.2; // Tepkime süresini hızlandır (Gecikmeyi/Delay'i azaltır)
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationId;
    let lastSpokeTime = 0;
    const HOLD_TIME_MS = 1000; // Konuşma bitse bile mikrofonu 1 saniye daha açık tut (Sesin kesilmesini önler)

    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      // 0-255 arası değeri 0-100 arasına çek
      const volume = Math.min(100, Math.round((average / 255) * 100 * 2)); 
      
      setCurrentVolume(volume);

      const isOverThreshold = volume >= voiceThreshold;
      if (isOverThreshold) {
        lastSpokeTime = Date.now(); // Sesi algıladığı an sayacı sıfırla
      }

      // Son sesin üzerinden HOLD_TIME_MS geçmediyse mikrofonu açık tut (Sustuğunda hemen kesilmez)
      const isSpeaking = (Date.now() - lastSpokeTime) < HOLD_TIME_MS;

      // WebRTC gönderilen asıl stream'deki mikrofonu VAD eşiğine göre Aç / Kapat
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isSpeaking;
      });

      animationId = requestAnimationFrame(checkVolume);
    };

    checkVolume();

    return () => {
      cancelAnimationFrame(animationId);
      source.disconnect();
      audioContext.close();
      analysisStream.getTracks().forEach(track => track.stop());
    };
  }, [localStream, voiceThreshold, setCurrentVolume, isMicOn]);

  // Socket ve Peer olayları
  useEffect(() => {
    if (!socket || !peer) return;

    const handleUserConnected = (userId) => {
      console.log('Kullanıcı bağlandı, aranıyor:', userId);
      // Odaya yeni giren kişiyi ara ve localStream'imizi gönder
      if (localStream) {
        const call = peer.call(userId, localStream);
        call.on('stream', (userVideoStream) => {
          addRemoteStream(userId, userVideoStream);
        });
        call.on('close', () => {
          removeRemoteStream(userId);
        });
        callsRef.current[userId] = call;
      }
    };

    const handleUserDisconnected = (userId) => {
      console.log('Kullanıcı ayrıldı:', userId);
      if (callsRef.current[userId]) {
        callsRef.current[userId].close();
        delete callsRef.current[userId];
      }
      removeRemoteStream(userId);
    };

    socket.on('user-connected', handleUserConnected);
    socket.on('user-disconnected', handleUserDisconnected);

    return () => {
      socket.off('user-connected', handleUserConnected);
      socket.off('user-disconnected', handleUserDisconnected);
    };
  }, [socket, peer, localStream, addRemoteStream, removeRemoteStream]);

  // Kanal değiştiğinde mevcut aramaları kapat
  useEffect(() => {
    // Tüm mevcut çağrıları kapat ve callsRef'i temizle
    Object.values(callsRef.current).forEach(call => call.close());
    callsRef.current = {};
    clearRemoteStreams();
    setSpotlightId(null);
  }, [activeVoiceChannel]); // Yalnızca activeVoiceChannel değiştiğinde tetiklenir

  // Biri bizi aradığında (Peer on call)
  useEffect(() => {
    if (!peer) return;

    const handleCall = (call) => {
      console.log('Biri bizi arıyor:', call.peer);
      
      // Eğer bu kişiden halihazırda bir arama varsa, önce onu temizle (Çakışmayı önler)
      if (callsRef.current[call.peer]) {
        callsRef.current[call.peer].close();
        removeRemoteStream(call.peer);
      }

      // Aramayı cevapla ve localStream'imizi gönder
      call.answer(localStream);
      
      call.on('stream', (userVideoStream) => {
        addRemoteStream(call.peer, userVideoStream);
      });
      
      call.on('close', () => {
        // Eğer callsRef'te hala BAZI çağrılar varsa ve o bu çağrıysa sil
        if (callsRef.current[call.peer] === call) {
          removeRemoteStream(call.peer);
          delete callsRef.current[call.peer];
        }
      });
      
      callsRef.current[call.peer] = call;
    };

    peer.on('call', handleCall);

    return () => {
      peer.off('call', handleCall);
    };
  }, [peer, localStream, addRemoteStream, removeRemoteStream]);

  const requestMediaPermissions = async (type) => {
    try {
      const audioConstraints = selectedMicId === 'default' 
        ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        : { deviceId: { exact: selectedMicId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      const shouldRequestVideo = type === 'video' || isVideoOn;
      const videoConstraints = shouldRequestVideo 
        ? (selectedCameraId === 'default' ? true : { deviceId: { exact: selectedCameraId } })
        : false;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
      
      // Initialize track states based on what user clicked
      stream.getAudioTracks().forEach(track => track.enabled = type === 'audio' || isMicOn);
      stream.getVideoTracks().forEach(track => track.enabled = type === 'video' || isVideoOn);
      
      setLocalStream(stream);

      // Tüm mevcut çağrıları kapat ve HERKESE YENİDEN ÇAĞRI AT
      Object.values(callsRef.current).forEach(c => c.close());
      callsRef.current = {};

      if (peer && socket) {
        const roomUsers = useAppStore.getState().roomUsers;
        const myPeerId = useAppStore.getState().myPeerId;
        const usersInRoom = roomUsers[activeVoiceChannel] || [];

        usersInRoom.forEach(u => {
          if (u.peerId !== myPeerId) {
            const call = peer.call(u.peerId, stream);
            call.on('stream', (userVideoStream) => {
              addRemoteStream(u.peerId, userVideoStream);
            });
            call.on('close', () => {
              if (callsRef.current[u.peerId] === call) {
                removeRemoteStream(u.peerId);
              }
            });
            callsRef.current[u.peerId] = call;
          }
        });
      }

      // Sync Zustand state based on what they clicked first
      if (type === 'audio') toggleMic();
      if (type === 'video') toggleVideo();
      
    } catch (err) {
      console.error("Medya cihazlarına erişilemedi:", err);
      alert("Kamera veya mikrofona erişilemiyor. Lütfen tarayıcı izinlerini kontrol edip izin verdiğinizden emin olun.");
    }
  };

  const handleMicClick = () => {
    if (!localStream) {
      requestMediaPermissions('audio');
    } else {
      toggleMic();
    }
  };

  const [spotlightId, setSpotlightId] = React.useState(null);

  const handleVideoClick = () => {
    if (isVideoOn) {
      if (localStream) {
        // Kamerayı tamamen kapat (Yeşil ışığı söndür)
        const videoTracks = localStream.getVideoTracks();
        videoTracks.forEach(track => {
          localStream.removeTrack(track);
          track.stop();
        });

        // Kamerasız halimizle herkese yeniden bağlan
        Object.values(callsRef.current).forEach(c => c.close());
        callsRef.current = {};

        if (peer && socket) {
          const roomUsers = useAppStore.getState().roomUsers;
          const myPeerId = useAppStore.getState().myPeerId;
          const usersInRoom = roomUsers[activeVoiceChannel] || [];

          usersInRoom.forEach(u => {
            if (u.peerId !== myPeerId) {
              const call = peer.call(u.peerId, localStream);
              call.on('stream', (userVideoStream) => {
                addRemoteStream(u.peerId, userVideoStream);
              });
              call.on('close', () => {
                if (callsRef.current[u.peerId] === call) {
                  removeRemoteStream(u.peerId);
                }
              });
              callsRef.current[u.peerId] = call;
            }
          });
        }
      }
      useAppStore.getState().toggleVideo();
    } else {
      // Yeniden izin isteyerek kamerayı başlat (Çünkü track.stop() ile tamamen öldürdük)
      requestMediaPermissions('video');
    }
  };

  const handleScreenShareClick = async () => {
    if (isScreenSharing) {
      toggleScreenShare(); 
      // Ekran paylaşımını kapatırken tekrar kameraya dön
      requestMediaPermissions(isVideoOn ? 'video' : 'audio');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // Eski kamerayı kapat
      if (localStream) {
        const oldVideoTrack = localStream.getVideoTracks()[0];
        if (oldVideoTrack) oldVideoTrack.stop();
      }

      // Yeni bir karma stream oluştur (Mevcut ses + Yeni Ekran Görüntüsü)
      const newStream = new MediaStream();
      if (localStream && localStream.getAudioTracks().length > 0) {
        newStream.addTrack(localStream.getAudioTracks()[0]);
      }
      newStream.addTrack(screenTrack);
      
      setLocalStream(newStream);

      // Herkesle olan mevcut bağlantıyı kopar ve EKRANLI HALİYLE YENİDEN ARA
      Object.values(callsRef.current).forEach(c => c.close());
      callsRef.current = {};

      if (peer && socket) {
        const roomUsers = useAppStore.getState().roomUsers;
        const myPeerId = useAppStore.getState().myPeerId;
        const usersInRoom = roomUsers[activeVoiceChannel] || [];

        usersInRoom.forEach(u => {
          if (u.peerId !== myPeerId) {
            const call = peer.call(u.peerId, newStream);
            call.on('stream', (userVideoStream) => {
              addRemoteStream(u.peerId, userVideoStream);
            });
            call.on('close', () => {
              if (callsRef.current[u.peerId] === call) {
                removeRemoteStream(u.peerId);
              }
            });
            callsRef.current[u.peerId] = call;
          }
        });
      }

      screenTrack.onended = () => {
        if (useAppStore.getState().isScreenSharing) {
          handleScreenShareClick(); 
        }
      };

      toggleScreenShare();
      setSpotlightId('local'); // Ekran paylaşıldığında otomatik büyüt

    } catch (err) {
      console.error("Ekran paylaşılamadı:", err);
    }
  };

  const handleDisconnect = () => {
    Object.values(callsRef.current).forEach(call => call.close());
    callsRef.current = {};
    clearRemoteStreams();
    disconnectMedia();
    useAppStore.getState().setActiveVoiceChannel(null); 
    setSpotlightId(null);
  };

  const toggleSpotlight = (id) => {
    setSpotlightId(prev => prev === id ? null : id);
  };

  const getPeerUsername = (peerId) => {
    const channelUsers = useAppStore.getState().roomUsers[useAppStore.getState().activeVoiceChannel] || [];
    const user = channelUsers.find(u => u.peerId === peerId);
    return user ? user.username : null;
  };

  // Render Helpers
  const renderLocalVideo = (isSpotlight = false) => {
    const displayName = useAppStore.getState().username || 'Sen';
    return localStream ? (
      <div 
        onClick={() => toggleSpotlight('local')}
        className={`bg-black rounded-xl relative group overflow-hidden border border-zinc-700 shadow-lg flex items-center justify-center cursor-pointer transition-all ${isSpotlight ? 'w-full h-full' : 'aspect-video w-full'}`}
      >
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full ${isScreenSharing ? 'object-contain' : 'object-cover'} ${!(isVideoOn || isScreenSharing) ? 'hidden' : ''}`}
        />
        {!(isVideoOn || isScreenSharing) && (
          <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center border-4 border-zinc-700 shadow-inner">
            <span className="text-3xl font-bold text-zinc-400">{displayName.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-sm text-zinc-100 z-10">
          {displayName} {isScreenSharing && "(Ekran Paylaşımı)"}
        </div>
        {!isMicOn && (
          <div className="absolute top-3 right-3 bg-red-500/80 p-1.5 rounded-full text-white backdrop-blur-sm z-10">
            <MicOff size={16} />
          </div>
        )}
      </div>
    ) : (
      <div className={`bg-zinc-950 rounded-xl relative group overflow-hidden border border-zinc-800 shadow-lg flex flex-col items-center justify-center text-zinc-500 ${isSpotlight ? 'w-full h-full' : 'aspect-video w-full'}`}>
        <VideoOff size={48} className="mb-4 opacity-50" />
        <p>Kanala katılmak için tıklayın</p>
      </div>
    )
  };

  const renderRemoteVideo = (rs, isSpotlight = false) => (
    <div key={rs.peerId} onClick={() => toggleSpotlight(rs.peerId)} className={`cursor-pointer transition-all ${isSpotlight ? 'w-full h-full' : 'w-full'}`}>
      <RemoteVideo 
        stream={rs.stream} 
        peerId={rs.peerId} 
        isMuted={mutedPeers.includes(rs.peerId)} 
        username={getPeerUsername(rs.peerId)}
      />
    </div>
  );

  return (
    <div className="flex-1 bg-zinc-800/50 flex flex-col relative">
      <div className="h-12 bg-zinc-800/80 backdrop-blur flex items-center px-4 border-b border-zinc-800/50 shadow-sm z-10 justify-between flex-shrink-0">
        <div className="flex items-center text-zinc-100 font-semibold">
          <Hash size={20} className="text-zinc-400 mr-2" />
          {activeChannel}
        </div>
        <div className="flex items-center space-x-4 text-zinc-400">
          <button 
            onClick={() => useAppStore.getState().toggleChat()}
            className={`hover:text-zinc-200 cursor-pointer transition-colors p-1.5 rounded-lg ${useAppStore.getState().isChatOpen ? 'bg-zinc-700 text-zinc-200' : ''}`}
            title="Sohbeti Aç/Kapat"
          >
            <MessageSquare size={20} />
          </button>
        </div>
      </div>

      {/* Video Area */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 bg-zinc-900/30 gap-4">
        
        {spotlightId ? (
          // Spotlight Layout
          <>
            <div className="flex-1 min-h-0 w-full flex items-center justify-center bg-zinc-950/50 rounded-xl p-2 border border-zinc-800">
              {spotlightId === 'local' 
                ? renderLocalVideo(true) 
                : remoteStreams.find(rs => rs.peerId === spotlightId) 
                  ? renderRemoteVideo(remoteStreams.find(rs => rs.peerId === spotlightId), true)
                  : renderLocalVideo(true) // Fallback if peer disconnects
              }
            </div>
            
            {/* Küçük Tumbnailler */}
            <div className="h-32 lg:h-40 flex-shrink-0 flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
              {spotlightId !== 'local' && (
                <div className="h-full aspect-video flex-shrink-0">
                  {renderLocalVideo(false)}
                </div>
              )}
              {remoteStreams.filter(rs => rs.peerId !== spotlightId).map(rs => (
                <div key={rs.peerId} className="h-full aspect-video flex-shrink-0">
                  {renderRemoteVideo(rs, false)}
                </div>
              ))}
            </div>
          </>
        ) : (
          // Grid Layout
          <div className="w-full h-full overflow-y-auto grid gap-4 grid-cols-1 lg:grid-cols-2 place-content-center">
            {renderLocalVideo(false)}
            {remoteStreams.map(rs => renderRemoteVideo(rs, false))}
          </div>
        )}

      </div>

      {/* Call Controls */}
      <div className="h-24 bg-zinc-900/80 backdrop-blur flex items-center justify-center space-x-4 border-t border-zinc-800/50 pb-4">
        <button 
          onClick={handleMicClick}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md ${isMicOn ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-500 hover:bg-red-600 text-white'}`}
        >
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button 
          onClick={handleVideoClick}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md ${isVideoOn ? 'bg-zinc-700 hover:bg-zinc-600' : 'bg-red-500 hover:bg-red-600 text-white'}`}
        >
          {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <button 
          onClick={handleScreenShareClick}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md ${isScreenSharing ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-zinc-700 hover:bg-zinc-600'}`}
        >
          <MonitorUp size={20} />
        </button>
        <button 
          onClick={handleDisconnect}
          className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center hover:bg-rose-600 transition-colors shadow-md text-white"
        >
          <PhoneOff size={20} />
        </button>
      </div>
    </div>
  );
}
