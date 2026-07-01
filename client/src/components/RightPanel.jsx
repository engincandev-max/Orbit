import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import useAppStore from '../store/useAppStore';

export default function RightPanel() {
  const { messagesByChannel, addMessage, activeChannel, username } = useAppStore();
  const [inputText, setInputText] = useState('');

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      addMessage(inputText, username);
      setInputText('');
    }
  };

  const currentMessages = messagesByChannel[activeChannel] || [];

  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800/50 flex flex-col">
      <div className="h-12 border-b border-zinc-800/50 flex items-center px-4 font-semibold shadow-sm text-zinc-100">
        <MessageSquare size={18} className="mr-2 text-zinc-400" />
        Sohbet - {activeChannel}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {currentMessages.map((msg) => (
          <div key={msg.id} className="flex items-start">
            <div className={`w-10 h-10 rounded-full ${msg.color} flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-sm`}>
              {msg.user}
            </div>
            <div className="ml-3 flex flex-col">
              <div className="flex items-baseline">
                <span className="font-medium text-zinc-100 mr-2">{msg.username}</span>
                <span className="text-xs text-zinc-500">{msg.time}</span>
              </div>
              <p className="text-sm text-zinc-300 mt-0.5 leading-relaxed">
                {msg.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 bg-zinc-900 border-t border-zinc-800/50">
        <form onSubmit={handleSendMessage} className="bg-zinc-800 rounded-lg flex items-center px-4 py-2.5 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`#${activeChannel} kanalına yaz...`} 
            className="bg-transparent border-none outline-none text-sm w-full text-zinc-200 placeholder-zinc-500"
          />
        </form>
      </div>
    </div>
  );
}
