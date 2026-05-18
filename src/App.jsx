import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode'; 
import { database, ref, push, onChildAdded, onValue, set, serverTimestamp } from './firebase'; 

import './App.css';

import cafeData from './data/cafe.json';
import sdgsData from './data/sdgs.json';
import hotelData from './data/hotel.json';
import airportData from './data/airport.json';
import zooData from './data/zoo.json';

const GAME_DATA = {
  cafe: { title: 'Scannect : Cafe', codes: cafeData },
  sdgs: { title: 'Scannect : SDGs', codes: sdgsData },
  hotel: { title: 'Scannect : Hotel', codes: hotelData },
  airport: { title: 'Scannect : Airport', codes: airportData },
  zoo: { title: 'Scannect : Zoo', codes: zooData }
};

function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const initMode = searchParams.get('mode') === 'scanner' ? 'SCANNER' : 'HOST_MENU';
  const initTeam = (searchParams.get('team') === 'A' || searchParams.get('team') === 'B') ? searchParams.get('team') : null;

  const [appMode, setAppMode] = useState(initMode); 
  const [scannerTeam, setScannerTeam] = useState(initTeam); 

  const [activeTheme, setActiveTheme] = useState(null);
  const [gameStatus, setGameStatus] = useState('MENU'); 
  
  const [scores, setScores] = useState({ A: 0, B: 0 });
  const [combos, setCombos] = useState({ A: 0, B: 0 });
  const [maxCombos, setMaxCombos] = useState({ A: 0, B: 0 });

  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(null);

  const [selectedMinutes, setSelectedMinutes] = useState(5); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeQrTab, setActiveQrTab] = useState('A'); 
  const [timeLeft, setTimeLeft] = useState(0);

  // スマホがPCの進行状況をリアルタイムで知るためのState
  const [serverGameState, setServerGameState] = useState({ status: 'MENU', theme: null });

  const inputBuffer = useRef('');
  const correctSound = new Audio('/correct.mp3');
  const incorrectSound = new Audio('/incorrect.mp3');
  
  // 常に最新のゲーム状態を保持する参照
  const latestStateRef = useRef({ status: gameStatus, theme: activeTheme });
  const scannerInstanceRef = useRef(null); 

  useEffect(() => {
    latestStateRef.current = { status: gameStatus, theme: activeTheme };
  }, [gameStatus, activeTheme]);

  // ==========================================
  // 1. PC（先生用メイン画面）ロジック
  // ==========================================
  const selectTheme = (theme) => {
    setActiveTheme(theme);
    setGameStatus('READY');
  };

  const handleStartGame = () => {
    setScores({ A: 0, B: 0 });
    setCombos({ A: 0, B: 0 });
    setMaxCombos({ A: 0, B: 0 });
    setTimeLeft(selectedMinutes * 60); 
    setGameStatus('PLAYING');
    setMessage(''); 

    // ★ 安全策：ゲーム開始時に古いスキャン履歴をデータベース上から一斉清掃
    set(ref(database, 'scans'), null);

    // ★ PCがゲームを開始したことを書き込み（スマホへ通知）
    set(ref(database, 'gameState'), { status: 'PLAYING', theme: activeTheme });
  };

  const backToMenu = () => {
    setActiveTheme(null);
    setGameStatus('MENU');
    setIsSettingsOpen(false);
    set(ref(database, 'gameState'), { status: 'MENU', theme: null });
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

  // ★ リアルタイム通信受信（時計がどれだけズレていても100%動く構造）
  useEffect(() => {
    if (appMode !== 'HOST_MENU') return;
    const scansRef = ref(database, 'scans');
    
    onChildAdded(scansRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      const currentStatus = latestStateRef.current.status;
      const currentTheme = latestStateRef.current.theme;

      // 現在ゲームプレイ中であれば、届いたデータを無条件でスキャン処理
      if (currentStatus === 'PLAYING') {
         executeScanCheck(data.team, data.code, currentTheme);
      }
    });
  }, [appMode]);

  // USB物理スキャナ用
  useEffect(() => {
    if (appMode !== 'HOST_MENU' || gameStatus !== 'PLAYING') return;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        const rawInput = inputBuffer.current.trim();
        if (rawInput) {
          const prefix = rawInput.substring(0, 2);
          const actualCode = rawInput.substring(2);
          if (prefix === 'A-') executeScanCheck('A', actualCode, activeTheme);
          else if (prefix === 'B-') executeScanCheck('B', actualCode, activeTheme);
        }
        inputBuffer.current = '';
      } else if (e.key.length === 1) {
        inputBuffer.current += e.key;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appMode, gameStatus, activeTheme]);

  // スキャン判定コア関数
  const executeScanCheck = (team, scannedCode, theme) => {
    if (!theme) return;
    const currentThemeData = GAME_DATA[theme].codes;
    let isCorrect = false;

    if (Array.isArray(currentThemeData)) {
      isCorrect = currentThemeData.some(item => item.id === scannedCode || item.code === scannedCode);
    } else if (typeof currentThemeData === 'object' && currentThemeData !== null) {
      isCorrect = currentThemeData[scannedCode] || Object.values(currentThemeData).some(item => item.id === scannedCode || item.code === scannedCode);
    }
    
    if (isCorrect) {
      setScores(prev => ({ ...prev, [team]: prev[team] + 1 }));
      setCombos(prev => {
        const newCombo = prev[team] + 1;
        if (newCombo > maxCombos[team]) setMaxCombos(m => ({ ...m, [team]: newCombo }));
        return { ...prev, [team]: newCombo };
      });
      setMessage(`✅ MATCH: Team ${team}`);
      setIsSuccess(true);
      correctSound.currentTime = 0;
      correctSound.play().catch(e => console.log(e));
    } else {
      setCombos(prev => ({ ...prev, [team]: 0 }));
      setMessage(`⚠️ MISS: Team ${team}`);
      setIsSuccess(false);
      incorrectSound.currentTime = 0;
      incorrectSound.play().catch(e => console.log(e));
    }
    setTimeout(() => { setMessage(''); setIsSuccess(null); }, 2000);
  };


  // ==========================================
  // 2. スマホ（生徒用スキャナー）ロジック
  // ==========================================
  useEffect(() => {
    if (appMode === 'SCANNER') {
      const gameStateRef = ref(database, 'gameState');
      onValue(gameStateRef, (snapshot) => {
        const data = snapshot.val();
        if (data) setServerGameState(data);
      });
    }
  }, [appMode]);

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
              { fps: 10, qrbox: { width: 260, height: 260 } },
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

  // ★ スマホ側での即時正誤判定と画面へのフィードバック表示
  const onScanMobile = (decodedText) => {
    if (scannerInstanceRef.current) scannerInstanceRef.current.pause(true);

    // PC側がまだゲーム中でない場合のガード
    if (serverGameState.status !== 'PLAYING' || !serverGameState.theme) {
      setMessage('⏳ 待機中：PCでゲームを開始してください');
      setIsSuccess(false);
      setTimeout(() => {
        setMessage(''); setIsSuccess(null);
        if (scannerInstanceRef.current) scannerInstanceRef.current.resume();
      }, 2000);
      return;
    }

    const currentThemeData = GAME_DATA[serverGameState.theme].codes;
    let isCorrect = false;
    if (Array.isArray(currentThemeData)) {
      isCorrect = currentThemeData.some(item => item.id === decodedText || item.code === decodedText);
    } else {
      isCorrect = currentThemeData[decodedText] || Object.values(currentThemeData).some(item => item.id === decodedText || item.code === decodedText);
    }

    // 生徒のスマホ画面に結果を即座にドカンと表示！
    if (isCorrect) {
      setMessage('✅ 正解！ (MATCH)');
      setIsSuccess(true);
    } else {
      setMessage('❌ 不正解... (MISS)');
      setIsSuccess(false);
    }

    // PC側にデータを送信してスコアボードを動かす
    push(ref(database, 'scans'), {
      team: scannerTeam,
      code: decodedText,
      timestamp: serverTimestamp() 
    }).then(() => {
        setTimeout(() => { 
          setMessage(''); 
          setIsSuccess(null); 
          if (scannerInstanceRef.current) scannerInstanceRef.current.resume();
        }, 1800);
    });
  };

  // --- 画面レンダリング ---
  if (appMode === 'SCANNER') {
    return (
      <div className="main-viewport pattern-bg">
        {!scannerTeam ? (
          <div className="content-wrap glass-card" style={{padding: '40px'}}>
            <h2 style={{fontSize: '2rem', marginBottom: '30px', color: '#2c3e50'}}>Select Team</h2>
            <div style={{display: 'flex', gap: '20px'}}>
               <button onClick={() => setScannerTeam('A')} style={{padding:'20px 50px', fontSize:'2rem', fontWeight:'bold', background:'#e74c3c', color:'white', border:'none', borderRadius:'15px', cursor:'pointer'}}>TEAM A</button>
               <button onClick={() => setScannerTeam('B')} style={{padding:'20px 50px', fontSize:'2rem', fontWeight:'bold', background:'#3498db', color:'white', border:'none', borderRadius:'15px', cursor:'pointer'}}>TEAM B</button>
            </div>
          </div>
        ) : (
          <div className="scanner-container">
             <div className={`scanner-header team-${scannerTeam}`}>TEAM {scannerTeam} PLAYING</div>
             <div id="reader"></div>
             {/* ★ 生徒画面：正解なら緑、不正解なら赤の大きなインジケータ */}
             {message && <div className={`scanner-msg ${isSuccess ? 'ok' : ''}`}>{message}</div>}
             <button onClick={() => { window.location.href = window.location.origin + '?mode=scanner'; }} className="btn-text-only" style={{marginTop: '20px'}}>Change Team</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`main-viewport ${gameStatus === 'MENU' ? 'pattern-bg' : 'gradient-bg'}`}>
      {gameStatus === 'MENU' && <div className="particles">{[...Array(12)].map((_, i) => <div key={i} className="dot"></div>)}</div>}

      {gameStatus === 'MENU' && (
        <div className="menu-split-container">
          <div className="menu-left-block">
            <img src="/scannetlogo.png" alt="Scannect" className="main-logo-split" />
            <div className="theme-buttons-vertical">
              <button onClick={() => selectTheme('cafe')} className="custom-border-box-split">☕ Cafe</button>
              <button onClick={() => selectTheme('sdgs')} className="custom-border-box-split">🌍 SDGs</button>
              <button onClick={() => selectTheme('hotel')} className="custom-border-box-split">🏨 Hotel</button>
              <button onClick={() => selectTheme('airport')} className="custom-border-box-split">✈️ Airport</button>
              <button onClick={() => selectTheme('zoo')} className="custom-border-box-split">🦁 Zoo</button>
            </div>
          </div>
          <div className="menu-right-block">
            <h3 className="qr-section-title">📱 Student Scanner QR</h3>
            <div className="qr-tab-buttons">
              <button onClick={() => setActiveQrTab('A')} className={`qr-tab-btn ${activeQrTab === 'A' ? 'active team-A' : ''}`}>TEAM A</button>
              <button onClick={() => setActiveQrTab('B')} className={`qr-tab-btn ${activeQrTab === 'B' ? 'active team-B' : ''}`}>TEAM B</button>
            </div>
            <div className="qr-display-box">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(window.location.origin + '/?mode=scanner&team=' + activeQrTab)}`} alt="Join QR" />
            </div>
            <p className="qr-display-desc">生徒は自分のチームのタブを選んでスキャンしてください</p>
          </div>
          <button className="settings-btn shadow-pop" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
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
            <div className="vs-scoreboard">
              <div className="glass-card team-card team-a">
                <div className="team-badge-a">TEAM A</div>
                <div className="vs-score">{scores.A}</div>
                <div className="vs-combo">COMBO: {combos.A}</div>
              </div>
              <div className="vs-center-text">VS</div>
              <div className="glass-card team-card team-b">
                <div className="team-badge-b">TEAM B</div>
                <div className="vs-score">{scores.B}</div>
                <div className="vs-combo">COMBO: {combos.B}</div>
              </div>
            </div>
            {message && <div className={`glass-card message-bar ${isSuccess === true ? 'success' : isSuccess === false ? 'error' : ''}`}>{message}</div>}
          </main>
        </div>
      )}

      {gameStatus === 'GAMEOVER' && (
        <div className="content-wrap">
          <h2 className="time-up-text">TIME UP!</h2>
          <div className="result-versus">
            <div className={`glass-card res-team-box ${scores.A >= scores.B ? 'winner' : ''}`}>
              {scores.A >= scores.B && <div className="winner-crown">👑 WINNER</div>}
              <h3>TEAM A</h3>
              <div className="res-num">{scores.A}</div>
              <p>MAX COMBO: {maxCombos.A}</p>
            </div>
            <div className={`glass-card res-team-box ${scores.B >= scores.A ? 'winner' : ''}`}>
              {scores.B >= scores.A && <div className="winner-crown">👑 WINNER</div>}
              <h3>TEAM B</h3>
              <div className="res-num">{scores.B}</div>
              <p>MAX COMBO: {maxCombos.B}</p>
            </div>
          </div>
          <button onClick={backToMenu} className="start-btn shadow-pop" style={{marginTop:'50px'}}>BACK TO MENU</button>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{fontSize:'2rem', marginBottom:'20px'}}>Game Settings</h3>
            <div className="slider-group">
              <label>Time Limit: <strong>{selectedMinutes}</strong> min</label>
              <input type="range" min="3" max="15" value={selectedMinutes} onChange={e => setSelectedMinutes(Number(e.target.value))} />
            </div>
            <button className="btn-save" onClick={() => setIsSettingsOpen(false)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;