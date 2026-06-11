import React, { useState, useEffect, useRef } from 'react';

export default function ScannerMission({ card, themeData, onComplete }) {
  const [phase, setPhase] = useState('ENTRY'); 
  const [missionType, setMissionType] = useState('LOADING');
  const [vocabData, setVocabData] = useState(null);
  
  const [isListening, setIsListening] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [feedback, setFeedback] = useState(null);
  
  const recognitionRef = useRef(null);

  useEffect(() => {
    const correctSound = new Audio('/correct.mp3');
    correctSound.play().catch(e => e);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSpeechSupported = !!SpeechRecognition;
    const isSpeakingMission = isSpeechSupported && Math.random() < 0.5;

    if (isSpeakingMission) {
      setMissionType('SPEAKING');
    } else {
      setupVocabQuiz();
    }
    
    const timer = setTimeout(() => { setPhase('MISSION'); }, 2000);
    return () => {
      clearTimeout(timer);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [card, themeData]);

  const setupVocabQuiz = () => {
    if (!card.vocabulary || card.vocabulary.length === 0) {
      onComplete(1); 
      return;
    }
    const targetVocab = card.vocabulary[Math.floor(Math.random() * card.vocabulary.length)];
    const otherMeanings = themeData
      .flatMap(c => c.vocabulary || [])
      .map(v => v.meaning)
      .filter(m => m !== targetVocab.meaning)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3); // 4択にするために3つ抽出

    const choices = [targetVocab.meaning, ...otherMeanings].sort(() => 0.5 - Math.random());
    setVocabData({ word: targetVocab.word, correct: targetVocab.meaning, choices });
    setMissionType('VOCAB');
  };

  const handleVocabAnswer = (selected) => {
    const isCorrect = selected === vocabData.correct;
    const points = isCorrect ? 3 : 1;
    setFeedback({
      status: isCorrect ? 'correct' : 'incorrect',
      message: isCorrect ? '✅ CORRECT! (+3 pts)' : '❌ MISS... (+1 pt)'
    });
    setTimeout(() => onComplete(points), 2000);
  };

  const startSpeaking = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.onstart = () => { setIsListening(true); setLiveText(''); };
    recognition.onresult = (event) => {
      const currentTranscript = Array.from(event.results).map(res => res[0].transcript).join('');
      setLiveText(currentTranscript);
    };
    recognition.onerror = () => { setIsListening(false); };
    recognition.onend = () => { setIsListening(false); };
    recognition.start();
  };

  const stopSpeaking = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
    evaluateSpeech(liveText);
  };

  const evaluateSpeech = (spokenText) => {
    if (!spokenText.trim()) {
      setFeedback({ status: 'incorrect', message: '💦 音声が聞き取れませんでした\nスコア: 1 / 10 点' });
      setTimeout(() => onComplete(1), 2500);
      return;
    }
    const cleanTarget = card.card_a.text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const cleanSpoken = spokenText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    let matchCount = 0;
    cleanTarget.forEach(word => { if (cleanSpoken.includes(word)) matchCount++; });
    const accuracy = matchCount / cleanTarget.length;
    let points = 1; let msg = '💦 TRY HARDER'; let status = 'incorrect';
    if (accuracy >= 0.8) { points = 10; msg = '👑 EXCELLENT!!'; status = 'correct'; } 
    else if (accuracy >= 0.5) { points = 5; msg = '👍 GOOD!'; status = 'correct'; }
    setFeedback({ status, message: `${msg}\nスコア: ${points} / 10 点\n(認識精度: ${Math.floor(accuracy * 100)}%)` });
    setTimeout(() => onComplete(points), 3500);
  };

  if (phase === 'ENTRY') {
    return (
      <div className="scan-entry-overlay">
        <div className="entry-icon">✅</div>
        <h2>CORRECT!</h2>
        <p>Mission Start...</p>
      </div>
    );
  }

  return (
    <div className="mission-fullscreen-container">
      {feedback ? (
        <div className={`mission-feedback-fullscreen ${feedback.status}`}>
           <div className="feedback-content-card">
              {feedback.message.split('\n').map((line, i) => (
                <div key={i} className={i === 0 ? "fb-main-msg" : "fb-sub-msg"}>{line}</div>
              ))}
           </div>
        </div>
      ) : (
        <div className="mission-content-wrapper">
          {missionType === 'VOCAB' && vocabData && (
            <div className="fullscreen-vocab-layout">
              <header className="mission-header">
                <span className="badge">📝 Vocabulary Challenge</span>
              </header>
              <main className="mission-body">
                <div className="vocab-question-box">
                  <p className="q-instruction">意味を選んでください</p>
                  <h1 className="target-word-huge">{vocabData.word}</h1>
                </div>
                <div className="vocab-choices-grid-large">
                  {vocabData.choices.map((choice, i) => (
                    <button key={i} className={`large-choice-btn choice-style-${i+1}`} onClick={() => handleVocabAnswer(choice)}>
                      <span className="choice-text">{choice}</span>
                      <div className="btn-stitch"></div>
                    </button>
                  ))}
                </div>
              </main>
            </div>
          )}

          {missionType === 'SPEAKING' && (
            <div className="fullscreen-speaking-layout">
              <header className="mission-header">
                <span className="badge hot">🎤 Speaking Challenge</span>
              </header>
              <main className="mission-body">
                <div className="speaking-target-card">
                  <p className="q-instruction">英文を声に出して読んでください</p>
                  <h1 className="target-text-huge">{card.card_a.text}</h1>
                </div>
                
                <div className="speaking-control-area">
                  {isListening ? (
                    <div className="recording-fullscreen-ui">
                      <div className="status-row">
                        <span className="pulse-dot"></span> 録音中...
                      </div>
                      <div className="live-text-display">
                        {liveText || "Listening..."}
                      </div>
                      <button className="giant-stop-btn shadow-pop" onClick={stopSpeaking}>
                        🛑 終了して判定
                      </button>
                    </div>
                  ) : (
                    <button className="giant-start-btn shadow-pop" onClick={startSpeaking}>
                      🎙️ タップして開始
                    </button>
                  )}
                </div>
              </main>
            </div>
          )}
        </div>
      )}
    </div>
  );
}