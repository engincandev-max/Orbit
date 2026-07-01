import React, { useState, useEffect } from 'react';
import useAppStore from '../store/useAppStore';

export default function WelcomeModal() {
  const { username, setUsername, serverPassword, setServerPassword } = useAppStore();
  const [inputName, setInputName] = useState(username || '');
  const [inputPassword, setInputPassword] = useState(serverPassword || '');
  const [channelName, setChannelName] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinChannel = params.get('join');
    if (joinChannel) {
      setChannelName(joinChannel);
    }
  }, []);

  if (username && serverPassword) return null; // İsim ve şifre varsa gösterme

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputName.trim().length >= 2 && inputPassword.trim().length > 0) {
      setUsername(inputName.trim());
      setServerPassword(inputPassword.trim());
      // Anında giriş yap
      useAppStore.getState().socket.emit('login', inputPassword.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl max-w-md w-full relative overflow-hidden">
        {/* Dekoratif arkaplan efekti */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/30">
              <span className="text-2xl">O</span>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-white mb-2">
            Orbit'e Hoş Geldiniz
          </h2>
          
          {channelName ? (
            <p className="text-center text-emerald-400 mb-6 font-medium bg-emerald-500/10 py-2 rounded-lg border border-emerald-500/20">
              {channelName} kanalına davet edildiniz!
            </p>
          ) : (
            <p className="text-center text-zinc-400 mb-6">Sunucuya bağlanmak için bilgilerinizi girin.</p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!username && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Kullanıcı Adı</label>
                <input 
                  type="text" 
                  value={inputName}
                  onChange={(e) => setInputName(e.target.value)}
                  placeholder="Örn: Ahmet, Ayşe, ProGamer..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoFocus={!username}
                  maxLength={20}
                />
              </div>
            )}
            
            {!serverPassword && (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Sunucu Şifresi</label>
                <input 
                  type="password" 
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  placeholder="Şifreyi girin"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  autoFocus={!!username}
                />
                <p className="text-xs text-zinc-500 mt-2">Şifre cihazınıza kaydedilir, bir daha sorulmaz.</p>
              </div>
            )}
            
            <button 
              type="submit" 
              disabled={inputName.trim().length < 2 || inputPassword.trim().length === 0}
              className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold py-3 rounded-lg transition-all shadow-md shadow-indigo-500/20 disabled:shadow-none mt-4"
            >
              {channelName ? 'Odasına Katıl' : 'Bağlan'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
