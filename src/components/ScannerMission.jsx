import { useEffect, useRef, useState } from 'react';
import { getVocabQuestion, speechAccuracy, speechPoints } from '../gameLogic';

export default function ScannerMission({ card, themeData, onComplete }) {
  const [phase, setPhase] = useState('ENTRY');
  const [mission] = useState(() => {
    const supportsSpeech = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    const vocab = getVocabQuestion(card, themeData);
    if (supportsSpeech && Math.random() < 0.5) return { type: 'SPEAKING' };
    if (vocab) return { type: 'VOCAB', vocab };
    return { type: supportsSpeech ? 'SPEAKING' : 'MANUAL' };
  });
  const [isListening, setIsListening] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [feedback, setFeedback] = useState(null);

  const recognitionRef = useRef(null);
  const liveTextRef = useRef('');
  const pendingEvaluationRef = useRef(false);
  const decisionLockedRef = useRef(false);
  const timersRef = useRef(new Set());

  useEffect(() => {
    const sound = new Audio('/correct.mp3');
    sound.play().catch(() => {});
    const timer = window.setTimeout(() => setPhase('MISSION'), 2000);
    const timers = timersRef.current;
    return () => {
      window.clearTimeout(timer);
      timers.forEach(id => window.clearTimeout(id));
      timers.clear();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const scheduleCompletion = (points, delay) => {
    if (decisionLockedRef.current) return;
    decisionLockedRef.current = true;
    const timer = window.setTimeout(() => onComplete(points), delay);
    timersRef.current.add(timer);
  };

  const handleVocabAnswer = selected => {
    if (decisionLockedRef.current || feedback) return;
    const isCorrect = selected === mission.vocab.correct;
    const points = isCorrect ? 3 : 1;
    setFeedback({
      status: isCorrect ? 'correct' : 'incorrect',
      message: isCorrect ? '✅ CORRECT! (+3 pts)' : '❌ MISS... (+1 pt)'
    });
    scheduleCompletion(points, 2000);
  };

  const evaluateSpeech = spokenText => {
    if (decisionLockedRef.current) return;
    const accuracy = speechAccuracy(card.card_a.text, spokenText);
    const points = speechPoints(accuracy);
    const status = points >= 5 ? 'correct' : 'incorrect';
    const message = !spokenText.trim()
      ? '💦 音声が聞き取れませんでした\nスコア: 1 / 10 点'
      : (points === 10 ? '👑 EXCELLENT!!' : points === 5 ? '👍 GOOD!' : '💦 TRY HARDER') +
        '\nスコア: ' + points + ' / 10 点\n(単語一致率: ' + Math.floor(accuracy * 100) + '%)';
    setFeedback({ status, message });
    scheduleCompletion(points, 3000);
  };

  const finishPendingSpeech = () => {
    if (!pendingEvaluationRef.current) return;
    pendingEvaluationRef.current = false;
    setIsEvaluating(false);
    evaluateSpeech(liveTextRef.current);
  };

  const startSpeaking = () => {
    if (decisionLockedRef.current || isListening) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError('このブラウザでは音声認識を利用できません。');
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    pendingEvaluationRef.current = false;
    setIsEvaluating(false);
    liveTextRef.current = '';
    setLiveText('');
    setSpeechError('');
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0]?.transcript ?? '').join(' ');
      liveTextRef.current = transcript;
      setLiveText(transcript);
    };
    recognition.onerror = event => {
      setIsListening(false);
      if (!pendingEvaluationRef.current) setSpeechError('音声認識が中断されました (' + event.error + ')。再度お試しください。');
    };
    recognition.onend = () => {
      setIsListening(false);
      finishPendingSpeech();
    };
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError('マイクを開始できませんでした。権限を確認してください。');
    }
  };

  const stopSpeaking = () => {
    if (!recognitionRef.current || pendingEvaluationRef.current || decisionLockedRef.current) return;
    pendingEvaluationRef.current = true;
    setIsEvaluating(true);
    setIsListening(false);
    try {
      recognitionRef.current.stop();
    } catch {
      finishPendingSpeech();
    }
    // Safari can omit onend after a manual stop; keep the mission recoverable.
    const timer = window.setTimeout(finishPendingSpeech, 1800);
    timersRef.current.add(timer);
  };

  if (phase === 'ENTRY') {
    return <div className="scan-entry-overlay">
      <div className="entry-icon">✅</div>
      <h2>CORRECT!</h2>
      <p>Mission Start...</p>
    </div>;
  }

  return <div className="mission-fullscreen-container">
    {feedback ? (
      <div className={'mission-feedback-fullscreen ' + feedback.status}>
        <div className="feedback-content-card">
          {feedback.message.split('\n').map((line, i) => (
            <div key={i} className={i === 0 ? 'fb-main-msg' : 'fb-sub-msg'}>{line}</div>
          ))}
        </div>
      </div>
    ) : (
      <div className="mission-content-wrapper">
        {mission.type === 'VOCAB' && (
          <div className="fullscreen-vocab-layout">
            <header className="mission-header"><span className="badge">📝 Vocabulary Challenge</span></header>
            <main className="mission-body">
              <div className="vocab-question-box">
                <p className="q-instruction">意味を選んでください</p>
                <h1 className="target-word-huge">{mission.vocab.word}</h1>
              </div>
              <div className="vocab-choices-grid-large">
                {mission.vocab.choices.map((choice, i) => (
                  <button key={choice} disabled={feedback !== null}
                    className={'large-choice-btn choice-style-' + (i + 1)}
                    onClick={() => handleVocabAnswer(choice)}>
                    <span className="choice-text">{choice}</span><div className="btn-stitch"></div>
                  </button>
                ))}
              </div>
            </main>
          </div>
        )}
        {mission.type === 'SPEAKING' && (
          <div className="fullscreen-speaking-layout">
            <header className="mission-header"><span className="badge hot">🎤 Speaking Challenge</span></header>
            <main className="mission-body">
              <div className="speaking-target-card">
                <p className="q-instruction">英文を声に出して読んでください</p>
                <h1 className="target-text-huge">{card.card_a.text}</h1>
              </div>
              <div className="speaking-control-area">
                {isListening ? (
                  <div className="recording-fullscreen-ui">
                    <div className="status-row"><span className="pulse-dot"></span> 録音中...</div>
                    <div className="live-text-display">{liveText || 'Listening...'}</div>
                    <button className="giant-stop-btn shadow-pop" onClick={stopSpeaking}>🛑 終了して判定</button>
                  </div>
                ) : (
                  <button className="giant-start-btn shadow-pop"
                    disabled={isEvaluating || feedback !== null}
                    onClick={startSpeaking}>{isEvaluating ? '判定中...' : '🎙️ タップして開始'}</button>
                )}
                {speechError && (
                  <div role="alert" className="speaking-fallback">
                    <p>{speechError}</p>
                    <button className="btn-save" onClick={() => {
                      if (decisionLockedRef.current) return;
                      setFeedback({ status: 'correct', message: '手動音読を完了しました (+1 pt)' });
                      scheduleCompletion(1, 1500);
                    }}>
                      マイクなしで音読完了 (+1点)
                    </button>
                  </div>
                )}
              </div>
            </main>
          </div>
        )}
        {mission.type === 'MANUAL' && (
          <div className="fullscreen-speaking-layout">
            <header className="mission-header"><span className="badge">📖 Reading Challenge</span></header>
            <main className="mission-body">
              <div className="speaking-target-card">
                <p className="q-instruction">このカードの英文を声に出して読んでください</p>
                <h1 className="target-text-huge">{card.card_a.text}</h1>
              </div>
              <button className="giant-start-btn shadow-pop"
                onClick={() => { setFeedback({ status: 'correct', message: '練習完了 (+1 pt)' }); scheduleCompletion(1, 1500); }}>
                読み終わったら進む (+1)
              </button>
            </main>
          </div>
        )}
      </div>
    )}
  </div>;
}
