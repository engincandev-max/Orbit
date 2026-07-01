import React, { useEffect, useState } from 'react';
import { X, Mic, Video, Volume2, Settings } from 'lucide-react';
import useAppStore from '../store/useAppStore';

export default function SettingsModal() {
  const { 
    isSettingsOpen, 
    setSettingsOpen,
    selectedMicId,
    selectedSpeakerId,
    selectedCameraId,
    setSelectedMicId,
    setSelectedSpeakerId,
    setSelectedCameraId,
    disconnectMedia,
    voiceThreshold,
    setVoiceThreshold,
    currentVolume,
    isMicOn,
    username,
    setUsername,
    socket,
    setCurrentVolume,
    autoGainControl,
    setAutoGainControl,
    noiseSuppression,
    setNoiseSuppression
  } = useAppStore();

  const [editUsername, setEditUsername] = useState('');

  const [devices, setDevices] = useState({
    audioinput: [],
    audiooutput: [],
    videoinput: []
  });

  useEffect(() => {
    let audioContext;
    let analyser;
    let microphone;
    let animationId;

    if (isSettingsOpen) {
      setEditUsername(username || '');
      
      // Video izni istemiyoruz çünkü MainStage'de açık olan kamerayı kesip siyah ekrana düşürüyor!
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Stream'i cleanup'ta durdurmak için referans alalım
          window._settingsTempStream = stream;

          // Cihaz listesi için izinleri aldık, donanımları listeleyelim
          return navigator.mediaDevices.enumerateDevices().then(deviceInfos => {
            const categorized = { audioinput: [], audiooutput: [], videoinput: [] };
            deviceInfos.forEach(device => {
              if (categorized[device.kind]) {
                categorized[device.kind].push({
                  deviceId: device.deviceId,
                  label: device.label || `Cihaz ${categorized[device.kind].length + 1}`
                });
              }
            });
            setDevices(categorized);
            
            // Mikrofon test çubuğu için bağımsız bir ses analizörü kur (Odaya girmeden bile çalışsın)
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
              audioContext.resume();
            }
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);
            analyser.fftSize = 256;
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const updateVolume = () => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const volume = Math.min(100, Math.round((sum / dataArray.length / 255) * 100 * 2));
              setCurrentVolume(volume);
              animationId = requestAnimationFrame(updateVolume);
            };
            updateVolume();
          });
        })
        .catch(err => {
          console.error("Cihazlar veya mikrofon alınamadı:", err);
        });
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (microphone) microphone.disconnect();
      if (analyser) analyser.disconnect();
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
      if (window._settingsTempStream) {
        window._settingsTempStream.getTracks().forEach(track => track.stop());
        window._settingsTempStream = null;
      }
      setCurrentVolume(0); // Çıkarken sıfırla
    };
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  const handleDeviceChange = (type, value) => {
    if (type === 'mic') setSelectedMicId(value);
    if (type === 'speaker') setSelectedSpeakerId(value);
    if (type === 'camera') setSelectedCameraId(value);
    
    // Değişikliğin anında yansıması için mevcut yayını kesip baştan bağlanmalarını sağlamak en kolayıdır
    disconnectMedia();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl w-full max-w-xl flex flex-col shadow-2xl border border-zinc-800">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Settings className="mr-2" size={24} />
            Ayarlar
          </h2>
          <button 
            onClick={() => setSettingsOpen(false)}
            className="text-zinc-400 hover:text-white transition-colors bg-zinc-800/50 hover:bg-zinc-800 p-2 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          
          {/* Kullanıcı Profili */}
          <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Profil</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Kullanıcı Adı</label>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    maxLength={20}
                  />
                  <button
                    onClick={() => {
                      if (editUsername.trim().length >= 2) {
                        setUsername(editUsername.trim());
                        if (socket) {
                          socket.emit('update-username', editUsername.trim());
                        }
                      }
                    }}
                    disabled={editUsername.trim() === username || editUsername.trim().length < 2}
                    className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Audio Input (Microphone) */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center">
              <Mic size={16} className="mr-2" />
              Giriş Cihazı (Mikrofon)
            </h3>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-1">
              <select 
                className="w-full bg-transparent text-white p-2 outline-none cursor-pointer"
                value={selectedMicId}
                onChange={(e) => handleDeviceChange('mic', e.target.value)}
              >
                <option value="default">Varsayılan (Default)</option>
                {devices.audioinput.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <label className="flex items-center space-x-2 text-sm text-zinc-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={noiseSuppression} 
                  onChange={(e) => setNoiseSuppression(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-950"
                />
                <span>Yapay Zeka Gürültü Engelleyici (Noise Suppression)</span>
              </label>
              
              <label className="flex items-center space-x-2 text-sm text-zinc-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={autoGainControl} 
                  onChange={(e) => setAutoGainControl(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-950"
                />
                <span>Otomatik Ses Yüksekliği (Auto Gain Control)</span>
              </label>
            </div>
          </div>

          {/* Audio Output (Speaker) */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center">
              <Volume2 size={16} className="mr-2" />
              Çıkış Cihazı (Hoparlör)
            </h3>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-1">
              <select 
                className="w-full bg-transparent text-white p-2 outline-none cursor-pointer"
                value={selectedSpeakerId}
                onChange={(e) => handleDeviceChange('speaker', e.target.value)}
              >
                <option value="default">Varsayılan (Default)</option>
                {devices.audiooutput.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Video Input (Camera) */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider flex items-center">
              <Video size={16} className="mr-2" />
              Kamera
            </h3>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-1">
              <select 
                className="w-full bg-transparent text-white p-2 outline-none cursor-pointer"
                value={selectedCameraId}
                onChange={(e) => handleDeviceChange('camera', e.target.value)}
              >
                <option value="default">Varsayılan (Default)</option>
                {devices.videoinput.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Ses Aktivitesi (VAD) */}
          <div className="space-y-3 pt-4 border-t border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
              Ses Hassasiyeti (Voice Activity)
            </h3>
            
            <div className="flex flex-col gap-4 bg-zinc-950 p-4 rounded-lg border border-zinc-800">
              {/* Mikrofon Test Çubuğu */}
              {/* Birleşik Mikrofon Test Çubuğu ve Kaydırıcı (Discord Style) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-zinc-500 font-medium mb-1">
                  <span>Mikrofon Testi ve Eşik Ayarı</span>
                  <span>{isMicOn ? 'Aktif' : 'Mikrofon Kapalı'}</span>
                </div>
                
                {/* Etkileşimli Bar */}
                <div className="h-6 w-full bg-zinc-900 rounded-full relative border border-zinc-800 overflow-hidden group">
                  
                  {/* Dolum çubuğu (Volume) */}
                  <div 
                    className={`absolute top-0 bottom-0 left-0 transition-all duration-75 ${currentVolume >= voiceThreshold ? 'bg-emerald-500' : 'bg-yellow-500'}`}
                    style={{ width: `${currentVolume}%` }}
                  ></div>

                  {/* Görünmez Range Input (Sürüklemek için) */}
                  <input 
                    type="range" 
                    min="0" max="100" 
                    value={voiceThreshold}
                    onChange={(e) => setVoiceThreshold(parseInt(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    title="Eşiği Ayarlamak İçin Sürükleyin"
                  />

                  {/* Kırmızı Desibel Eşik Çizgisi (Marker) */}
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-red-500 z-10 pointer-events-none group-hover:w-1.5 transition-all shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                    style={{ left: `calc(${voiceThreshold}% - 2px)` }}
                  ></div>
                </div>
                
                <div className="flex justify-between text-[11px] text-zinc-500 mt-2">
                  <span>Geçerli Eşik: {voiceThreshold}%</span>
                  <span>Kırmızı çizgiyi sürükleyerek ayarlayın.</span>
                </div>
              </div>
            </div>
          </div>
          
        </div>
        
        {/* Footer */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-900/50 flex justify-end">
          <button 
            onClick={() => setSettingsOpen(false)}
            className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
          >
            Kaydet ve Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
