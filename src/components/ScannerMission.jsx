import React, { useState, useEffect } from 'react';

export default function ScannerMission({ card, themeData, onComplete }) {
  const [missionType, setMissionType] = useState('LOADING'); // VOCAB or SPEAKING
  const [vocabData, setVocabData] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [speechResult, setSpeechResult] = useState('');
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    // Web Speech API が使えるかチェックし、20%の確率でスピーキングミッションへ
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSpeechSupported = !!SpeechRecognition;
    const isSpeakingMission = isSpeechSupported && Math.random() < 0.2;

    if (isSpeakingMission) {
      setMissionType('SPEAKING');
    } else {
      setupVocabQuiz();
    }
  }, [card, themeData]);

  const setupVocabQuiz = () => {
    // カードに語彙データがない場合はスキップして通常ポイント
    if (!card.vocabulary || card.vocabulary.length === 0) {
      onComplete(1); 
      return;
    }

    // ランダムに1つ語彙を選ぶ
    const targetVocab = card.vocabulary[Math.floor(Math.random() * card.vocabulary.length)];
    
    // 他のカードから不正解の選択肢を2つ抽出
    const otherMeanings = themeData
      .flatMap(c => c.vocabulary || [])
      .map(v => v.meaning)
      .filter(m => m !== targetVocab.meaning)
      .sort(() => 0.5 - Math.random())
      .slice(0, 2);

    const choices = [targetVocab.meaning, ...otherMeanings].sort(() => 0.5 - Math.random());

    setVocabData({
      word: targetVocab.word,
      correct: targetVocab.meaning,
      choices
    });
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
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setSpeechResult('');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSpeechResult(transcript);
      evaluateSpeech(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      setFeedback({ status: 'incorrect', message: '⚠️ 認識できませんでした (+1 pt)' });
      setTimeout(() => onComplete(1), 1500);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const evaluateSpeech = (spokenText) => {
    const targetText = card.card_a.text;
    
    // 記号を取り除き、小文字にして単語の配列にする
    const cleanTarget = targetText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const cleanSpoken = spokenText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    
    // 一致する単語の数をカウント
    let matchCount = 0;
    cleanTarget.forEach(word => {
      if (cleanSpoken.includes(word)) matchCount++;
    });

    const accuracy = matchCount / cleanTarget.length;
    let points = 1;
    let msg = '💦 TRY HARDER (+1 pt)';
    let status = 'incorrect';

    if (accuracy >= 0.8) {
      points = 10;
      msg = '👑 EXCELLENT!! (+10 pts)';
      status = 'correct';
    } else if (accuracy >= 0.5) {
      points = 5;
      msg = '👍 GOOD! (+5 pts)';
      status = 'correct';
    }

    setFeedback({ status, message: `${msg}\nAccuracy: ${Math.floor(accuracy * 100)}%` });
    setTimeout(() => onComplete(points), 2500);
  };

  if (missionType === 'LOADING') return <div className="mission-container">Loading Mission...</div>;

  return (
    <div className="mission-container glass-card popIn">
      {feedback ? (
        <div className={`mission-feedback ${feedback.status}`}>
          {feedback.message.split('\n').map((line, i) => <div key={i}>{line}</div>)}
        </div>
      ) : (
        <>
          {missionType === 'VOCAB' && vocabData && (
            <div className="vocab-mission">
              <h3 className="mission-title">📝 Vocab Quiz!</h3>
              <div className="vocab-word">What does <span>"{vocabData.word}"</span> mean?</div>
              <div className="vocab-choices">
                {vocabData.choices.map((choice, i) => (
                  <button key={i} className="choice-btn shadow-pop" onClick={() => handleVocabAnswer(choice)}>
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          )}

          {missionType === 'SPEAKING' && (
            <div className="speaking-mission">
              <h3 className="mission-title hot">🎤 SPEAKING CHALLENGE!</h3>
              <p className="mission-desc">Read the English text out loud!</p>
              <div className="target-text">"{card.card_a.text}"</div>
              
              {isListening ? (
                <div className="listening-indicator">
                  <div className="wave"></div><div className="wave"></div><div className="wave"></div>
                  <p>Listening...</p>
                </div>
              ) : (
                <button className="speak-btn shadow-pop" onClick={startSpeaking}>
                  🎙️ Tap to Speak
                </button>
              )}
              {speechResult && <div className="speech-result">You said: "{speechResult}"</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}