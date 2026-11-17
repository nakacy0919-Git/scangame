import { useState, useEffect, useRef, useEffectEvent } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react'; 
import { database, auth, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, ref, get, onValue, set, startMission, submitMission } from './firebase';
import { ALL_TEAMS, findCard, isValidTheme, newId, summarizeRound } from './gameLogic'; 

import './App.css';

import { useBGM } from './hooks/useBGM';
import SettingsModal from './components/SettingsModal';
import LearningMode from './components/LearningMode'; 
import ScannerMission from './components/ScannerMission'; 

import cafeData from './data/cafe.json';
import sdgsData from './data/sdgs.json';
import hotelData from './data/hotel.json';
import airportData from './data/airport.json';
import zooData from './data/zoo.json';
import helpData from './data/help.json'; 
import worldData from './data/world.json'; 
import mediaData from './data/media.json'; 
import volunteerData from './data/volunteer.json'; 
import revitalizationData from './data/revitalization.json';
import worryData from './data/worry.json';
import englishData from './data/english.json';

const GAME_DATA = {
  cafe: { title: 'Scannect : Cafe', codes: cafeData },
  sdgs: { title: 'Scannect : SDGs', codes: sdgsData },
  hotel: { title: 'Scannect : Hotel', codes: hotelData },
  airport: { title: 'Scannect : Airport', codes: airportData },
  zoo: { title: 'Scannect : Zoo', codes: zooData },
  help: { title: 'Scannect : Help', codes: helpData },
  world: { title: 'Scannect : World', codes: worldData },
  media: { title: 'Scannect : Media', codes: mediaData },
  volunteer: { title: 'Scannect : Volunteer', codes: volunteerData },
  revitalization: { title: 'Scannect : Revitalization', codes: revitalizationData },
  worry: { title: 'Scannect : Worries', codes: worryData },
  english: { title: 'Scannect : English Learning', codes: englishData }
};

function playFeedbackSound(file, volume, isMuted) {
  if (isMuted) return;
  const sound = new Audio(file);
  sound.volume = Math.max(0, Math.min(1, volume));
  sound.play().catch(() => {});
}

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const initMode = searchParams.get('mode') === 'scanner' ? 'SCANNER' : 'HOST_MENU';
  const initTeam = ALL_TEAMS.includes(searchParams.get('team')) ? searchParams.get('team') : null;
  const requestedSession = searchParams.get('session');
  const initSession = requestedSession && /^[a-f0-9]{32}$/.test(requestedSession) ? requestedSession : null;

  const appMode = initMode; 
  const [scannerTeam, setScannerTeam] = useState(initTeam);
  const [sessionId, setSessionId] = useState(initMode === 'SCANNER' ? initSession : null);
  const [roundId, setRoundId] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [firebaseError, setFirebaseError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const sessionCreationRef = useRef(false);
  const [sessionRetry, setSessionRetry] = useState(0);
  const serverOffsetRef = useRef(0);
  const scanStreamRef = useRef({ roundKey: null, accepted: new Set() });
  const syncedScansRef = useRef('');
  const feedbackTimerRef = useRef(null); 

  const [activeTheme, setActiveTheme] = useState(null);
  const [gameStatus, setGameStatus] = useState('MENU'); 
  
  const [teamCount, setTeamCount] = useState(2);
  const activeTeams = ALL_TEAMS.slice(0, teamCount); 

  const [scores, setScores] = useState({ A: 0, B: 0, C: 0, D: 0 });
  const [maxCombos, setMaxCombos] = useState({ A: 0, B: 0, C: 0, D: 0 });

  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(null);

  const [selectedMinutes, setSelectedMinutes] = useState(5); 
  const [bgmVolume, setBgmVolume] = useState(0.3);
  const [isMuted, setIsMuted] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false); // ★ここを追加！
  const [activeQrTab, setActiveQrTab] = useState('A'); 
  const [fullScreenQrTeam, setFullScreenQrTeam] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameEndsAt, setGameEndsAt] = useState(null);

  const [activeMissionCard, setActiveMissionCard] = useState(null);
  const [serverChallenge, setServerChallenge] = useState(null); 

  const [serverGameState, setServerGameState] = useState({ status: 'MENU', theme: null, scannedCodes: {} });


  const serverGameStateRef = useRef({ status: 'MENU', theme: null, scannedCodes: {} });
  
  const scannerInstanceRef = useRef(null); 
  const isProcessingScanRef = useRef(false);

  useBGM(appMode, gameStatus, bgmVolume, isMuted);

  useEffect(() => {
    return onValue(ref(database, '.info/serverTimeOffset'), snapshot => {
      serverOffsetRef.current = Number(snapshot.val()) || 0;
    }, () => {});
  }, []);

  useEffect(() => {
    return () => clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setAuthUser(user);
      if (!user && appMode === 'SCANNER') {
        signInAnonymously(auth).catch(error => setFirebaseError(`接続認証に失敗しました: ${error.message}`));
      }
    }, error => setFirebaseError(`認証に失敗しました: ${error.message}`));
    return unsubscribe;
  }, [appMode]);

  useEffect(() => {
    if (appMode !== 'HOST_MENU' || !authUser || authUser.isAnonymous ||
        sessionId || sessionCreationRef.current) return;
    sessionCreationRef.current = true;
    const currentUid = authUser.uid;
    const storageKey = 'scannect_teacher_session_' + currentUid;

    const restoreOrCreate = async () => {
      try {
        let savedId = null;
        try { savedId = localStorage.getItem(storageKey); } catch { /* Private browsing */ }

        if (savedId && /^[a-f0-9]{32}$/.test(savedId)) {
          const ownership = await get(ref(database, `sessions/${savedId}/hostUid`));
          if (ownership.val() === currentUid) {
            const snapshot = await get(ref(database, `sessions/${savedId}/gameState`));
            const state = snapshot.val();
            if (state && ['MENU', 'PLAYING', 'GAMEOVER'].includes(state.status)) {
              const theme = isValidTheme(state.theme, GAME_DATA) ? state.theme : null;
              const endsAt = Number(state.endsAt) || null;
              const count = Number(state.teamCount);
              if (count >= 2 && count <= 4) setTeamCount(count);
              if (state.durationSec >= 180 && state.durationSec <= 900) {
                setSelectedMinutes(Math.round(state.durationSec / 60));
              }
              setActiveTheme(theme);
              setRoundId(state.roundId || null);
              setGameEndsAt(endsAt);
              const expired = state.status === 'PLAYING' && endsAt !== null &&
                endsAt <= Date.now() + serverOffsetRef.current;
              setTimeLeft(state.status === 'PLAYING' && endsAt
                ? Math.max(0, Math.ceil((endsAt - Date.now() - serverOffsetRef.current) / 1000))
                : 0);
              setGameStatus(expired ? 'GAMEOVER' : (state.status === 'PLAYING' && (!theme || !endsAt)
                ? 'MENU' : state.status));
              if (expired) {
                await set(ref(database, `sessions/${savedId}/gameState/status`), 'GAMEOVER');
              }
            }
            setSessionId(savedId);
            setFirebaseError('');
            return;
          }
        }

        const id = newId();
        await set(ref(database, `sessions/${id}/hostUid`), currentUid);
        await set(ref(database, `sessions/${id}/gameState`), {
          status: 'MENU', teamCount: 2, scannedCodes: {}
        });
        try { localStorage.setItem(storageKey, id); } catch { /* Private browsing */ }
        setSessionId(id);
        setFirebaseError('');
      } catch (error) {
        setFirebaseError(`授業セッションの接続・復旧に失敗しました: ${error.message}`);
      } finally {
        sessionCreationRef.current = false;
      }
    };
    restoreOrCreate();
  }, [appMode, authUser, sessionId, sessionRetry]);

  const signInAsHost = async () => {
    setFirebaseError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setFirebaseError(`先生のログインに失敗しました: ${error.message}`);
    }
  };



  const selectTheme = (theme) => {
    setActiveTheme(theme);
    setGameStatus('READY');
  };

  const handleStartGame = async () => {
    if (!sessionId || !authUser || authUser.isAnonymous || !isValidTheme(activeTheme, GAME_DATA)) {
      setFirebaseError('先生の認証と授業セッションを確認してください。');
      return;
    }
    try {
      const nextRoundId = newId();
      const expiresAt = Math.round(Date.now() + serverOffsetRef.current + selectedMinutes * 60_000);
      await set(ref(database, `sessions/${sessionId}/gameState`), {
        status: 'PLAYING',
        theme: activeTheme,
        roundId: nextRoundId,
        endsAt: expiresAt,
        durationSec: selectedMinutes * 60,
        teamCount,
        scannedCodes: {}
      });
      setRoundId(nextRoundId);
      setGameEndsAt(expiresAt);
      setScores({ A: 0, B: 0, C: 0, D: 0 });
      setMaxCombos({ A: 0, B: 0, C: 0, D: 0 });
      setTimeLeft(selectedMinutes * 60);
      scanStreamRef.current = { roundKey: null, accepted: new Set() };
      syncedScansRef.current = '';
      setMessage('');
      setGameStatus('PLAYING');
      setFirebaseError('');
    } catch (error) {
      setFirebaseError(`ゲーム開始に失敗しました: ${error.message}`);
    }
  };

  const beginNewClass = async () => {
    if (!sessionId || !authUser || gameStatus === 'PLAYING') return;
    try {
      await set(ref(database, `sessions/${sessionId}/gameState/status`), 'MENU');
      try { localStorage.removeItem('scannect_teacher_session_' + authUser.uid); } catch { /* Private browsing */ }
      scanStreamRef.current = { roundKey: null, accepted: new Set() };
      syncedScansRef.current = '';
      setSessionId(null);
      setRoundId(null);
      setGameEndsAt(null);
      setActiveTheme(null);
      setScores({ A: 0, B: 0, C: 0, D: 0 });
      setMaxCombos({ A: 0, B: 0, C: 0, D: 0 });
      setGameStatus('MENU');
      setFirebaseError('');
    } catch (error) {
      setFirebaseError(`新しい授業を作成できません: ${error.message}`);
    }
  };

  const backToMenu = () => {
    setActiveTheme(null);
    setGameStatus('MENU');
    setRoundId(null);
    setGameEndsAt(null);
    setIsSettingsOpen(false);
    setFullScreenQrTeam(null);
    if (sessionId) {
      set(ref(database, `sessions/${sessionId}/gameState/status`), 'MENU')
        .catch(error => setFirebaseError(`ゲームの終了を送信できません: ${error.message}`));
    }
  };


  const onRoundSnapshot = useEffectEvent(snapshot => {
    if (!isValidTheme(activeTheme, GAME_DATA) || !sessionId || !roundId) return;

    const summary = summarizeRound(
      snapshot.val(), GAME_DATA[activeTheme].codes,
      ALL_TEAMS.slice(0, teamCount), gameEndsAt ?? Infinity
    );

    setScores(summary.scores);
    setMaxCombos(summary.maxCombos);

    // The host is the only client permitted to publish the accepted-code map.
    const serial = JSON.stringify(summary.scannedCodes);
    if (serial !== syncedScansRef.current && gameStatus === 'PLAYING') {
      syncedScansRef.current = serial;
      set(ref(database, `sessions/${sessionId}/gameState/scannedCodes`), summary.scannedCodes)
        .catch(error => {
          syncedScansRef.current = '';
          setFirebaseError(`スキャン済み情報の更新に失敗しました: ${error.message}`);
        });
    }

    const key = sessionId + '/' + roundId;
    if (scanStreamRef.current.roundKey !== key) {
      scanStreamRef.current = { roundKey: key, accepted: new Set(summary.acceptedKeys) };
      return;
    }
    const newlyAccepted = summary.acceptedKeys.filter(id => !scanStreamRef.current.accepted.has(id));
    scanStreamRef.current.accepted = new Set(summary.acceptedKeys);
    if (newlyAccepted.length && gameStatus === 'PLAYING') {
      const justAccepted = summary.acceptedEvents.filter(event => newlyAccepted.includes(event.key));
      const single = justAccepted[0];
      const text = newlyAccepted.length === 1
        ? `✅ MATCH: Team ${single.team} (+${single.earnedPoints} pts)${single.bonus ? ' 🌟 COMBO BONUS!' : ''}`
        : `✅ ${newlyAccepted.length} NEW MATCHES!`;
      setMessage(text);
      setIsSuccess(true);
      playFeedbackSound('/correct.mp3', bgmVolume, isMuted);
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => { setMessage(''); setIsSuccess(null); }, 2000);
    }
  });

  useEffect(() => {
    if (appMode !== 'HOST_MENU' || gameStatus !== 'PLAYING' || !sessionId || !gameEndsAt) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((gameEndsAt - Date.now() - serverOffsetRef.current) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setGameStatus('GAMEOVER');
        set(ref(database, `sessions/${sessionId}/gameState/status`), 'GAMEOVER')
          .catch(error => setFirebaseError(`終了通知に失敗しました: ${error.message}`));
      }
    }, 500);
    return () => clearInterval(timer);
  }, [appMode, gameStatus, gameEndsAt, sessionId]);

  useEffect(() => {
    if (appMode !== 'HOST_MENU' || !['PLAYING', 'GAMEOVER'].includes(gameStatus) ||
        !sessionId || !roundId) return;
    const scansRef = ref(database, `sessions/${sessionId}/rounds/${roundId}/scans`);
    return onValue(scansRef, snapshot => onRoundSnapshot(snapshot),
      error => setFirebaseError(`得点の受信に失敗しました: ${error.message}`));
  }, [appMode, gameStatus, sessionId, roundId]);

  useEffect(() => {
    if (appMode !== 'SCANNER' || !sessionId || !authUser) return;
    const gameStateRef = ref(database, `sessions/${sessionId}/gameState`);
    return onValue(gameStateRef, snapshot => {
      const state = snapshot.val() ?? { status: 'MENU', theme: null, scannedCodes: {} };
      const previousRound = serverGameStateRef.current.roundId;
      serverGameStateRef.current = state;
      setServerGameState(state);
      if (previousRound && previousRound !== state.roundId) {
        setActiveMissionCard(null);
        setServerChallenge(null);
        isProcessingScanRef.current = false;
      }
    }, error => setFirebaseError(`ゲーム状態を取得できません: ${error.message}`));
  }, [appMode, sessionId, authUser]);


const onScanMobile = async (decodedText) => {
    // 処理中（エラー表示など）は新しいスキャンを無視する
    if (isProcessingScanRef.current) return;
    isProcessingScanRef.current = true;

    // ★ フリーズの原因だった pause() は使いません

    const currentGameState = serverGameStateRef.current;
    
    if (currentGameState.status !== 'PLAYING' || !currentGameState.theme) {
      setMessage('⏳ 待機中：PCでゲームを開始してください');
      setIsSuccess(false);
      setTimeout(() => {
        setMessage(''); setIsSuccess(null);
        isProcessingScanRef.current = false; 
      }, 2000);
      return;
    }

    if (!isValidTheme(currentGameState.theme, GAME_DATA)) {
      setMessage('不明なゲームテーマです');
      setTimeout(() => { setMessage(''); isProcessingScanRef.current = false; }, 2000);
      return;
    }
    if (!ALL_TEAMS.slice(0, currentGameState.teamCount ?? 2).includes(scannerTeam)) {
      setMessage('このチームは現在のゲームに参加できません');
      setTimeout(() => { setMessage(''); isProcessingScanRef.current = false; }, 2000);
      return;
    }
    const foundCard = findCard(GAME_DATA[currentGameState.theme].codes, decodedText);

    // ▼ エラー発動用の共通関数（全画面の真っ赤なエラーを出します）
    const triggerError = (msg) => {
      const errorSound = new Audio('/incorrect.mp3');
      errorSound.play().catch(e=>e);
      
      setMessage(msg);
      setIsSuccess(false);
      
      setTimeout(() => { 
        setMessage(''); setIsSuccess(null); 
        isProcessingScanRef.current = false; // エラー表示後にスキャン再開
      }, 2000);
    };

    // ① 読み取れたが、ゲーム内に存在しない文字列だった場合（誤作動など）
    if (!foundCard) {
      triggerError('INCORRECT\n(無効なQRコードです)');
      return;
    }

    // ② すでにスキャン済みの正しいペアだった場合
    const scannedMap = currentGameState.scannedCodes?.[scannerTeam] || {};
    if (scannedMap[foundCard.id]) {
      triggerError('⚠️ 読込済みのペアです！');
      return; 
    }

    // Only the trusted backend may issue a mission; the answer remains private.
    try {
      setMessage('ミッションを準備しています...');
      const response = await startMission({
        sessionId, roundId: currentGameState.roundId, team: scannerTeam,
        cardId: foundCard.id, supportsSpeech: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
      });
      if (serverGameStateRef.current.roundId !== currentGameState.roundId ||
          serverGameStateRef.current.status !== 'PLAYING') {
        throw new Error('ゲームが終了または切り替わりました。');
      }
      setMessage('');
      setServerChallenge(response.data);
      setActiveMissionCard(foundCard);
    } catch (error) {
      setServerChallenge(null);
      triggerError('ミッションを開始できません: ' + error.message);
    }
  };


  const onCameraScan = useEffectEvent(onScanMobile);

  useEffect(() => {
    if (appMode !== 'SCANNER' || !scannerTeam || !sessionId || !authUser) return;
    let mounted = true;
    let startTimer;
    const startCamera = async () => {
      if (!mounted) return;
      if (!document.getElementById('reader')) {
        startTimer = setTimeout(startCamera, 250);
        return;
      }
      const instance = new Html5Qrcode('reader');
      scannerInstanceRef.current = instance;
      try {
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 180, height: 180 }, aspectRatio: 1.0 },
          decodedText => onCameraScan(decodedText),
          () => {}
        );
        if (mounted) setCameraError('');
        if (!mounted) await instance.stop().catch(() => {});
      } catch (error) {
        if (mounted) setCameraError(`カメラを起動できません: ${error.message}`);
      }
    };
    startTimer = setTimeout(startCamera, 300);
    return () => {
      mounted = false;
      clearTimeout(startTimer);
      const instance = scannerInstanceRef.current;
      scannerInstanceRef.current = null;
      if (instance) instance.stop().catch(() => {});
    };
  }, [appMode, scannerTeam, sessionId, authUser]);



  const handleMissionComplete = async (answer) => {
    const state = serverGameStateRef.current;
    if (!activeMissionCard || !serverChallenge || !sessionId || !auth.currentUser ||
        !state.roundId || state.status !== 'PLAYING') {
      setMessage('ゲームの状態が変わりました。もう一度スキャンしてください。');
      setActiveMissionCard(null);
      setServerChallenge(null);
      isProcessingScanRef.current = false;
      return;
    }
    try {
      const response = await submitMission({
        sessionId, roundId: state.roundId, team: scannerTeam,
        cardId: activeMissionCard.id, answer
      });
      const awarded = response.data.points;
      setMessage(response.data.correct === null
        ? `✅ 音読練習完了（チームに+${awarded}点）`
        : `${response.data.correct ? '✅ CORRECT' : '❌ MISS'}（チームに+${awarded}点）`);
      setIsSuccess(response.data.correct !== false);
      setTimeout(() => { setMessage(''); setIsSuccess(null); }, 2200);
      setActiveMissionCard(null);
      setServerChallenge(null);
      isProcessingScanRef.current = false;
    } catch (error) {
      setMessage(`サーバー採点に失敗しました。もう一度スキャンしてください: ${error.message}`);
      setIsSuccess(false);
      setActiveMissionCard(null);
      setServerChallenge(null);
      isProcessingScanRef.current = false;
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const maxScoreValue = Math.max(...activeTeams.map(t => scores[t]));

  if (appMode === 'SCANNER' && (!sessionId || !authUser || firebaseError)) {
    return <div className="main-viewport pattern-bg"><div className="content-wrap glass-card" style={{ padding: 30 }}>
      <h2>Scannect Scanner</h2>
      <p role="alert">{firebaseError || (sessionId ? 'Firebaseに接続しています...' : '先生の画面に表示されたQRコードから参加してください。')}</p>
      {firebaseError && <button className="btn-save" onClick={() => window.location.reload()}>接続を再試行</button>}
    </div></div>;
  }

  if (appMode === 'HOST_MENU' && gameStatus !== 'SOLO_LEARNING' && (!authUser || authUser.isAnonymous || !sessionId)) {
    return <div className="main-viewport pattern-bg"><div className="content-wrap glass-card" style={{ padding: 30 }}>
      <h2>Scannect — Teacher</h2>
      <p>授業ゲームの管理にはGoogleログインが必要です。生徒はQRコードから匿名で参加できます。</p>
      {(!authUser || authUser.isAnonymous) && <button className="start-btn shadow-pop" onClick={signInAsHost}>Googleで先生としてログイン</button>}
      {authUser && !authUser.isAnonymous && !sessionId && <button className="start-btn shadow-pop" onClick={() => {
        setFirebaseError('');
        setSessionRetry(value => value + 1);
      }}>接続を再試行</button>}
      <button className="btn-text-only" onClick={() => setGameStatus('SOLO_LEARNING')}>🎓 Solo Learning（ログイン不要）</button>
      <p role="alert">{firebaseError || 'ログイン後、授業専用QRコードを生成します。'}</p>
    </div></div>;
  }

  if (appMode === 'SCANNER') {
    return (
      <div className="main-viewport pattern-bg">
        {!scannerTeam ? (
          <div className="content-wrap glass-card" style={{padding: '40px'}}>
            <h2 style={{fontSize: '2rem', marginBottom: '30px', color: '#2c3e50'}}>Select Team</h2>
            <div style={{display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center'}}>
               {ALL_TEAMS.map(t => (
                 <button key={t} onClick={() => setScannerTeam(t)} className={`team-btn team-btn-${t.toLowerCase()}`}>TEAM {t}</button>
               ))}
            </div>
          </div>
        ) : (
          <div className="scanner-container">
             <div className={`scanner-header team-${scannerTeam}`}>TEAM {scannerTeam} PLAYING</div>
             
             {/* ★ 修正ポイント：ミッション中は表示し、カメラ部分は「display: none」で隠すだけにする */}
             {activeMissionCard && serverChallenge && (
                <ScannerMission 
                  key={activeMissionCard.id}
                  card={activeMissionCard} 
                  mission={serverChallenge} 
                  onComplete={handleMissionComplete} 
                />
             )}
             
             <div id="reader" style={{ display: activeMissionCard ? 'none' : 'block' }}></div>
             {cameraError && <div role="alert" className="scanner-msg error-full">
                <p>{cameraError}</p>
                <button className="btn-save" onClick={() => window.location.reload()}>カメラを再起動</button>
              </div>}
             
             {/* ★ 修正：不正解時は全画面エラー、待機時は通常のメッセージ */}
             {!activeMissionCard && message && (
               <div className={`scanner-msg ${isSuccess === true ? 'ok' : isSuccess === false ? 'error-full' : ''}`}>
                 {message.split('\n').map((line, i) => <div key={i}>{line}</div>)}
               </div>
             )}
             <button onClick={() => { window.location.href = window.location.pathname + '?mode=scanner&session=' + sessionId; }} className="btn-text-only" style={{marginTop: '20px'}}>Change Team</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`main-viewport ${gameStatus === 'MENU' || gameStatus === 'SOLO_LEARNING' ? 'pattern-bg' : 'gradient-bg'}`}>
      <button className="mute-btn shadow-pop" onClick={() => setIsMuted(!isMuted)}>
        {isMuted ? '🔇' : '🎵'}
      </button>

      {firebaseError && <div role="alert" className="message-bar error">{firebaseError}</div>}
      {gameStatus === 'MENU' && <div className="particles">{[...Array(12)].map((_, i) => <div key={i} className="dot"></div>)}</div>}

      {gameStatus === 'MENU' && (
        <div className="menu-split-container">
          <div className="menu-left-block">
            <img src="/scannetlogo.png" alt="Scannect" className="main-logo-split" />
            <div className="theme-buttons-grid">
              <button onClick={() => selectTheme('cafe')} className="custom-btn"><span>☕ Cafe</span><span className="arrow"></span></button>
              <button onClick={() => selectTheme('sdgs')} className="custom-btn"><span>🌍 SDGs</span><span className="arrow"></span></button>
              <button onClick={() => selectTheme('hotel')} className="custom-btn"><span>🏨 Hotel</span><span className="arrow"></span></button>
              <button onClick={() => selectTheme('airport')} className="custom-btn"><span>✈️ Airport</span><span className="arrow"></span></button>
              <button onClick={() => selectTheme('zoo')} className="custom-btn"><span>🦁 Zoo</span><span className="arrow"></span></button>
              <button onClick={() => selectTheme('help')} className="custom-btn"><span>🤝 Help</span><span className="arrow"></span></button>
              <button onClick={() => selectTheme('world')} className="custom-btn"><span>🗺️ World</span><span className="arrow"></span></button> 
              <button onClick={() => selectTheme('media')} className="custom-btn"><span>📱 Media</span><span className="arrow"></span></button> 
              <button onClick={() => selectTheme('volunteer')} className="custom-btn"><span>🤝 Volunteer</span><span className="arrow"></span></button> 
              <button onClick={() => selectTheme('revitalization')} className="custom-btn"><span>🏙️ Revitalize</span><span className="arrow"></span></button> 
              <button onClick={() => selectTheme('worry')} className="custom-btn"><span>🤔 Worries</span><span className="arrow"></span></button> 
              <button onClick={() => selectTheme('english')} className="custom-btn"><span>📚 English</span><span className="arrow"></span></button>
            </div>

            {/* ▼▼ ここから追加：ダウンロード画面を開くボタン ▼▼ */}
            <button className="dl-trigger-btn shadow-pop" onClick={() => setIsDownloadOpen(true)}>
              📥 教材カード（PDF）をダウンロード
            </button>
            {/* ▲▲ ここまで追加 ▲▲ */}

          </div>
          <div className="menu-right-block">
            <h3 className="qr-section-title">📱 Student Scanner QR</h3>
            <div className="qr-tab-buttons">
              {activeTeams.map(t => (
                <button key={t} onClick={() => setActiveQrTab(t)} className={`qr-tab-btn ${activeQrTab === t ? `active team-${t}` : ''}`}>{t}</button>
              ))}
            </div>
            <div className="qr-display-box clickable-qr" onClick={() => setFullScreenQrTeam(activeQrTab)}>
              <QRCodeSVG
                value={window.location.origin + window.location.pathname + '?mode=scanner&team=' + activeQrTab + '&session=' + sessionId}
                size={320} marginSize={4} level="M" title={`Join Team ${activeQrTab}`}
              />
              <div className="qr-hint">🔍 クリックで拡大表示</div>
            </div>
            <p className="qr-display-desc">生徒は自分のチームのタブを選んでスキャンしてください</p>
            <button type="button" className="btn-text-only" onClick={beginNewClass} title="新しい授業用のQRコードに切り替えます">
              🔄 新しい授業用QRを作成
            </button>
          </div>
          <button className="settings-btn shadow-pop" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
          <button className="solo-learning-btn shadow-pop" onClick={() => setGameStatus('SOLO_LEARNING')}>🎓 Solo Learning</button>
        </div>
      )}

      {gameStatus === 'READY' && (
        <div className="content-wrap glass-card ready-panel">
          <h2 className="ready-title">{GAME_DATA[activeTheme].title}</h2>
          <div className="ready-info">Time Limit: <strong>{selectedMinutes}</strong> min</div>
          <button onClick={handleStartGame} className="start-btn shadow-pop">START GAME</button>
          <button onClick={backToMenu} className="btn-text-only">Cancel</button>
        </div>
      )}

      {gameStatus === 'PLAYING' && (
        <div className="game-layout">
          <header className="game-header">
            <div className="header-left">
              <img src="/scannetlogo.png" alt="Scannect" className="header-logo" />
              <div className="theme-name">{GAME_DATA[activeTheme].title}</div>
            </div>
            <div className="header-center">
              <div className={`timer-display ${timeLeft <= 10 ? 'danger' : ''}`}>TIME {formatTime(timeLeft)}</div>
            </div>
            <div className="header-right">
              <button onClick={backToMenu} className="btn-abort">QUIT GAME</button>
            </div>
          </header>
          <main className="game-main">
            <div className={`vs-scoreboard-${teamCount}`}>
              {activeTeams.map(team => (
                <div key={team} className={`glass-card team-card team-card-${team.toLowerCase()}`}>
                  <div className={`team-badge team-badge-${team.toLowerCase()}`}>TEAM {team}</div>
                  <div className="vs-score">{scores[team]}</div>
                  {/* 💡ここに記入されていたコンボ表示（vs-combo）の1行を完全に消去します */}
                </div>
              ))}
            </div>
            {message && <div className={`glass-card message-bar ${isSuccess === true ? 'success' : isSuccess === false ? 'error' : ''}`}>{message}</div>}
          </main>
        </div>
      )}

      {gameStatus === 'GAMEOVER' && (
        <div className="content-wrap">
          <h2 className="time-up-text">TIME UP!</h2>
          <div className={`result-versus-${teamCount}`}>
            {activeTeams.map(team => (
              <div key={team} className={`glass-card res-team-box ${scores[team] === maxScoreValue && maxScoreValue > 0 ? 'winner' : ''}`}>
                {scores[team] === maxScoreValue && maxScoreValue > 0 && <div className="winner-crown">👑 WINNER</div>}
                <h3>TEAM {team}</h3>
                <div className="res-num">{scores[team]}</div>
                <p>MAX COMBO: {maxCombos[team]}</p>
              </div>
            ))}
          </div>
          <button onClick={backToMenu} className="start-btn shadow-pop" style={{marginTop:'50px'}}>BACK TO MENU</button>
        </div>
      )}

      {gameStatus === 'SOLO_LEARNING' && (
        <LearningMode gameData={GAME_DATA} onBack={() => setGameStatus('MENU')} bgmVolume={bgmVolume} isMuted={isMuted} />
      )}

      {isSettingsOpen && (
        <SettingsModal teamCount={teamCount} setTeamCount={setTeamCount} bgmVolume={bgmVolume} setBgmVolume={setBgmVolume} selectedMinutes={selectedMinutes} setSelectedMinutes={setSelectedMinutes} onClose={() => setIsSettingsOpen(false)} setActiveQrTab={setActiveQrTab} />
      )}

      {fullScreenQrTeam && (
        <div className="modal-overlay" onClick={() => setFullScreenQrTeam(null)} style={{zIndex: 300}}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{width: 'auto', padding: '40px', maxWidth: '90vw'}}>
            <h2 className={`team-title-huge team-title-${fullScreenQrTeam.toLowerCase()}`}>TEAM {fullScreenQrTeam}</h2>
            <QRCodeSVG
              value={window.location.origin + window.location.pathname + '?mode=scanner&team=' + fullScreenQrTeam + '&session=' + sessionId}
              size={600} marginSize={4} level="M" title={`Join Team ${fullScreenQrTeam}`}
              className="huge-qr-img"
            />
            <button className="btn-save" onClick={() => setFullScreenQrTeam(null)}>閉じる</button>
          </div>
        </div>
      )}
      {isDownloadOpen && (
        <div className="modal-overlay" onClick={() => setIsDownloadOpen(false)} style={{zIndex: 400}}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{padding: '30px', maxWidth: '700px', width: '90%'}}>
            <h2 style={{color: '#2c3e50', marginBottom: '10px'}}>📥 教材カードダウンロード</h2>
            <p style={{color: '#7f8c8d', marginBottom: '25px'}}>印刷して生徒に配布してください（A4サイズ推奨）</p>
            
            <div className="pdf-btn-group">
              <a href="/materials/cafe.pdf" download="Scannect_Cafe_Cards.pdf" className="pdf-dl-btn">📄 Cafe (カフェ)</a>
              <a href="/materials/media.pdf" download="Scannect_Media_Cards.pdf" className="pdf-dl-btn">📄 Media (メディア)</a>
              <a href="/materials/revitalization.pdf" download="Scannect_Revitalization_Cards.pdf" className="pdf-dl-btn">📄 Revitalization (地域活性)</a>
              <a href="/materials/sdgs.pdf" download="Scannect_SDGs_Cards.pdf" className="pdf-dl-btn">📄 SDGs</a>
              <a href="/materials/volunteer.pdf" download="Scannect_Volunteer_Cards.pdf" className="pdf-dl-btn">📄 Volunteer (ボランティア)</a>
              <a href="/materials/worry.pdf" download="Scannect_Worry_Cards.pdf" className="pdf-dl-btn">📄 Worries (高校生の悩み)</a>
              <a href="/materials/world.pdf" download="Scannect_World_Cards.pdf" className="pdf-dl-btn">📄 World (世界)</a>
              <p>Airport / Help / Hotel / Zoo のPDFは準備中です。</p>
              <a href="/materials/english.pdf" download="Scannect_English_Cards.pdf" className="pdf-dl-btn">📄 English (英語学習の悩み)</a>
            </div>

            <button className="btn-save" onClick={() => setIsDownloadOpen(false)} style={{marginTop: '30px', backgroundColor: '#95a5a6'}}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;