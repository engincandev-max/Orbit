import React from 'react';
import Sidebar from './components/Sidebar';
import MainStage from './components/MainStage';
import RightPanel from './components/RightPanel';
import SettingsModal from './components/SettingsModal';
import WelcomeModal from './components/WelcomeModal';
import useAppStore from './store/useAppStore';

function App() {
  const { isChatOpen } = useAppStore();

  return (
    <div className="flex h-screen w-full bg-zinc-900 text-zinc-100 overflow-hidden font-sans">
      <WelcomeModal />
      <Sidebar />
      <MainStage />
      {isChatOpen && <RightPanel />}
      <SettingsModal />
    </div>
  );
}

export default App;
