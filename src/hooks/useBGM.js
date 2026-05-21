import { useEffect, useRef } from 'react';

export function useBGM(appMode, gameStatus, bgmVolume) {
  const menuBgmRef = useRef(null);
  const playBgmRef = useRef(null);

  // BGMファイルの初期化
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

  // 音量の同期
  useEffect(() => {
    if (menuBgmRef.current) menuBgmRef.current.volume = bgmVolume;
    if (playBgmRef.current) playBgmRef.current.volume = bgmVolume;
  }, [bgmVolume]);

  // ゲームステータスに応じた再生・停止
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

    if (gameStatus === 'MENU' || gameStatus === 'READY' || gameStatus === 'GAMEOVER') {
      pauseAudioSafely(playBgmRef);
      if (playBgmRef.current) playBgmRef.current.currentTime = 0;
      playAudioSafely(menuBgmRef);
    } else if (gameStatus === 'PLAYING') {
      pauseAudioSafely(menuBgmRef);
      playAudioSafely(playBgmRef);
    }
  }, [gameStatus, appMode]);

  // ブラウザの自動再生ブロック対策
  useEffect(() => {
    if (appMode !== 'HOST_MENU') return;
    const handleFirstClick = () => {
      if ((gameStatus === 'MENU' || gameStatus === 'READY' || gameStatus === 'GAMEOVER') && menuBgmRef.current && menuBgmRef.current.paused) {
        menuBgmRef.current.play().catch(e => e);
      }
      window.removeEventListener('click', handleFirstClick);
    };
    window.addEventListener('click', handleFirstClick);
    return () => window.removeEventListener('click', handleFirstClick);
  }, [appMode, gameStatus]);
}