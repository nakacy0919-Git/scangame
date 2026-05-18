import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode'; // 制御しやすい低レイヤー版に変更
import { database, ref, push, onChildAdded, serverTimestamp } from './firebase'; 

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
  const [qrModalTeam, setQrModalTeam] = useState(null); // 'A' or 'B' or null (QR表示用)
  const [timeLeft, setTimeLeft] = useState(0);

  const inputBuffer = useRef('');
  const correctSound = new Audio('/correct.mp3');
  const incorrectSound = new Audio('/incorrect.mp3');

  const firebaseListenerRef = useRef(null);
  const scannerInstanceRef = useRef(null); // カメラインスタンス

  // ==========================================
  // ① メイン画面ボタンの反応を修正
  // ==========================================
  const selectTheme = (theme) => {
    setActiveTheme(theme);
    setGameStatus('READY');
  };

  useEffect(() => {
    let timer;
    if (appMode === 'HOST_MENU' && gameStatus === 'PLAYING' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && gameStatus === 'PLAYING') {
      setGameStatus('GAMEOVER');
    }
    return () => clearInterval(timer);
  }, [appMode, gameStatus, timeLeft]);

  const handleStartGame = () => {
    setScores({ A: 0, B: 0 });
    setCombos({ A: 0, B: 0 });
    setMaxCombos({ A: 0, B: 0 });
    setTimeLeft(selectedMinutes * 60); 
    setGameStatus('PLAYING');
    setMessage(''); 

    const scansRef = ref(database, 'scans');
    firebaseListenerRef.current = onChildAdded(scansRef, (snapshot) => {
      const data = snapshot.val();
      if (Date.now() - data.timestamp < 10000) {
        handleScan(data.team, data.code);
      }
    });
  };

  const backToMenu = () => {
    setActiveTheme(null);
    setGameStatus('MENU');
    setIsSettingsOpen(false);
    if (firebaseListenerRef.current) firebaseListenerRef.current = null;
  };

  const handleScan = (team, scannedCode) => {
    if (gameStatus !== 'PLAYING') return;
    const currentThemeData = GAME_DATA[activeTheme].codes;
    const isCorrect = currentThemeData.find(item => item.id === scannedCode);
    
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

    setTimeout(() => {
      if (gameStatus === 'PLAYING') {
        setMessage('');
        setIsSuccess(null);
      }
    }, 2000);
  };

  // USBスキャナ用
  useEffect(() => {
    if (appMode !== 'HOST_MENU' || gameStatus !== 'PLAYING') return;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        const rawInput = inputBuffer.current.trim();
        if (rawInput) {
          const prefix = rawInput.substring(0, 2);
          const actualCode = rawInput.substring(2);
          if (prefix === 'A-') handleScan('A', actualCode);
          else if (prefix === 'B-') handleScan('B', actualCode);
          else setMessage('⚠️ ERROR: Check Prefix');
        }
        inputBuffer.current = '';
      } else if (e.key.length === 1) {
        inputBuffer.current += e.key;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appMode, gameStatus, activeTheme]);


  // ==========================================
  // ③ スマホの背面カメラを自動起動するロジック
  // ==========================================
  useEffect(() => {
    if (appMode === 'SCANNER' && scannerTeam) {
      const startCamera = async () => {
        const html5QrCode = new Html5Qrcode("reader");
        scannerInstanceRef.current = html5QrCode;
        
        try {
          await html5QrCode.start(
            { facingMode: "environment" }, // 背面カメラを強制
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText) => {
               // スキャン成功時
               onScanSuccess(decodedText);
            },
            () => {} // スキャン失敗時は何もしない
          );
        } catch (err) {
          console.error("カメラの起動に失敗しました", err);
          setMessage("カメラエラー：設定を確認してください");
        }
      };

      startCamera();

      return () => {
        if (scannerInstanceRef.current) {
          scannerInstanceRef.current.stop().then(() => {
            console.log("Camera stopped");
          }).catch(err => console.error(err));
        }
      };
    }
  }, [appMode, scannerTeam]);

  const onScanSuccess = (decodedText) => {
    // 連続送信防止
    push(ref(database, 'scans'), {
      team: scannerTeam,
      code: decodedText,
      timestamp: serverTimestamp() 
    }).then(() => {
        setMessage('SUCCESS! 送信完了');
        setIsSuccess(true);
        setTimeout(() => { setMessage(''); setIsSuccess(null); }, 1500);
    });
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- スマホ（生徒用）スキャナー画面 ---
  if (appMode === 'SCANNER') {
    return (
      <div className="main-viewport pattern-bg">
        {!scannerTeam ? (
          <div className="content-wrap glass-card" style={{padding: '40px'}}>
            <h2 style={{fontSize: '2rem', marginBottom: '30px'}}>Select Team</h2>
            <div style={{display: 'flex', gap: '20px'}}>
               <button onClick={() => setScannerTeam('A')} style={{padding:'20px 50px', fontSize:'2rem', fontWeight:'bold', background:'#e74c3c', color:'white', border:'none', borderRadius:'15px'}}>TEAM A</button>
               <button onClick={() => setScannerTeam('B')} style={{padding:'20px 50px', fontSize:'2rem', fontWeight:'bold', background:'#3498db', color:'white', border:'none', borderRadius:'15px'}}>TEAM B</button>
            </div>
          </div>
        ) : (
          <div className="scanner-container">
             <div className={`scanner-header team-${scannerTeam}`}>TEAM {scannerTeam} SCANNER</div>
             <div id="reader"></div>
             {message && <div className={`scanner-msg ${isSuccess ? 'ok' : ''}`}>{message}</div>}
             <button onClick={() => { window.location.href = window.location.origin + '?mode=scanner'; }} className="btn-text-only">Change Team</button>
          </div>
        )}
      </div>
    );
  }

  // --- PC（先生用）メイン画面 ---
  return (
    <div className={`main-viewport ${gameStatus === 'MENU' ? 'pattern-bg' : 'gradient-bg'}`}>
      {gameStatus === 'MENU' && <div className="particles">{[...Array(12)].map((_, i) => <div key={i} className="dot"></div>)}</div>}

      {/* メインメニュー */}
      {gameStatus === 'MENU' && (
        <div className="content-wrap">
          <img src="/scannetlogo.png" alt="Scannect" className="main-logo" />
          <div className="theme-buttons">
            {/* ① ボタンが反応するように selectTheme を接続 */}
            <button onClick={() => selectTheme('cafe')} className="custom-border-box">☕ Cafe</button>
            <button onClick={() => selectTheme('sdgs')} className="custom-border-box">🌍 SDGs</button>
            <button onClick={() => selectTheme('hotel')} className="custom-border-box">🏨 Hotel</button>
            <button onClick={() => selectTheme('airport')} className="custom-border-box">✈️ Airport</button>
            <button onClick={() => selectTheme('zoo')} className="custom-border-box">🦁 Zoo</button>
          </div>
          
          <div className="qr-trigger-area">
            {/* ② QRコードを個別に大きく表示するボタン */}
            <button onClick={() => setQrModalTeam('A')} className="qr-trigger btn-a">📱 Team A : Join QR</button>
            <button onClick={() => setQrModalTeam('B')} className="qr-trigger btn-b">📱 Team B : Join QR</button>
          </div>

          <button className="settings-btn shadow-pop" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
        </div>
      )}

      {/* 待機画面 */}
      {gameStatus === 'READY' && (
        <div className="content-wrap glass-card ready-panel">
          <h2 className="ready-title">{GAME_DATA[activeTheme].title}</h2>
          <div className="ready-info">Time Limit: <strong>{selectedMinutes}</strong> min</div>
          <button onClick={handleStartGame} className="start-btn shadow-pop">START GAME</button>
          <button onClick={backToMenu} className="btn-text-only">Cancel</button>
        </div>
      )}

      {/* ゲーム中 */}
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

      {/* 結果画面 */}
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

      {/* ② 個別の巨大QR表示モーダル */}
      {qrModalTeam && (
        <div className="modal-overlay" onClick={() => setQrModalTeam(null)}>
          <div className="modal-content qr-large-modal" onClick={e => e.stopPropagation()}>
            <h2 className={`qr-title team-${qrModalTeam}`}>TEAM {qrModalTeam} - Scanner Connect</h2>
            <div className="qr-huge-wrap">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(window.location.origin + '/?mode=scanner&team=' + qrModalTeam)}`} alt="Join QR" />
            </div>
            <p className="qr-desc">生徒のスマホでこのQRコードをスキャンしてください</p>
            <button className="btn-save" onClick={() => setQrModalTeam(null)}>Close</button>
          </div>
        </div>
      )}

      {/* 設定 */}
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