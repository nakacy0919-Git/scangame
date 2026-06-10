import React from 'react';

export default function SettingsModal({
  teamCount, setTeamCount,
  bgmVolume, setBgmVolume,
  selectedMinutes, setSelectedMinutes,
  onClose, setActiveQrTab
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '550px' }}>
        <h3 style={{ fontSize: '2rem', marginBottom: '20px', color: '#2c3e50' }}>Game Settings</h3>
        
        {/* チーム数の設定（ここを新しくオシャレなボタンに書き換えました！） */}
        <div className="settings-group" style={{ marginBottom: '40px' }}>
          <label style={{ display: 'block', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '15px', color: '#7f8c8d' }}>
            Number of Teams
          </label>
          
          {/* ボタンを3つ綺麗に並べるグリッド */}
          <div className="count-selector-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            {[2, 3, 4].map(count => (
              <button 
                key={count} 
                onClick={() => { setTeamCount(count); setActiveQrTab('A'); }} 
                className={`count-card-btn team-count-${count} ${teamCount === count ? 'active' : ''}`}
              >
                {/* 画像がなくても可愛く見えるように、人数分の絵文字を表示 */}
                <div className="team-icon-group" style={{ fontSize: '2.5rem', marginBottom: '10px' }}>
                  {count === 2 ? '👫' : count === 3 ? '👫🧍' : '👫👫'}
                </div>
                <div className="team-count-text">{count} Teams</div>
              </button>
            ))}
          </div>
          <p className="selected-status">Currently selected: <strong>{teamCount} Teams</strong></p>
        </div>

        {/* BGM音量の設定 */}
        <div className="slider-group" style={{ marginBottom: '30px' }}>
          <label>BGM Volume: <strong>{Math.round(bgmVolume * 100)}%</strong></label>
          <input type="range" min="0" max="1" step="0.05" value={bgmVolume} onChange={e => setBgmVolume(Number(e.target.value))} />
        </div>

        {/* 制限時間の設定 */}
        <div className="slider-group">
          <label>Time Limit: <strong>{selectedMinutes}</strong> min</label>
          <input type="range" min="3" max="15" value={selectedMinutes} onChange={e => setSelectedMinutes(Number(e.target.value))} />
        </div>
        
        <button className="btn-save" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}