import { useState, useEffect, useRef, useEffectEvent } from 'react';
import { Html5Qrcode } from 'html5-qrcode'; 
import { database, auth, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, ref, push, onChildAdded, onValue, set, serverTimestamp } from './firebase';
import { ALL_TEAMS, findCard, isValidTheme, newId, validMissionPoints } from './gameLogic'; 

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

  const [activeTheme, setActiveTheme] = useState(null);
  const [gameStatus, setGameStatus] = useState('MENU'); 
  
  const [teamCount, setTeamCount] = useState(2);
  const activeTeams = ALL_TEAMS.slice(0, teamCount); 

  const [scores, setScores] = useState({ A: 0, B: 0, C: 0, D: 0 });
  const [, setCombos] = useState({ A: 0, B: 0, C: 0, D: 0 });
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

  const [activeMissionCard, setActiveMissionCard] = useState(null); 

  const [serverGameState, setServerGameState] = useState({ status: 'MENU', theme: null, scannedCodes: {} });


  const latestStateRef = useRef({ status: gameStatus, theme: activeTheme, teamCount });
  const serverGameStateRef = useRef({ status: 'MENU', theme: null, scannedCodes: {} });
  const scannedCodesRef = useRef({ A: [], B: [], C: [], D: [] }); 
  const combosRef = useRef({ A: 0, B: 0, C: 0, D: 0 });
  
  const scannerInstanceRef = useRef(null); 
  const isProcessingScanRef = useRef(false);

  useBGM(appMode, gameStatus, bgmVolume, isMuted);

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
    if (appMode !== 'HOST_MENU' || !authUser || authUser.isAnonymous || sessionId || sessionCreationRef.current) return;
    sessionCreationRef.current = true;
    const createSession = async () => {
      try {
        const id = newId();
        await set(ref(database, `sessions/${id}/hostUid`), authUser.uid);
        await set(ref(database, `sessions/${id}/gameState`), {
          status: 'MENU', theme: null, teamCount, scannedCodes: {}
        });
        setSessionId(id);
        setFirebaseError('');
      } catch (error) {
        setFirebaseError(`授業セッションを作成できません: ${error.message}`);
      } finally {
        sessionCreationRef.current = false;
      }
    };
    createSession();
  }, [appMode, authUser, sessionId, teamCount]);

  const signInAsHost = async () => {
    setFirebaseError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setFirebaseError(`先生のログインに失敗しました: ${error.message}`);
    }
  };

  useEffect(() => {
    latestStateRef.current = { status: gameStatus, theme: activeTheme, teamCount };
  }, [gameStatus, activeTheme, teamCount]);

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
      await set(ref(database, `sessions/${sessionId}/gameState`), {
        status: 'PLAYING',
        theme: activeTheme,
        roundId: nextRoundId,
        teamCount,
        scannedCodes: {}
      });
      setRoundId(nextRoundId);
      setScores({ A: 0, B: 0, C: 0, D: 0 });
      setCombos({ A: 0, B: 0, C: 0, D: 0 });
      setMaxCombos({ A: 0, B: 0, C: 0, D: 0 });
      setTimeLeft(selectedMinutes * 60);
      scannedCodesRef.current = { A: [], B: [], C: [], D: [] };
      combosRef.current = { A: 0, B: 0, C: 0, D: 0 };
      setMessage('');
      setGameStatus('PLAYING');
      setFirebaseError('');
    } catch (error) {
      setFirebaseError(`ゲーム開始に失敗しました: ${error.message}`);
    }
  };

  const backToMenu = () => {
    setActiveTheme(null);
    setGameStatus('MENU');
    setIsSettingsOpen(false);
    setFullScreenQrTeam(null);
    if (sessionId) {
      set(ref(database, `sessions/${sessionId}/gameState/status`), 'MENU')
        .catch(error => setFirebaseError(`ゲームの終了を送信できません: ${error.message}`));
    }
  };


  const executeScanCheck = (team, scannedCode, theme, points = 1) => {
    const currentActiveTeams = ALL_TEAMS.slice(0, latestStateRef.current.teamCount);
    if (!isValidTheme(theme, GAME_DATA) || !currentActiveTeams.includes(team) || !validMissionPoints(points)) return;
    const card = findCard(GAME_DATA[theme].codes, scannedCode);
    if (card) {
      if (scannedCodesRef.current[team].includes(card.id)) {
        setMessage(`⚠️ ALREADY SCANNED: Team ${team}`);
        setIsSuccess(false);
        playFeedbackSound('/incorrect.mp3', bgmVolume, isMuted);
        setTimeout(() => { setMessage(''); setIsSuccess(null); }, 2000);
        return;
      }
      scannedCodesRef.current[team].push(card.id);
      set(ref(database, `sessions/${sessionId}/gameState/scannedCodes/${team}/${card.id}`), true)
        .catch(error => setFirebaseError(`スキャン済み状態を保存できません: ${error.message}`));

      const newCombo = combosRef.current[team] + 1;
      combosRef.current[team] = newCombo;
      const isComboBonus = newCombo % 3 === 0;
      const earnedPoints = points + (isComboBonus ? 2 : 0);
      setCombos(prev => ({ ...prev, [team]: newCombo }));
      setScores(prev => ({ ...prev, [team]: prev[team] + earnedPoints }));
      setMaxCombos(prev => newCombo > prev[team] ? { ...prev, [team]: newCombo } : prev);
      setMessage(`✅ MATCH: Team ${team} (+${points} pts)${isComboBonus ? ' 🌟 COMBO BONUS +2!' : ''}`);
      setIsSuccess(true);
      playFeedbackSound('/correct.mp3', bgmVolume, isMuted);
    } else {
      combosRef.current[team] = 0;
      setCombos(prev => ({ ...prev, [team]: 0 }));
      setMessage(`⚠️ MISS: Team ${team}`);
      setIsSuccess(false);
      playFeedbackSound('/incorrect.mp3', bgmVolume, isMuted);
    }
    setTimeout(() => { setMessage(''); setIsSuccess(null); }, 2000);
  };

  const onIncomingScan = useEffectEvent(data => {
    const state = latestStateRef.current;
    if (state.status === 'PLAYING') {
      executeScanCheck(data.team, data.code, state.theme, data.points);
    }
  });

  useEffect(() => {
    if (appMode !== 'HOST_MENU' || gameStatus !== 'PLAYING') return;
    const timer = setTimeout(() => {
      if (timeLeft <= 1) {
        setTimeLeft(0);
        setGameStatus('GAMEOVER');
        if (sessionId) {
          set(ref(database, `sessions/${sessionId}/gameState/status`), 'GAMEOVER')
            .catch(error => setFirebaseError(`終了通知に失敗しました: ${error.message}`));
        }
      } else {
        setTimeLeft(timeLeft - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [appMode, gameStatus, timeLeft, sessionId]);

  useEffect(() => {
    if (appMode !== 'HOST_MENU' || gameStatus !== 'PLAYING' || !sessionId || !roundId) return;
    const scansRef = ref(database, `sessions/${sessionId}/rounds/${roundId}/scans`);
    const unsubscribe = onChildAdded(scansRef, snapshot => {
      const data = snapshot.val();
      if (!data || !validMissionPoints(data.points)) return;
      onIncomingScan(data);
    }, error => setFirebaseError(`得点の受信に失敗しました: ${error.message}`));
    return unsubscribe;
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
        isProcessingScanRef.current = false;
      }
    }, error => setFirebaseError(`ゲーム状態を取得できません: ${error.message}`));
  }, [appMode, sessionId, authUser]);


const onScanMobile = (decodedText) => {
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
      isProcessingScanRef.current = false;
      return;
    }
    if (!ALL_TEAMS.slice(0, currentGameState.teamCount ?? 2).includes(scannerTeam)) {
      setMessage('このチームは現在のゲームに参加できません');
      isProcessingScanRef.current = false;
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

    // ③ 正しい未スキャンのペアだった場合 ➔ ミッションへ即突入！
    // 正解音は ScannerMission 側でド派手な演出と共に鳴らします
    setActiveMissionCard(foundCard);
    // ※ミッションが始まるとカメラ部分は自動で非表示になるため、ストップ処理は不要です
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



  const handleMissionComplete = async (earnedPoints) => {
    const state = serverGameStateRef.current;
    if (!activeMissionCard || !sessionId || !auth.currentUser || !state.roundId ||
        state.status !== 'PLAYING' || !validMissionPoints(earnedPoints)) {
      setMessage('ゲームの状態が変わりました。もう一度スキャンしてください。');
      setActiveMissionCard(null);
      isProcessingScanRef.current = false;
      return;
    }
    try {
      await push(ref(database, `sessions/${sessionId}/rounds/${state.roundId}/scans`), {
        team: scannerTeam,
        code: activeMissionCard.id,
        points: earnedPoints,
        uid: auth.currentUser.uid,
        timestamp: serverTimestamp()
      });
      setActiveMissionCard(null);
      isProcessingScanRef.current = false;
    } catch (error) {
      setMessage(`送信に失敗しました。もう一度カードをスキャンしてください: ${error.message}`);
      setIsSuccess(false);
      setActiveMissionCard(null);
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
      <p>{firebaseError || (sessionId ? 'Firebaseに接続しています...' : '先生の画面に表示されたQRコードから参加してください。')}</p>
    </div></div>;
  }

  if (appMode === 'HOST_MENU' && gameStatus !== 'SOLO_LEARNING' && (!authUser || authUser.isAnonymous || !sessionId)) {
    return <div className="main-viewport pattern-bg"><div className="content-wrap glass-card" style={{ padding: 30 }}>
      <h2>Scannect — Teacher</h2>
      <p>授業ゲームの管理にはGoogleログインが必要です。生徒はQRコードから匿名で参加できます。</p>
      <button className="start-btn shadow-pop" onClick={signInAsHost}>Googleで先生としてログイン</button>
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
             {activeMissionCard && (
                <ScannerMission 
                  key={activeMissionCard.id}
                  card={activeMissionCard} 
                  themeData={GAME_DATA[serverGameState.theme]?.codes || []} 
                  onComplete={handleMissionComplete} 
                />
             )}
             
             <div id="reader" style={{ display: activeMissionCard ? 'none' : 'block' }}></div>
             {cameraError && <p role="alert" className="scanner-msg error-full">{cameraError}</p>}
             
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
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?mode=scanner&team=' + activeQrTab + '&session=' + sessionId)}`} alt="Join QR" />
              <div className="qr-hint">🔍 クリックで拡大表示</div>
            </div>
            <p className="qr-display-desc">生徒は自分のチームのタブを選んでスキャンしてください</p>
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
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?mode=scanner&team=' + fullScreenQrTeam + '&session=' + sessionId)}`} alt="Fullscreen QR" className="huge-qr-img" />
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