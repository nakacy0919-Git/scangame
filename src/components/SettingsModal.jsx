export default function SettingsModal({
  teamCount, setTeamCount,
  bgmVolume, setBgmVolume,
  selectedMinutes, setSelectedMinutes,
  onClose, setActiveQrTab
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '500px' }}>
        <h3 style={{ fontSize: '2rem', marginBottom: '20px' }}>Game Settings</h3>
        
        {/* チーム数の設定 */}
        <div className="slider-group" style={{ marginBottom: '30px' }}>
          <label>Number of Teams: <strong>{teamCount}</strong></label>
          <div className="team-count-selector">
            <button className={teamCount === 2 ? 'active' : ''} onClick={() => { setTeamCount(2); setActiveQrTab('A'); }}>2 Teams</button>
            <button className={teamCount === 3 ? 'active' : ''} onClick={() => { setTeamCount(3); setActiveQrTab('A'); }}>3 Teams</button>
            <button className={teamCount === 4 ? 'active' : ''} onClick={() => { setTeamCount(4); setActiveQrTab('A'); }}>4 Teams</button>
          </div>
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