import { useState, useEffect, useRef } from 'react';
import './App.css';

// 外部JSONファイルをインポート
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
  const [activeTheme, setActiveTheme] = useState(null);
  const [gameStatus, setGameStatus] = useState('MENU'); 
  
  const [scores, setScores] = useState({ A: 0, B: 0 });
  const [combos, setCombos] = useState({ A: 0, B: 0 });
  const [maxCombos, setMaxCombos] = useState({ A: 0, B: 0 });

  const [message, setMessage] = useState(''); // 初期メッセージを空に
  const [isSuccess, setIsSuccess] = useState(null);

  const [selectedMinutes, setSelectedMinutes] = useState(5); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const inputBuffer = useRef('');
  const correctSound = new Audio('/correct.mp3');
  const incorrectSound = new Audio('/incorrect.mp3');

  // タイマー処理
  useEffect(() => {
    let timer;
    if (gameStatus === 'PLAYING' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && gameStatus === 'PLAYING') {
      setGameStatus('GAMEOVER');
    }
    return () => clearInterval(timer);
  }, [gameStatus, timeLeft]);

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
    setMessage(''); // ゲーム開始時のテキストも削除
  };

  const backToMenu = () => {
    setActiveTheme(null);
    setGameStatus('MENU');
    setIsSettingsOpen(false);
  };

  const handleScan = (team, scannedCode) => {
    if (gameStatus !== 'PLAYING') return;

    const currentThemeData = GAME_DATA[activeTheme].codes;
    
    if (currentThemeData[scannedCode]) {
      setScores(prev => ({ ...prev, [team]: prev[team] + 1 }));
      setCombos(prev => {
        const newCombo = prev[team] + 1;
        if (newCombo > maxCombos[team]) {
          setMaxCombos(m => ({ ...m, [team]: newCombo }));
        }
        return { ...prev, [team]: newCombo };
      });
      setMessage(`[TEAM ${team}] MATCH!`);
      setIsSuccess(true);
      correctSound.currentTime = 0;
      correctSound.play().catch(e => console.log(e));
    } else {
      setCombos(prev => ({ ...prev, [team]: 0 }));
      setMessage(`[TEAM ${team}] MISS!`);
      setIsSuccess(false);
      incorrectSound.currentTime = 0;
      incorrectSound.play().catch(e => console.log(e));
    }

    // 2秒後にメッセージを消す
    setTimeout(() => {
      if (gameStatus === 'PLAYING') {
        setMessage('');
        setIsSuccess(null);
      }
    }, 2000);
  };

  // キーボード（スキャナ）入力を監視
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;

      if (e.key === 'Enter') {
        const rawInput = inputBuffer.current.trim();
        
        if (rawInput) {
          const prefix = rawInput.substring(0, 2);
          const actualCode = rawInput.substring(2);

          if (prefix === 'A-') {
            handleScan('A', actualCode);
          } else if (prefix === 'B-') {
            handleScan('B', actualCode);
          } else {
            setMessage('⚠️ ERROR: Check Scanner Prefix');
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
  }, [gameStatus, activeTheme, maxCombos]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`main-viewport ${gameStatus === 'MENU' ? 'pattern-bg' : 'gradient-bg'}`}>
      
      {gameStatus === 'MENU' && (
        <div className="particles">
          {[...Array(12)].map((_, i) => <div key={i} className="dot"></div>)}
        </div>
      )}

      {/* 1. メインメニュー */}
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
          <button className="settings-btn shadow-pop" onClick={() => setIsSettingsOpen(true)}>⚙️</button>
        </div>
      )}

      {/* 2. Ready 画面 */}
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

      {/* 3. ゲームプレイ画面 */}
      {gameStatus === 'PLAYING' && (
        <div className="game-layout">
          <header className="game-header">
            {/* 左：ロゴとテーマ名 */}
            <div className="header-left">
              <img src="/scannetlogo.png" alt="Scannect" className="header-logo" />
              <div className="theme-name">{GAME_DATA[activeTheme].title}</div>
            </div>
            
            {/* 中央：タイマー */}
            <div className="header-center">
              <div className={`timer-display ${timeLeft <= 10 ? 'danger' : ''}`}>
                TIME {formatTime(timeLeft)}
              </div>
            </div>

            {/* 右：中断ボタン（英語化） */}
            <div className="header-right">
              <button onClick={backToMenu} className="btn-abort">QUIT GAME</button>
            </div>
          </header>

          <main className="game-main">
            <div className="vs-scoreboard">
              
              {/* TEAM A カード */}
              <div className="glass-card team-card team-a">
                <div className="team-badge-a">TEAM A</div>
                <div className="vs-score">{scores.A}</div>
                <div className="vs-combo">COMBO: {combos.A}</div>
              </div>

              <div className="vs-center-text">VS</div>

              {/* TEAM B カード */}
              <div className="glass-card team-card team-b">
                <div className="team-badge-b">TEAM B</div>
                <div className="vs-score">{scores.B}</div>
                <div className="vs-combo">COMBO: {combos.B}</div>
              </div>

            </div>

            {/* ガイド文言を削除し、メッセージがある時だけバーを表示 */}
            {message && (
              <div className={`glass-card message-bar ${isSuccess === true ? 'success' : isSuccess === false ? 'error' : ''}`}>
                {message}
              </div>
            )}
          </main>
        </div>
      )}

      {/* 4. 結果画面 */}
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
    </div>
  );
}

export default App;