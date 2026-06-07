import { useEffect, useRef } from 'react';

export function useBGM(appMode, gameStatus, bgmVolume, isMuted) {
  const menuBgmRef = useRef(null);
  const playBgmRef = useRef(null);

  useEffect(() => {
    if (appMode === 'HOST_MENU') {
      menuBgmRef.current = new Audio('/menu-bgm.mp3');
      menuBgmRef.current.loop = true;
      playBgmRef.current = new Audio('/play-bgm.mp3');
      playBgmRef.current.loop = true;
    }
    return () => {
      if (menuBgmRef.current) { menuBgmRef.current.pause(); menuBgmRef.current = null; }
      if (playBgmRef.current) { playBgmRef.current.pause(); playBgmRef.current = null; }
    };
  }, [appMode]);

  useEffect(() => {
    if (menuBgmRef.current) {
      menuBgmRef.current.volume = bgmVolume;
      menuBgmRef.current.muted = isMuted; // ★ミュート制御を追加
    }
    if (playBgmRef.current) {
      playBgmRef.current.volume = bgmVolume;
      playBgmRef.current.muted = isMuted; // ★ミュート制御を追加
    }
  }, [bgmVolume, isMuted]);

  useEffect(() => {
    if (appMode !== 'HOST_MENU') return;

    const playAudioSafely = (audioRef) => {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.log("Autoplay blocked:", e));
      }
    };
    const pauseAudioSafely = (audioRef) => {
      if (audioRef.current) audioRef.current.pause();
    };

    if (gameStatus === 'MENU' || gameStatus === 'READY' || gameStatus === 'GAMEOVER' || gameStatus === 'SOLO_LEARNING') {
      pauseAudioSafely(playBgmRef);
      if (playBgmRef.current) playBgmRef.current.currentTime = 0;
      playAudioSafely(menuBgmRef);
    } else if (gameStatus === 'PLAYING') {
      pauseAudioSafely(menuBgmRef);
      playAudioSafely(playBgmRef);
    }
  }, [gameStatus, appMode]);

  useEffect(() => {
    if (appMode !== 'HOST_MENU') return;
    const handleFirstClick = () => {
      if (menuBgmRef.current && menuBgmRef.current.paused && (gameStatus === 'MENU' || gameStatus === 'READY' || gameStatus === 'GAMEOVER' || gameStatus === 'SOLO_LEARNING')) {
        menuBgmRef.current.play().catch(e => e);
      }
      window.removeEventListener('click', handleFirstClick);
    };
    window.addEventListener('click', handleFirstClick);
    return () => window.removeEventListener('click', handleFirstClick);
  }, [appMode, gameStatus]);
}