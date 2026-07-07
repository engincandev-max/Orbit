import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { io } from 'socket.io-client';
import { Peer } from 'peerjs';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5001';
const socket = io(SERVER_URL);

// Parse SERVER_URL for PeerJS
const url = new URL(SERVER_URL);
const isSecure = url.protocol === 'https:';
const peer = new Peer(undefined, {
  host: url.hostname,
  port: url.port ? url.port : (isSecure ? 443 : 80),
  path: '/peerjs',
  secure: isSecure
});

const useAppStore = create(
  persist(
    (set, get) => {
      // Socket bağlantısı kurulduğunda veya yeniden bağlandığında otomatik giriş yap
      socket.on('connect', () => {
        const { serverPassword } = get();
        if (serverPassword) {
          socket.emit('login', serverPassword);
        }
      });

      peer.on('open', (id) => {
        set({ myPeerId: id });
        console.log('My Peer ID:', id);
        // Eğer daha önceden kanala tıklanmışsa ama peer henüz hazır değilse, şimdi bağlan
        const { activeVoiceChannel, username, serverPassword } = get();
        if (activeVoiceChannel) {
          socket.emit('join-room', activeVoiceChannel, id, username, serverPassword);
        }
      });

      // Socket.io dinleyicisi: Gelen mesajı alıp doğru kanala yazar
      socket.on('receive-message', (data) => {
        const { channel, message } = data;
        set((state) => {
          const currentMessages = state.messagesByChannel[channel] || [];
          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [channel]: [...currentMessages, message]
            }
          };
        });
      }); // Added missing closing bracket here!

      // Socket.io dinleyicisi: Odalardaki kullanıcı listesini günceller (Discord tarzı)
      socket.on('room-users-update', (rooms) => {
        set({ roomUsers: rooms });
      });

      // Socket.io dinleyicisi: Odaya giriş veya sunucu giriş hatası (sunucu kapalı vb.)
      socket.on('join-error', (msg) => {
        alert(msg);
        set({ activeVoiceChannel: null, serverPassword: '' }); // Katılımı iptal et ve şifreyi temizle
      });
      
      socket.on('login-error', (msg) => {
        alert(msg);
        set({ serverPassword: '' });
      });

      return {
        socket,
        peer,
        username: '',
        setUsername: (name) => set({ username: name }),
        serverPassword: '',
        setServerPassword: (pwd) => set({ serverPassword: pwd }),
        myPeerId: null,
        roomUsers: {}, // Hangi odada kimlerin olduğu: { 'Oyun Odası': ['id1', 'id2'] }

        // Active Channel State
        activeChannel: 'Genel Sohbet',
        setActiveChannel: (channel) => set({ activeChannel: channel }),
        
        activeVoiceChannel: null,
        setActiveVoiceChannel: (channel) => {
          const state = get();
          
          if (state.activeVoiceChannel !== channel) {
            // Eğer bir kanaldan çıkıyorsak (yeni kanal null veya başka bir kanalsa) eski kanaldan ayrıl
            if (state.activeVoiceChannel && state.myPeerId) {
              socket.emit('leave-room', state.activeVoiceChannel, state.myPeerId);
            }

            // Eğer kanaldan ayrılıyor veya kanal değiştiriyorsak, mevcut yayınları temizle
            state.clearRemoteStreams && state.clearRemoteStreams();
            
            set({ activeVoiceChannel: channel });
            
            if (channel) {
              const { myPeerId, username, serverPassword } = get();
              if (myPeerId) {
                socket.emit('join-room', channel, myPeerId, username, serverPassword);
              }
            }
          }
        },

      // Media Stream State (Not persisted)
      localStream: null,
      setLocalStream: (stream) => set({ localStream: stream }),
      
      remoteStreams: [], // Array of { peerId, stream }
      addRemoteStream: (peerId, stream) => set((state) => {
        const exists = state.remoteStreams.find(rs => rs.peerId === peerId);
        if (exists) {
          // Eğer zaten varsa, yeni stream ile güncelle (Sonradan kamera/mikrofon açılma durumu için)
          return {
            remoteStreams: state.remoteStreams.map(rs => 
              rs.peerId === peerId ? { ...rs, stream } : rs
            )
          };
        }
        return { remoteStreams: [...state.remoteStreams, { peerId, stream }] };
      }),
      removeRemoteStream: (peerId) => set((state) => ({
        remoteStreams: state.remoteStreams.filter(rs => rs.peerId !== peerId)
      })),
      clearRemoteStreams: () => set({ remoteStreams: [] }),

      // Settings State
      isSettingsOpen: false,
      setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
      selectedMicId: 'default',
      selectedSpeakerId: 'default',
      selectedCameraId: 'default',
      inputVolume: 100, // 0 to 200%
      autoGainControl: true, // Otomatik Ses Kazancı
      noiseSuppression: true, // Gürültü Engelleme
      setSelectedMicId: (id) => set({ selectedMicId: id }),
      setSelectedSpeakerId: (id) => set({ selectedSpeakerId: id }),
      setSelectedCameraId: (id) => set({ selectedCameraId: id }),
      setInputVolume: (val) => set({ inputVolume: val }),
      setAutoGainControl: (val) => set({ autoGainControl: val }),
      setNoiseSuppression: (val) => set({ noiseSuppression: val }),

      // Voice Activity Detection (VAD) State
      voiceThreshold: 30, // 0-100 arası desibel eşiği
      setVoiceThreshold: (val) => set({ voiceThreshold: val }),
      currentVolume: 0, // Anlık mikrofon ses seviyesi (Görselleştirme için)
      setCurrentVolume: (val) => set({ currentVolume: val }),

      speakingPeers: [],
      setPeerSpeaking: (peerId, isSpeaking) => set(state => {
        const isCurrentlySpeaking = state.speakingPeers.includes(peerId);
        if (isSpeaking && !isCurrentlySpeaking) {
          return { speakingPeers: [...state.speakingPeers, peerId] };
        } else if (!isSpeaking && isCurrentlySpeaking) {
          return { speakingPeers: state.speakingPeers.filter(id => id !== peerId) };
        }
        return state;
      }),

      // Media Controls State
      isMicOn: false,
      isVideoOn: false,
      isScreenSharing: false,
      isDeafened: false,
      isChatOpen: true,

      toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),

      // Hardware toggles
      toggleMic: () => {
        const { localStream, isMicOn, isDeafened, socket } = get();
        // Sağırlaştırılmışsa mikrofon açılamaz
        if (isDeafened) return; 

        if (localStream) {
          localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMicOn;
          });
        }
        
        const newIsMicOn = !isMicOn;
        if (socket) {
          socket.emit('update-media-status', { isMuted: !newIsMicOn, isDeafened });
        }
        
        set({ isMicOn: newIsMicOn });
      },

      toggleDeafen: () => {
        const { isDeafened, isMicOn, localStream, socket } = get();
        const newDeafenedState = !isDeafened;
        
        // Eğer kulaklık kapatılıyorsa, mikrofon da zorunlu kapatılır
        if (newDeafenedState && isMicOn) {
          if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = false);
          }
          if (socket) {
            socket.emit('update-media-status', { isMuted: true, isDeafened: newDeafenedState });
          }
          set({ isDeafened: newDeafenedState, isMicOn: false });
        } else {
          if (socket) {
            socket.emit('update-media-status', { isMuted: !isMicOn, isDeafened: newDeafenedState });
          }
          set({ isDeafened: newDeafenedState });
        }
      },

      toggleVideo: () => {
        const { localStream, isVideoOn } = get();
        if (localStream) {
          localStream.getVideoTracks().forEach(track => {
            track.enabled = !isVideoOn;
          });
        }
        set({ isVideoOn: !isVideoOn });
      },

      toggleScreenShare: () => set((state) => ({ isScreenSharing: !state.isScreenSharing })),

      // Remote User Muting (Local Mute)
      mutedPeers: [],
      togglePeerMute: (peerId) => set((state) => {
        const isMuted = state.mutedPeers.includes(peerId);
        return {
          mutedPeers: isMuted 
            ? state.mutedPeers.filter(id => id !== peerId) 
            : [...state.mutedPeers, peerId]
        };
      }),

      disconnectMedia: () => {
        const { localStream, socket, activeVoiceChannel, myPeerId } = get();
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
        }
        
        if (socket && activeVoiceChannel && myPeerId) {
          socket.emit('leave-room', activeVoiceChannel, myPeerId);
        }

        set({ 
          localStream: null, 
          isMicOn: false, 
          isVideoOn: false, 
          isScreenSharing: false,
          activeVoiceChannel: null,
          remoteStreams: [] 
        });
      },

      // Chat State (Persisted)
      messagesByChannel: {
        'Genel Sohbet': [
          { id: 1, user: 'U1', username: 'Kullanıcı 1', time: '14:30', text: 'Selam, burası genel sohbet.', color: 'bg-indigo-500' }
        ]
      },
      addMessage: (text, senderName) => set((state) => {
        if (!state.activeChannel) return state;
        const currentMessages = state.messagesByChannel[state.activeChannel] || [];
        const newMessage = {
          id: Date.now(),
          user: senderName ? senderName.charAt(0).toUpperCase() : 'S',
          username: senderName || 'Sen',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text,
          color: 'bg-emerald-500' // Local user color
        };
        
        // Broadcast via Socket
        if (state.socket) {
          state.socket.emit('send-message', state.activeChannel, { channel: state.activeChannel, message: newMessage });
        }

        return {
          messagesByChannel: {
            ...state.messagesByChannel,
            [state.activeChannel]: [...currentMessages, newMessage]
          }
        };
      }),
    }; // Close the returned object
    }, // Close the creator function
    {
      name: 'orbit-storage-v3', // name of the item in the storage (must be unique)
      partialize: (state) => ({ 
        messages: state.messages, // Keep the old messages key for migration
        messagesByChannel: state.messagesByChannel,
        selectedMicId: state.selectedMicId,
        selectedSpeakerId: state.selectedSpeakerId,
        selectedCameraId: state.selectedCameraId,
        inputVolume: state.inputVolume,
        autoGainControl: state.autoGainControl,
        noiseSuppression: state.noiseSuppression,
        voiceThreshold: state.voiceThreshold,
        username: state.username,
        serverPassword: state.serverPassword
      }),
      merge: (persistedState, currentState) => {
        // Eski mesaj yapısını yeni çoklu kanal yapısına taşı (Migration)
        if (persistedState.messages && (!persistedState.messagesByChannel || Object.keys(persistedState.messagesByChannel).length === 0)) {
          persistedState.messagesByChannel = {
            'Genel Sohbet': persistedState.messages
          };
        }
        return { ...currentState, ...persistedState };
      }
    }
  )
);

// Sayfa kapatıldığında veya yenilendiğinde sunucuya anında haber ver (Kanalda hayalet olarak kalmamak için)
window.addEventListener('beforeunload', () => {
  const state = useAppStore.getState();
  if (state.activeVoiceChannel && state.myPeerId) {
    socket.emit('leave-room', state.activeVoiceChannel, state.myPeerId);
  }
  socket.disconnect();
  peer.destroy();
});

export default useAppStore;
