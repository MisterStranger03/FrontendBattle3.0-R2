import { memo } from 'react';

export default memo(function PausePlayBtn({ paused, queueSize, onPause, onPlay }) {
  return (
    <div className="pause-play">
      {paused ? (
        <>
          <span className="queue-badge">{queueSize} queued</span>
          <button className="btn btn--play" onClick={onPlay}>
            <span className="btn-icon">▶</span> RESUME
          </button>
        </>
      ) : (
        <button className="btn btn--pause" onClick={onPause}>
          <span className="btn-icon">⏸</span> PAUSE
        </button>
      )}
    </div>
  );
});
