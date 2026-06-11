import React, { useState, useEffect, useRef } from 'react';

export default function ScannerMission({ card, themeData, onComplete }) {
  // ★ ENTRY（正解演出） -> MISSION（語彙or音読）のフェーズ管理
  const [phase, setPhase] = useState('ENTRY'); 
  const [missionType, setMissionType] = useState('LOADING');
  const [vocabData, setVocabData] = useState(null);
  
  const [isListening, setIsListening] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [feedback, setFeedback] = useState(null);
  
  const recognitionRef = useRef(null);

  useEffect(() => {
    // ① 正解の心地よい音を鳴らす
    const correctSound = new Audio('/correct.mp3');
    correctSound.play().catch(e => console.log('Audio play error:', e));

    // ② 語彙と音読を 50% : 50% の確率で振り分け
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSpeechSupported = !!SpeechRecognition;
    const isSpeakingMission = isSpeechSupported && Math.random() < 0.5; // ★ 50%の確率

    if (isSpeakingMission) {
      setMissionType('SPEAKING');
    } else {
      setupVocabQuiz();
    }
    
    // 2秒間「CORRECT!」のアニメーションを見せた後、ミッション画面へ切り替え
    const timer = setTimeout(() => {
      setPhase('MISSION');
    }, 2000);

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
      .slice(0, 2);

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
    setTimeout(() => onComplete(points), 1500);
  };

  const startSpeaking = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { setIsListening(true); setLiveText(''); };

    recognition.onresult = (event) => {
      const currentTranscript = Array.from(event.results).map(res => res[0].transcript).join('');
      setLiveText(currentTranscript);
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return; 
      setIsListening(false);
      setFeedback({ status: 'incorrect', message: '⚠️ 認識エラー\nスコア: 1 / 10 点' });
      setTimeout(() => onComplete(1), 2000);
    };

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
      setTimeout(() => onComplete(1), 2000);
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
    setTimeout(() => onComplete(points), 3000);
  };

  // ★ ① 正解した瞬間のド派手なエントリー画面
  if (phase === 'ENTRY') {
    return (
      <div className="scan-entry-overlay">
        <div className="entry-icon">✅</div>
        <h2>CORRECT!</h2>
        <p>Mission Start...</p>
      </div>
    );
  }

  // ミッション画面
  return (
    <div className="mission-container glass-card popIn">
      {feedback ? (
        <div className={`mission-feedback ${feedback.status}`}>
          {feedback.message.split('\n').map((line, i) => (
            <div key={i} style={i === 1 ? { fontSize: '1.2em', margin: '10px 0', color: '#34495e' } : {}}>{line}</div>
          ))}
        </div>
      ) : (
        <>
          {missionType === 'VOCAB' && vocabData && (
            <div className="vocab-mission">
              <h3 className="mission-title">📝 Vocab Quiz!</h3>
              <div className="vocab-word">What does <span>"{vocabData.word}"</span> mean?</div>
              <div className="vocab-choices">
                {vocabData.choices.map((choice, i) => (
                  <button key={i} className="choice-btn shadow-pop" onClick={() => handleVocabAnswer(choice)}>{choice}</button>
                ))}
              </div>
            </div>
          )}

          {missionType === 'SPEAKING' && (
            <div className="speaking-mission">
              <h3 className="mission-title hot">🎤 SPEAKING CHALLENGE!</h3>
              <p className="mission-desc" style={{fontWeight: 'bold', color: '#2c3e50'}}>英文を声に出して読んでください</p>
              <div className="target-text" style={{fontSize: '1.4rem', background: '#f8f9fa', padding: '15px', borderRadius: '10px', borderLeft: '5px solid #3498db', marginBottom: '20px'}}>
                {card.card_a.text}
              </div>
              
              {isListening ? (
                <div className="live-transcription-area">
                  <div className="recording-status"><span className="pulse-dot"></span> 録音中...</div>
                  <div className="live-text-box" style={{minHeight: '80px', background: '#fff', border: '2px dashed #e74c3c', borderRadius: '10px', padding: '15px', marginBottom: '20px', fontSize: '1.2rem', color: '#7f8c8d'}}>
                    {liveText || "..."}
                  </div>
                  <button className="stop-speak-btn shadow-pop" onClick={stopSpeaking} style={{background: '#e74c3c', color: 'white', padding: '15px 30px', fontSize: '1.3rem', borderRadius: '50px', border: 'none', width: '100%', fontWeight: 'bold'}}>
                    🛑 終了して判定する
                  </button>
                </div>
              ) : (
                <button className="speak-btn shadow-pop" onClick={startSpeaking} style={{background: '#3498db', color: 'white', padding: '15px 30px', fontSize: '1.3rem', borderRadius: '50px', border: 'none', width: '100%', fontWeight: 'bold'}}>
                  🎙️ タップして話し始める
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}