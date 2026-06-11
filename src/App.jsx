import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode'; 
import { database, ref, push, onChildAdded, onValue, set, serverTimestamp } from './firebase'; 

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
  revitalization: { title: 'Scannect : Revitalization', codes: revitalizationData }
};

const ALL_TEAMS = ['A', 'B', 'C', 'D'];

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const initMode = searchParams.get('mode') === 'scanner' ? 'SCANNER' : 'HOST_MENU';
  const initTeam = ALL_TEAMS.includes(searchParams.get('team')) ? searchParams.get('team') : null;

  const [appMode, setAppMode] = useState(initMode); 
  const [scannerTeam, setScannerTeam] = useState(initTeam); 

  const [activeTheme, setActiveTheme] = useState(null);
  const [gameStatus, setGameStatus] = useState('MENU'); 
  
  const [teamCount, setTeamCount] = useState(2);
  const activeTeams = ALL_TEAMS.slice(0, teamCount); 

  const [scores, setScores] = useState({ A: 0, B: 0, C: 0, D: 0 });
  const [combos, setCombos] = useState({ A: 0, B: 0, C: 0, D: 0 });
  const [maxCombos, setMaxCombos] = useState({ A: 0, B: 0, C: 0, D: 0 });

  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(null);

  const [selectedMinutes, setSelectedMinutes] = useState(5); 
  const [bgmVolume, setBgmVolume] = useState(0.3);
  const [isMuted, setIsMuted] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeQrTab, setActiveQrTab] = useState('A'); 
  const [fullScreenQrTeam, setFullScreenQrTeam] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const [activeMissionCard, setActiveMissionCard] = useState(null); 

  const [serverGameState, setServerGameState] = useState({ status: 'MENU', theme: null, scannedCodes: {} });

  const inputBuffer = useRef('');
  const correctSound = new Audio('/correct.mp3');
  const incorrectSound = new Audio('/incorrect.mp3');

  const latestStateRef = useRef({ status: gameStatus, theme: activeTheme, teamCount });
  const serverGameStateRef = useRef({ status: 'MENU', theme: null, scannedCodes: {} });
  const scannedCodesRef = useRef({ A: [], B: [], C: [], D: [] }); 
  const combosRef = useRef({ A: 0, B: 0, C: 0, D: 0 });
  
  const scannerInstanceRef = useRef(null); 
  const isProcessingScanRef = useRef(false);

  // 👇この1行を新しく追加してください👇
  const pendingScanRef = useRef(null);

  useBGM(appMode, gameStatus, bgmVolume, isMuted);

  useEffect(() => {
    latestStateRef.current = { status: gameStatus, theme: activeTheme, teamCount };
  }, [gameStatus, activeTheme, teamCount]);

  const selectTheme = (theme) => {
    setActiveTheme(theme);
    setGameStatus('READY');
  };

  const handleStartGame = () => {
    setScores({ A: 0, B: 0, C: 0, D: 0 });
    setCombos({ A: 0, B: 0, C: 0, D: 0 });
    setMaxCombos({ A: 0, B: 0, C: 0, D: 0 });
    setTimeLeft(selectedMinutes * 60); 
    setGameStatus('PLAYING');
    setMessage(''); 
    
    scannedCodesRef.current = { A: [], B: [], C: [], D: [] };
    combosRef.current = { A: 0, B: 0, C: 0, D: 0 };

    set(ref(database, 'scans'), null);
    set(ref(database, 'gameState'), { 
      status: 'PLAYING', 
      theme: activeTheme, 
      scannedCodes: { A: {}, B: {}, C: {}, D: {} } 
    });
  };

  const backToMenu = () => {
    setActiveTheme(null);
    setGameStatus('MENU');
    setIsSettingsOpen(false);
    setFullScreenQrTeam(null);
    set(ref(database, 'gameState'), { status: 'MENU', theme: null, scannedCodes: {} });
  };

  useEffect(() => {
    let timer;
    if (appMode === 'HOST_MENU' && gameStatus === 'PLAYING' && timeLeft > 0) {
      timer = setInterval(() => { setTimeLeft((prev) => prev - 1); }, 1000);
    } else if (timeLeft === 0 && gameStatus === 'PLAYING') {
      setGameStatus('GAMEOVER');
      set(ref(database, 'gameState'), { status: 'GAMEOVER', theme: activeTheme });
    }
    return () => clearInterval(timer);
  }, [appMode, gameStatus, timeLeft, activeTheme]);

  useEffect(() => {
    if (appMode !== 'HOST_MENU') return;
    const scansRef = ref(database, 'scans');
    
    const unsubscribe = onChildAdded(scansRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      const currentStatus = latestStateRef.current.status;
      const currentTheme = latestStateRef.current.theme;
      if (currentStatus === 'PLAYING') {
         executeScanCheck(data.team, data.code, currentTheme, data.points);
      }
    });

    return () => unsubscribe();
  }, [appMode]);

  const executeScanCheck = (team, scannedCode, theme, points = 1) => {
    const currentActiveTeams = ALL_TEAMS.slice(0, latestStateRef.current.teamCount);
    if (!theme || !currentActiveTeams.includes(team)) return;
    
    const currentThemeData = GAME_DATA[theme].codes;
    let isCorrect = false;

    if (Array.isArray(currentThemeData)) {
      isCorrect = currentThemeData.some(item => item.id === scannedCode || item.code === scannedCode);
    } else if (typeof currentThemeData === 'object' && currentThemeData !== null) {
      isCorrect = currentThemeData[scannedCode] || Object.values(currentThemeData).some(item => item.id === scannedCode || item.code === scannedCode);
    }
    
    if (isCorrect) {
      if (scannedCodesRef.current[team].includes(scannedCode)) {
        setMessage(`⚠️ ALREADY SCANNED: Team ${team}`);
        setIsSuccess(false);
        if (!isMuted) {
          incorrectSound.volume = bgmVolume; 
          incorrectSound.currentTime = 0;
          incorrectSound.play().catch(e => console.log(e));
        }
        setTimeout(() => { setMessage(''); setIsSuccess(null); }, 2000);
        return; 
      }

      scannedCodesRef.current[team].push(scannedCode);
      set(ref(database, `gameState/scannedCodes/${team}/${scannedCode}`), true);

      const newCombo = combosRef.current[team] + 1;
      combosRef.current[team] = newCombo;
      const isComboBonus = (newCombo > 0 && newCombo % 3 === 0);
      
      const earnedPoints = points + (isComboBonus ? 2 : 0); 

      setCombos(prev => ({ ...prev, [team]: newCombo }));
      setScores(prev => ({ ...prev, [team]: prev[team] + earnedPoints }));
      setMaxCombos(prev => newCombo > prev[team] ? { ...prev, [team]: newCombo } : prev);

      setMessage(`✅ MATCH: Team ${team} (+${points} pts)${isComboBonus ? ' 🌟 COMBO BONUS +2!' : ''}`);
      setIsSuccess(true);
      if (!isMuted) {
        correctSound.volume = bgmVolume;
        correctSound.currentTime = 0;
        correctSound.play().catch(e => console.log(e));
      }
    } else {
      combosRef.current[team] = 0;
      setCombos(prev => ({ ...prev, [team]: 0 }));
      setMessage(`⚠️ MISS: Team ${team}`);
      setIsSuccess(false);
      if (!isMuted) {
        incorrectSound.volume = bgmVolume;
        incorrectSound.currentTime = 0;
        incorrectSound.play().catch(e => console.log(e));
      }
    }
    setTimeout(() => { setMessage(''); setIsSuccess(null); }, 2000);
  };

  useEffect(() => {
    if (appMode === 'SCANNER') {
      const gameStateRef = ref(database, 'gameState');
      const unsubscribe = onValue(gameStateRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setServerGameState(data);
          serverGameStateRef.current = data;
        }
      });
      return () => unsubscribe();
    }
  }, [appMode]);

  // ★ 修正ポイント：ミッション発動時もカメラを止めないように依存配列から activeMissionCard を削除
  useEffect(() => {
    if (appMode === 'SCANNER' && scannerTeam) {
      let isMounted = true;
      const startCamera = () => {
        setTimeout(async () => {
          if (!isMounted) return;
          const element = document.getElementById("reader");
          if (!element) { startCamera(); return; }
          try {
            const html5QrCode = new Html5Qrcode("reader");
            scannerInstanceRef.current = html5QrCode;
            await html5QrCode.start(
              { facingMode: "environment" },
              { 
                fps: 15, // 読み取り精度を少し上げる
                // ★修正：読み取り枠を狭くし、背景の別のカードを誤読するのを防ぐ
                qrbox: { width: 180, height: 180 },
                aspectRatio: 1.0 
              },
              (decodedText) => { onScanMobile(decodedText); },
              () => {} 
            );
          } catch (err) { console.error("Camera open error:", err); }
        }, 300);
      };
      startCamera();
      return () => {
        isMounted = false;
        if (scannerInstanceRef.current) scannerInstanceRef.current.stop().catch(e=>e);
      };
    }
  }, [appMode, scannerTeam]);

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

    const currentThemeData = GAME_DATA[currentGameState.theme].codes;
    // 読み取った文字列が、現在のテーマのカードIDに含まれているかチェック
    const foundCard = currentThemeData.find(item => item.id === decodedText || item.code === decodedText);

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

  const handleMissionComplete = (earnedPoints) => {
    push(ref(database, 'scans'), {
      team: scannerTeam,
      code: activeMissionCard.id,
      points: earnedPoints,
      timestamp: serverTimestamp() 
    }).then(() => {
      setActiveMissionCard(null); 
      isProcessingScanRef.current = false;
      // ★ フリーズの原因だった resume() も使いません
    });
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const maxScoreValue = Math.max(...activeTeams.map(t => scores[t]));

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
                  card={activeMissionCard} 
                  themeData={GAME_DATA[serverGameState.theme]?.codes || []} 
                  onComplete={handleMissionComplete} 
                />
             )}
             
             <div id="reader" style={{ display: activeMissionCard ? 'none' : 'block' }}></div>
             
             {/* ★ 修正：不正解時は全画面エラー、待機時は通常のメッセージ */}
             {!activeMissionCard && message && (
               <div className={`scanner-msg ${isSuccess === true ? 'ok' : isSuccess === false ? 'error-full' : ''}`}>
                 {message.split('\n').map((line, i) => <div key={i}>{line}</div>)}
               </div>
             )}
             <button onClick={() => { window.location.href = window.location.origin + '?mode=scanner'; }} className="btn-text-only" style={{marginTop: '20px'}}>Change Team</button>
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
            </div>
          </div>
          <div className="menu-right-block">
            <h3 className="qr-section-title">📱 Student Scanner QR</h3>
            <div className="qr-tab-buttons">
              {activeTeams.map(t => (
                <button key={t} onClick={() => setActiveQrTab(t)} className={`qr-tab-btn ${activeQrTab === t ? `active team-${t}` : ''}`}>{t}</button>
              ))}
            </div>
            <div className="qr-display-box clickable-qr" onClick={() => setFullScreenQrTeam(activeQrTab)}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(window.location.origin + '/?mode=scanner&team=' + activeQrTab)}`} alt="Join QR" />
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
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(window.location.origin + '/?mode=scanner&team=' + fullScreenQrTeam)}`} alt="Fullscreen QR" className="huge-qr-img" />
            <button className="btn-save" onClick={() => setFullScreenQrTeam(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;