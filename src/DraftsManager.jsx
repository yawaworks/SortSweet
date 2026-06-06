import React from 'react';

export default function DraftsManager({ drafts, onLoadDraft, onDeleteDraft, onClose }) {
  return (
    <div className="drafts-modal-overlay">
      <div className="drafts-modal-card">
        <div className="drafts-modal-header">
          <h3>Your Saved Drafts ({drafts.length})</h3>
          <button className="close-modal-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="drafts-modal-list">
          {drafts.length === 0 ? (
            <p className="no-drafts-text">No saved drafts found. Your thoughts are currently empty!</p>
          ) : (
            drafts.map((draft) => (
              <div key={draft.id} className="draft-item-row">
                <div className="draft-item-info">
                  <h4>{draft.title || <span className="untitled-text">(Untitled Thoughts)</span>}</h4>
                  <p>{draft.bodyHtml
                    ? (() => { const el = document.createElement('div'); el.innerHTML = draft.bodyHtml; return (el.textContent || '').slice(0, 60) + '...'; })()
                    : 'No body text...'}</p>
                  <span className="draft-timestamp">Saved: {draft.savedAt}</span>
                </div>
                <div className="draft-item-actions">
                  <button className="load-draft-btn" onClick={() => onLoadDraft(draft)}>
                    Edit
                  </button>
                  <button className="delete-draft-btn" onClick={() => onDeleteDraft(draft.id)}>
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}