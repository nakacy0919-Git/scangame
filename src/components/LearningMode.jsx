import React, { useState, useEffect } from 'react';

export default function LearningMode({ gameData, onBack, bgmVolume, isMuted }) {
  const [learningPhase, setLearningPhase] = useState('SELECT_THEME'); 
  const [activeTheme, setActiveTheme] = useState(null);
  const [questionCount, setQuestionCount] = useState(10); 
  
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choices, setChoices] = useState([]);
  
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const [feedback, setFeedback] = useState(null); 

  const correctSound = new Audio('/correct.mp3');
  const incorrectSound = new Audio('/incorrect.mp3');

  const selectTheme = (themeKey) => {
    setActiveTheme(themeKey);
    setLearningPhase('MENU');
  };

  const startVocab = () => setLearningPhase('VOCAB');

  const startGame = () => {
    const allCards = [...gameData[activeTheme].codes];
    const limit = questionCount === 'ALL' ? allCards.length : questionCount;
    const shuffled = allCards.sort(() => 0.5 - Math.random()).slice(0, limit);
    
    setQuestions(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setLearningPhase('GAME');
    generateChoices(shuffled[0], allCards);
    setQuestionStartTime(Date.now());
  };

  const generateChoices = (correctCard, allCards) => {
    const wrongChoices = allCards
      .filter(c => c.id !== correctCard.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);
    const combined = [...wrongChoices, correctCard].sort(() => 0.5 - Math.random());
    setChoices(combined);
  };

  const playSound = (sound) => {
    if (!isMuted) { 
      sound.volume = bgmVolume;
      sound.currentTime = 0;
      sound.play().catch(e=>e);
    }
  };

  const handleAnswer = (selectedCard) => {
    const currentCard = questions[currentIndex];
    const timeTaken = Date.now() - questionStartTime;
    const isCorrect = selectedCard.id === currentCard.id;

    if (isCorrect) {
      playSound(correctSound);
      setFeedback('correct');

      const speedBonus = Math.max(0, 500 - Math.floor(timeTaken / 10));
      const comboBonus = combo * 50;
      const pointsEarned = 100 + comboBonus + speedBonus;
      
      setScore(prev => prev + pointsEarned);
      setCombo(prev => {
        const newCombo = prev + 1;
        if (newCombo > maxCombo) setMaxCombo(newCombo);
        return newCombo;
      });
    } else {
      playSound(incorrectSound);
      setFeedback('incorrect');
      setCombo(0); 
      setScore(prev => Math.max(0, prev - 50)); 
    }

    setTimeout(() => {
      setFeedback(null);
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(prev => prev + 1);
        generateChoices(questions[currentIndex + 1], gameData[activeTheme].codes);
        setQuestionStartTime(Date.now());
      } else {
        setLearningPhase('RESULT');
      }
    }, 1000);
  };

  // ★ 追加：本文中の単語を自動で探して、蛍光マーカーのようにハイライトする魔法の機能
  const highlightVocab = (text, vocabList) => {
    if (!vocabList || vocabList.length === 0) return text;
    
    // 長い単語から順番にチェックするように並び替え（短い単語の誤爆を防ぐため）
    const words = vocabList.map(v => v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
    const regex = new RegExp(`(${words.join('|')})`, 'gi');
    
    const parts = text.split(regex);
    return parts.map((part, index) => {
      // 見つけた単語には専用のデザインクラス（.highlight-vocab）を付与する
      const isMatch = vocabList.some(v => v.word.toLowerCase() === part.toLowerCase());
      return isMatch ? <span key={index} className="highlight-vocab">{part}</span> : part;
    });
  };

  if (learningPhase === 'SELECT_THEME') {
    return (
      <div className="learning-container">
        <h2 className="learning-title">📚 Solo Learning Mode</h2>
        <p className="learning-subtitle">学習するテーマを選んでください</p>
        <div className="theme-grid">
          {Object.keys(gameData).map(key => (
            <button key={key} onClick={() => selectTheme(key)} className="learning-theme-btn shadow-pop">
              {gameData[key].title}
            </button>
          ))}
        </div>
        <button onClick={onBack} className="btn-text-only" style={{marginTop: '30px', fontSize: '1.4rem'}}>← メインメニューに戻る</button>
      </div>
    );
  }

  if (learningPhase === 'MENU') {
    return (
      <div className="learning-container glass-card" style={{padding: '50px'}}>
        <h2 className="learning-title" style={{marginBottom: '30px'}}>{gameData[activeTheme].title}</h2>
        
        <h3 style={{color: '#7f8c8d', marginBottom: '15px'}}>挑戦する問題数</h3>
        <div className="count-selector">
          <button className={`count-btn ${questionCount === 10 ? 'active' : ''}`} onClick={() => setQuestionCount(10)}>10問</button>
          <button className={`count-btn ${questionCount === 20 ? 'active' : ''}`} onClick={() => setQuestionCount(20)}>20問</button>
          <button className={`count-btn ${questionCount === 'ALL' ? 'active' : ''}`} onClick={() => setQuestionCount('ALL')}>ALL ({gameData[activeTheme].codes.length}問)</button>
        </div>

        <div style={{display: 'flex', gap: '30px', marginTop: '20px'}}>
          <button onClick={startVocab} className="action-btn vocab-btn shadow-pop">📖 語彙を学習する</button>
          {/* ★ 変更：ゲームスタート から マッチング練習 に変更 */}
          <button onClick={startGame} className="action-btn game-btn shadow-pop">🎮 マッチング練習</button>
        </div>
        <button onClick={() => setLearningPhase('SELECT_THEME')} className="btn-text-only" style={{marginTop: '40px', fontSize: '1.4rem'}}>← モード選択に戻る</button>
      </div>
    );
  }

  if (learningPhase === 'VOCAB') {
    const cards = gameData[activeTheme].codes;
    return (
      <div className="learning-container" style={{maxWidth: '1000px'}}>
        <div className="vocab-header">
          <h2>📖 Vocabulary Study : {gameData[activeTheme].title}</h2>
          {/* ★ 変更：完了 から 学習メニューに戻る に変更 */}
          <button onClick={() => setLearningPhase('MENU')} className="btn-text-only" style={{fontSize: '1.2rem', fontWeight: 'bold', textDecoration: 'none', background: '#e2e8f0', padding: '10px 20px', borderRadius: '10px', color: '#2c3e50'}}>← 学習メニューに戻る</button>
        </div>
        <div className="vocab-list">
          {cards.map(card => (
            <div key={card.id} className="vocab-card glass-card" style={{background: 'rgba(255,255,255,0.95)'}}>
              <div className="vocab-text-group">
                {/* ★ 追加：本文中の単語をハイライト表示 */}
                <div className="vocab-en"><strong>A:</strong> {highlightVocab(card.card_a.text, card.vocabulary)}</div>
                <div className="vocab-ja">{card.card_a.text_ja}</div>
              </div>
              <hr />
              <div className="vocab-text-group">
                {/* ★ 追加：本文中の単語をハイライト表示 */}
                <div className="vocab-en"><strong>B:</strong> {highlightVocab(card.card_b.text, card.vocabulary)}</div>
                <div className="vocab-ja">{card.card_b.text_ja}</div>
              </div>
              <div className="vocab-words">
                {card.vocabulary && card.vocabulary.map((v, i) => (
                  <span key={i} className="vocab-badge">{v.word} ({v.meaning})</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (learningPhase === 'GAME') {
    const currentCard = questions[currentIndex];
    return (
      <div className="learning-game-container">
        <div className="game-status-bar glass-card" style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          <div className="progress">Q {currentIndex + 1} / {questions.length}</div>
          <div className="current-score">SCORE: {score}</div>
          <div className={`current-combo ${combo > 1 ? 'hot' : ''}`}>COMBO: {combo}</div>
          <div style={{flexGrow: 1}}></div>
          {/* ★ 変更：QUIT GAME から 学習メニューに戻る に変更し、UIを親切に */}
          <button onClick={() => setLearningPhase('MENU')} className="btn-abort">← 中断して戻る</button>
        </div>

        <div className="learning-game-area">
          <div className="question-card glass-card">
            <h3>Situation (A Card)</h3>
            <p className="q-en">{currentCard.card_a.text}</p>
            <p className="q-ja">{currentCard.card_a.text_ja}</p>
          </div>

          <div className="choices-grid">
            {choices.map((choice, idx) => (
              <button 
                key={idx} 
                className={`choice-card glass-card ${feedback && choice.id === currentCard.id ? 'correct-flash' : ''}`}
                onClick={() => !feedback && handleAnswer(choice)}
                disabled={feedback !== null}
              >
                {choice.card_b.text}
              </button>
            ))}
          </div>
        </div>

        {feedback && (
          <div className={`feedback-overlay ${feedback}`}>
            {feedback === 'correct' ? '⭕ PERFECT!' : '❌ MISS...'}
          </div>
        )}
      </div>
    );
  }

  if (learningPhase === 'RESULT') {
    return (
      <div className="learning-container glass-card" style={{padding: '50px'}}>
        <h2 className="time-up-text" style={{color: '#2c3e50'}}>CLEAR!</h2>
        <div className="final-score-box">
          <p>TOTAL SCORE</p>
          <div className="res-num" style={{color: '#3498db'}}>{score}</div>
          <p style={{fontSize: '1.5rem', color: '#e67e22', fontWeight: 'bold'}}>MAX COMBO: {maxCombo}</p>
        </div>
        <div style={{display: 'flex', gap: '20px', marginTop: '40px'}}>
          <button onClick={startGame} className="start-btn shadow-pop">もう一度プレイ</button>
          {/* ★ 変更：メニューに戻る から 学習メニューに戻る に変更 */}
          <button onClick={() => setLearningPhase('MENU')} className="btn-save">学習メニューに戻る</button>
        </div>
      </div>
    );
  }

  return null;
}