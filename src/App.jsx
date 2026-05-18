import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
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
  // ★ 変更：デフォルトのモードを 'HOST_MENU' (先生用画面) に設定
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
  const [showJoinQR, setShowJoinQR] = useState(false); 
  const [timeLeft, setTimeLeft] = useState(0);

  const inputBuffer = useRef('');
  const correctSound = new Audio('/correct.mp3');
  const incorrectSound = new Audio('/incorrect.mp3');

  const firebaseListenerRef = useRef(null);
  const scannerRef = useRef(null);

  // ==========================================
  // 1. メインスクリーン（PC）用ロジック
  // ==========================================

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
    if (firebaseListenerRef.current) {
        firebaseListenerRef.current = null;
    }
  };

  const handleScan = (team, scannedCode) => {
    if (gameStatus !== 'PLAYING') return;

    const currentThemeData = GAME_DATA[activeTheme].codes;
    const isCorrect = currentThemeData.find(item => item.id === scannedCode);
    
    if (isCorrect) {
      setScores(prev => ({ ...prev, [team]: prev[team] + 1 }));
      setCombos(prev => {
        const newCombo = prev[team] + 1;
        if (newCombo > maxCombos[team]) {
          setMaxCombos(m => ({ ...m, [team]: newCombo }));
        }
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

  useEffect(() => {
    if (appMode !== 'HOST_MENU') return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;

      if (e.key === 'Enter') {
        const rawInput = inputBuffer.current.trim();
        if (rawInput) {
          const prefix = rawInput.substring(0, 2);
          const actualCode = rawInput.substring(2);

          if (prefix === 'A-') handleScan('A', actualCode);
          else if (prefix === 'B-') handleScan('B', actualCode);
          else {
            setMessage('⚠️ ERROR: Check Prefix');
            setIsSuccess(false);
          }
        }
        inputBuffer.current = '';
      } else if (e.key.length === 1) {
        inputBuffer.current += e.key;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appMode, gameStatus, activeTheme, maxCombos]);


  // ==========================================
  // 2. モバイルスキャナー（スマホ）用ロジック
  // ==========================================

  useEffect(() => {
    if (appMode === 'SCANNER' && scannerTeam) {
      scannerRef.current = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: {width: 250, height: 250} },
        false
      );
      scannerRef.current.render(onScanSuccess, onScanFailure);
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => console.error(error));
      }
    };
  }, [appMode, scannerTeam]);

  const onScanSuccess = (decodedText, decodedResult) => {
    if (scannerRef.current) scannerRef.current.pause();

    push(ref(database, 'scans'), {
      team: scannerTeam,
      code: decodedText,
      timestamp: serverTimestamp() 
    }).then(() => {
        setMessage('送信完了！');
        setIsSuccess(true);
        setTimeout(() => {
            setMessage('');
            setIsSuccess(null);
            if (scannerRef.current) scannerRef.current.resume();
        }, 1500);
    }).catch((error) => {
        setMessage('通信エラー');
        setIsSuccess(false);
        setTimeout(() => {
            if (scannerRef.current) scannerRef.current.resume();
        }, 2000);
    });
  };

  const onScanFailure = (error) => {};

  // ==========================================
  // 画面描画
  // ==========================================

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- 画面1: スマホ（生徒用）スキャナーモード ---
  if (appMode === 'SCANNER') {
    return (
      <div className="main-viewport pattern-bg" style={{flexDirection: 'column', padding: '20px'}}>
        {!scannerTeam ? (
          <div className="content-wrap glass-card" style={{padding: '40px'}}>
            <h2 style={{fontSize: '2rem', marginBottom: '30px', color:'#2c3e50'}}>Which team are you?</h2>
            <div style={{display: 'flex', gap: '20px', justifyContent:'center'}}>
               <button onClick={() => setScannerTeam('A')} style={{padding:'20px 50px', fontSize:'2rem', fontWeight:'bold', background:'#e74c3c', color:'white', border:'none', borderRadius:'15px'}}>TEAM A</button>
               <button onClick={() => setScannerTeam('B')} style={{padding:'20px 50px', fontSize:'2rem', fontWeight:'bold', background:'#3498db', color:'white', border:'none', borderRadius:'15px'}}>TEAM B</button>
            </div>
            {/* メイン画面に戻る */}
            <button onClick={() => { window.location.href = window.location.origin; }} className="btn-text-only" style={{marginTop:'30px'}}>Back to Main Screen</button>
          </div>
        ) : (
          <div style={{width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
             <div style={{background: scannerTeam === 'A' ? '#e74c3c' : '#3498db', color: 'white', padding: '10px 40px', borderRadius: '30px', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px'}}>
                You are playing as TEAM {scannerTeam}
             </div>
             <div id="reader" style={{width: '100%', borderRadius: '20px', overflow: 'hidden', border: '5px solid white', boxShadow: '0 10px 20px rgba(0,0,0,0.1)'}}></div>
             {message && (
                <div style={{marginTop: '20px', padding: '15px 30px', background: isSuccess ? '#2ecc71' : '#e74c3c', color: 'white', borderRadius: '50px', fontSize: '1.5rem', fontWeight: 'bold'}}>
                  {message}
                </div>
             )}
             <button onClick={() => { window.location.href = window.location.origin + '?mode=scanner'; }} className="btn-text-only" style={{marginTop:'30px', color:'#2c3e50'}}>Change Team</button>
          </div>
        )}
      </div>
    );
  }

  // --- 画面2：PC（先生用）メインスクリーン ---
  return (
    <div className={`main-viewport ${gameStatus === 'MENU' ? 'pattern-bg' : 'gradient-bg'}`}>
      
      {gameStatus === 'MENU' && (
        <div className="particles">
          {[...Array(12)].map((_, i) => <div key={i} className="dot"></div>)}
        </div>
      )}

      {/* メインメニュー */}
      {gameStatus === 'MENU' && (
        <div className="content-wrap">
          <div className="logo-container">
            <img src="/scannetlogo.png" alt="Scannect Logo" className="main-logo" />
          </div>
          <div className="theme-buttons">
            <button onClick={() => selectTheme('cafe')} className="custom-border-box">☕ Cafe</button>
            <button onClick={() => selectTheme('sdgs')} className="custom-border-box">🌍 SDGs</button>
            <button onClick={() => selectTheme('hotel')} className="custom-border-box">🏨 Hotel</button>
            <button onClick={() => selectTheme('airport')} className="custom-border-box">✈️ Airport</button>
            <button onClick={() => selectTheme('zoo')} className="custom-border-box">🦁 Zoo</button>
          </div>
          
          <div style={{display: 'flex', justifyContent: 'center', marginTop: '40px', width: '100%'}}>
            <button onClick={() => setShowJoinQR(true)} className="btn-text-only" style={{fontSize:'1.2rem', fontWeight: 'bold', color: '#3498db', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px'}}>
              📱 生徒用スキャナ接続QRを表示
            </button>
          </div>

          <button className="settings-btn shadow-pop" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
        </div>
      )}

      {/* Ready 画面 */}
      {gameStatus === 'READY' && (
        <div className="content-wrap glass-card ready-panel">
          <h2 className="ready-title">{GAME_DATA[activeTheme].title}</h2>
          <div className="ready-info">Time Limit: <strong>{selectedMinutes}</strong> min</div>
          <button onClick={handleStartGame} className="start-btn shadow-pop">
             START GAME
          </button>
          <button onClick={backToMenu} className="btn-text-only">Cancel</button>
        </div>
      )}

      {/* ゲームプレイ画面 */}
      {gameStatus === 'PLAYING' && (
        <div className="game-layout">
          <header className="game-header">
            <div className="header-left">
              <img src="/scannetlogo.png" alt="Scannect" className="header-logo" />
              <div className="theme-name">{GAME_DATA[activeTheme].title}</div>
            </div>
            
            <div className="header-center">
              <div className={`timer-display ${timeLeft <= 10 ? 'danger' : ''}`}>
                TIME {formatTime(timeLeft)}
              </div>
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

            {message && (
              <div className={`glass-card message-bar ${isSuccess === true ? 'success' : isSuccess === false ? 'error' : ''}`}>
                {message}
              </div>
            )}
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

          <button onClick={backToMenu} className="start-btn shadow-pop" style={{marginTop:'50px'}}>
            BACK TO MENU
          </button>
        </div>
      )}

      {/* 設定モーダル */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{fontSize:'2rem', color:'#2c3e50', marginBottom:'20px'}}>Game Settings</h3>
            <div className="slider-group">
              <label>Time Limit: <strong>{selectedMinutes}</strong> min</label>
              <input type="range" min="3" max="15" value={selectedMinutes} onChange={e => setSelectedMinutes(Number(e.target.value))} />
            </div>
            <button className="btn-save" onClick={() => setIsSettingsOpen(false)}>OK</button>
          </div>
        </div>
      )}

      {/* 生徒用QR表示モーダル */}
      {showJoinQR && (
        <div className="modal-overlay" onClick={() => setShowJoinQR(false)}>
          <div className="modal-content" style={{width: '700px'}} onClick={e => e.stopPropagation()}>
            <h3 style={{fontSize:'2.2rem', color:'#2c3e50', marginBottom:'10px'}}>生徒用スキャナ接続QR</h3>
            <p style={{fontSize:'1.2rem', color:'#7f8c8d', marginBottom:'30px'}}>生徒のスマホ（標準カメラ）で読み取らせてください</p>
            
            <div style={{display: 'flex', justifyContent: 'space-around', alignItems: 'center'}}>
              <div style={{textAlign: 'center'}}>
                <h4 style={{fontSize: '2rem', color: '#e74c3c', marginBottom: '15px'}}>TEAM A</h4>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/?mode=scanner&team=A')}`} alt="Team A QR" style={{borderRadius: '10px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)'}} />
              </div>
              
              <div style={{textAlign: 'center'}}>
                <h4 style={{fontSize: '2rem', color: '#3498db', marginBottom: '15px'}}>TEAM B</h4>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/?mode=scanner&team=B')}`} alt="Team B QR" style={{borderRadius: '10px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)'}} />
              </div>
            </div>
            <button className="btn-save" onClick={() => setShowJoinQR(false)}>閉じる</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;