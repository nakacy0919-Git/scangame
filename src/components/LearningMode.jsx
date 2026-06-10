import React, { useState, useEffect } from 'react';

export default function LearningMode({ gameData, onBack, bgmVolume, isMuted }) {
  const [learningPhase, setLearningPhase] = useState('SELECT_THEME'); 
  const [activeTheme, setActiveTheme] = useState(null);
  const [questionCount, setQuestionCount] = useState(10); 
  
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choices, setChoices] = useState([]);
  
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [highScore, setHighScore] = useState(0);
  
  const [feedback, setFeedback] = useState(null); 
  const [earnedPoints, setEarnedPoints] = useState(0);
  
  // ★ 追加機能：日本語訳の表示切替と解答履歴
  const [showTranslation, setShowTranslation] = useState(false);
  const [answerHistory, setAnswerHistory] = useState([]);

  const correctSound = new Audio('/correct.mp3');
  const incorrectSound = new Audio('/incorrect.mp3');

  const selectTheme = (themeKey) => {
    setActiveTheme(themeKey);
    const savedHighScore = localStorage.getItem(`scannect_highscore_${themeKey}`);
    setHighScore(savedHighScore ? parseInt(savedHighScore) : 0);
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
    setTimeLeft(20);
    setAnswerHistory([]); // 履歴をリセット
    setShowTranslation(false); // 翻訳表示をデフォルトOFFにリセット
    setLearningPhase('GAME');
    generateChoices(shuffled[0], allCards);
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

  useEffect(() => {
    let timer;
    if (learningPhase === 'GAME' && !feedback && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (learningPhase === 'GAME' && !feedback && timeLeft === 0) {
      handleAnswer(null); 
    }
    return () => clearTimeout(timer);
  }, [learningPhase, feedback, timeLeft]);

  const handleAnswer = (selectedCard) => {
    const currentCard = questions[currentIndex];
    const isCorrect = selectedCard && selectedCard.id === currentCard.id;

    // ★ 履歴に保存
    const historyEntry = {
      qNum: currentIndex + 1,
      qText: currentCard.card_a.text,
      userAns: selectedCard ? selectedCard.card_b.text : 'Time Up',
      correctAns: currentCard.card_b.text,
      isCorrect: isCorrect
    };
    setAnswerHistory(prev => [...prev, historyEntry]);

    if (isCorrect) {
      playSound(correctSound);
      const points = 100 + (timeLeft * 10);
      setEarnedPoints(points);
      setScore(prev => prev + points);
      setFeedback('correct');
    } else {
      playSound(incorrectSound);
      setEarnedPoints(0);
      setFeedback(selectedCard ? 'incorrect' : 'timeout');
    }

    setTimeout(() => {
      setFeedback(null);
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(prev => prev + 1);
        setTimeLeft(20);
        generateChoices(questions[currentIndex + 1], gameData[activeTheme].codes);
      } else {
        finishGame();
      }
    }, 1500);
  };

  const finishGame = () => {
    setLearningPhase('RESULT');
    let newHighScore = highScore;
    if (score > highScore) {
      newHighScore = score;
      setHighScore(score);
      localStorage.setItem(`scannect_highscore_${activeTheme}`, score.toString());
    }
    const today = new Date().toLocaleDateString('ja-JP');
    const logEntry = { date: today, theme: gameData[activeTheme].title, score: score };
    const existingLogs = JSON.parse(localStorage.getItem('scannect_learning_logs') || '[]');
    existingLogs.push(logEntry);
    localStorage.setItem('scannect_learning_logs', JSON.stringify(existingLogs));
  };

  const highlightVocab = (text, vocabList) => {
    if (!vocabList || vocabList.length === 0) return text;
    const words = vocabList.map(v => v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
    const regex = new RegExp(`(${words.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) => {
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
          {Object.keys(gameData).map(themeKey => (
            <button 
              key={themeKey} 
              className={`learning-topic-btn theme-${themeKey} shadow-pop`}
              onClick={() => selectTheme(themeKey)}
            >
              <span className="topic-name">{gameData[themeKey].title.split(':').pop().trim()}</span>
              <div className="btn-stitch"></div>
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
        <h2 className="learning-title" style={{marginBottom: '10px'}}>{gameData[activeTheme].title}</h2>
        <div style={{fontSize: '1.4rem', color: '#e67e22', fontWeight: 'bold', marginBottom: '30px'}}>
          🏆 High Score: {highScore}
        </div>
        
        <h3 style={{color: '#7f8c8d', marginBottom: '15px'}}>挑戦する問題数</h3>
        <div className="count-selector">
          <button className={`count-btn ${questionCount === 10 ? 'active' : ''}`} onClick={() => setQuestionCount(10)}>10問</button>
          <button className={`count-btn ${questionCount === 20 ? 'active' : ''}`} onClick={() => setQuestionCount(20)}>20問</button>
          <button className={`count-btn ${questionCount === 'ALL' ? 'active' : ''}`} onClick={() => setQuestionCount('ALL')}>ALL ({gameData[activeTheme].codes.length}問)</button>
        </div>

        <div style={{display: 'flex', gap: '30px', marginTop: '30px', width: '100%', justifyContent: 'center'}}>
          <button onClick={startVocab} className="action-btn vocab-btn shadow-pop">
            <span className="btn-icon">📖</span><span className="btn-text">語彙を学習する</span><div className="btn-stitch"></div>
          </button>
          <button onClick={startGame} className="action-btn game-btn shadow-pop">
            <span className="btn-icon">🎮</span><span className="btn-text">マッチング練習</span><div className="btn-stitch"></div>
          </button>
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
          <h2>📖 Vocabulary : {gameData[activeTheme].title.split(':').pop().trim()}</h2>
          <button onClick={() => setLearningPhase('MENU')} className="btn-text-only" style={{fontSize: '1.2rem', fontWeight: 'bold', background: '#e2e8f0', padding: '10px 20px', borderRadius: '10px', color: '#2c3e50'}}>← 学習メニューに戻る</button>
        </div>
        <div className="vocab-list">
          {cards.map(card => (
            <div key={card.id} className="vocab-card glass-card" style={{background: 'rgba(255,255,255,0.95)'}}>
              <div className="vocab-text-group">
                <div className="vocab-en"><strong>A:</strong> {highlightVocab(card.card_a.text, card.vocabulary)}</div>
                <div className="vocab-ja">{card.card_a.text_ja}</div>
              </div>
              <hr />
              <div className="vocab-text-group">
                <div className="vocab-en"><strong>B:</strong> {highlightVocab(card.card_b.text, card.vocabulary)}</div>
                <div className="vocab-ja">{card.card_b.text_ja}</div>
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
      <div className="learning-game-wrapper">
        <div className="game-top-panel glass-card">
          {/* ★ 修正：左（問題番号・時間）と右（スコア・中断）に綺麗に分割 */}
          <div className="game-stats-row-new">
            <div className="stats-group-left">
              <div className="stat-side-box">
                <span className="stat-label">QUESTION</span>
                <span className="stat-value">{currentIndex + 1} / {questions.length}</span>
              </div>
              <div className="stat-side-box">
                <span className="stat-label">TIME</span>
                <span className={`stat-value timer-value ${timeLeft <= 5 ? 'danger-pulse' : ''}`}>{timeLeft}s</span>
              </div>
            </div>
            
            <div className="stats-group-right">
              <div className="score-display-wrapper">
                <span className="score-icon">🏆</span>
                <span className="score-number">{score}</span>
                <span className="score-unit">pts</span>
              </div>
              <button onClick={() => setLearningPhase('MENU')} className="abort-mini-btn">← 中断</button>
            </div>
          </div>
          
          <div className="question-display-area">
            <div className="q-header-row">
              <span className="q-label">Situation (A Card)</span>
              <button 
                className={`translate-toggle-btn ${showTranslation ? 'active' : ''}`} 
                onClick={() => setShowTranslation(!showTranslation)}
              >
                A (日本語訳)
              </button>
            </div>
            <h2 className="q-en-huge">{currentCard.card_a.text}</h2>
            {showTranslation && <p className="q-ja-sub">{currentCard.card_a.text_ja}</p>}
          </div>
        </div>

        <div className="choices-2x2-grid">
          {choices.map((choice, idx) => {
            const isSelected = feedback && choice.id === currentCard.id;
            return (
              <button 
                key={idx} 
                className={`learning-choice-btn choice-color-${idx + 1} ${isSelected ? 'correct-glow' : ''} ${feedback && !isSelected ? 'fade-out' : ''}`}
                onClick={() => !feedback && handleAnswer(choice)}
                disabled={feedback !== null}
              >
                {/* ★ 修正②：テキストの左寄せ用クラスを追加 */}
                <div className="choice-text-inner">{choice.card_b.text}</div>
                <div className="btn-stitch"></div>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className={`learning-feedback-overlay ${feedback}`}>
            {feedback === 'correct' ? (
              <>
                <div className="feedback-icon">⭕ PERFECT!</div>
                <div className="feedback-points">+{earnedPoints} pts</div>
              </>
            ) : feedback === 'timeout' ? (
              <div className="feedback-icon">⏰ TIME UP...</div>
            ) : (
              <div className="feedback-icon">❌ MISS...</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (learningPhase === 'RESULT') {
    return (
      <div className="learning-container glass-card" style={{padding: '50px', maxWidth: '1000px', width: '90%'}}>
        {score >= highScore && score > 0 && <h2 className="new-record-text">🎉 NEW HIGH SCORE! 🎉</h2>}
        <div className="final-score-box">
          <p>TOTAL SCORE</p>
          <div className="res-num" style={{color: '#3498db', fontSize: '6rem'}}>{score}</div>
        </div>

        {/* ★ 修正③：結果リストをカード型の美しいタイムライン風に */}
        <div className="history-list-container">
          <h3 className="history-title">学習履歴 (Study History)</h3>
          <ul className="history-list-new">
            {answerHistory.map((item, i) => (
              <li key={i} className={`history-item-new ${item.isCorrect ? 'item-correct' : 'item-wrong'}`}>
                <div className="hist-q-row">
                  <span className="hist-qnum">Q {item.qNum}</span>
                  <span className="hist-qtext">{item.qText}</span>
                </div>
                <div className="hist-ans-row">
                  <span className="hist-icon">{item.isCorrect ? '✅' : '❌'}</span>
                  <div className="hist-ans-details">
                    {item.isCorrect ? (
                      <span className="hist-correct-text">{item.userAns}</span>
                    ) : (
                      <>
                        <span className="hist-wrong-text">Your Answer: {item.userAns}</span>
                        <span className="hist-correct-text">Correct: {item.correctAns}</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 隙間(gap)を完全排除し、ピタッとくっついた美しいボタンへ */}
        <div className="result-action-buttons">
          <button onClick={startGame} className="btn-play-again">もう一度プレイ</button>
          <button onClick={() => setLearningPhase('MENU')} className="btn-back-menu">学習メニューに戻る</button>
        </div>
      </div>
    );
  }

  return null;
}