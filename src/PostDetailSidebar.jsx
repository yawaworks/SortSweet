import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './JournalEditor.css';

export default function PostDetailSidebar({ 
  item, 
  onClose, 
  onDeletePost, 
  onUpdateItem,
  onAddComment,
  onDeleteComment,
  currentUser 
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [commentText, setCommentText] = useState('');
  const menuRef = useRef(null);

  const currentUserName = currentUser?.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const currentUserAvatar = currentUser?.avatar || currentUser?.avatarUrl || null;
  const isOp = !item.authorName || item.authorName === currentUserName || item.authorName === 'Original Poster';

  useEffect(() => {
    if (item) {
      setEditTitle(getPlainTitleText(item.text) || '');
      const el = document.createElement('div');
      el.innerHTML = getBodyHtmlContent(item.text);
      setEditBody((el.textContent || '').trim());
    }
  }, [item]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!item) return null;

  const getPlainTitleText = (htmlString) => {
    if (!htmlString) return '';
    const el = document.createElement('div');
    el.innerHTML = htmlString;
    const titleEl = el.querySelector('.post-compiled-title');
    if (titleEl) return titleEl.textContent || '';
    const heading = el.querySelector('h1, h2, h3');
    return heading ? heading.textContent || '' : '';
  };

  const getBodyHtmlContent = (htmlString) => {
    if (!htmlString) return '';
    const el = document.createElement('div');
    el.innerHTML = htmlString;
    const bodyEl = el.querySelector('.post-compiled-body');
    return bodyEl ? bodyEl.innerHTML : htmlString;
  };

  const plainTextLabel = getPlainTitleText(item.text);
  const bodyContentHtml = getBodyHtmlContent(item.text);

  const formattedTimestamp = React.useMemo(() => {
    return item.timestamp || new Date().toLocaleString([], {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.timestamp]);

  const handleSaveEdit = () => {
    if (!editTitle.trim() && !editBody.trim()) return;
    const rebuilt = `
      <div class="journal-post-compiled">
        <h2 class="post-compiled-title">${editTitle.trim() || 'Untitled Entry'}</h2>
        <div class="post-compiled-body rich-text-display-pane"><p>${editBody.trim()}</p></div>
      </div>
    `;
    onUpdateItem(item.id, { text: rebuilt });
    setIsEditing(false);
  };

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    if (typeof onAddComment === 'function') {
      onAddComment(item.id, commentText, currentUserName, currentUserAvatar);
    }
    setCommentText('');
  };

  const authorName = item.authorName || currentUserName;
  const authorAvatar = item.authorAvatar || currentUserAvatar;
  const authorHandle = '@' + authorName.toLowerCase().replace(/\s+/g, '_');

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      className="post-detail-sidebar-container"
    >
      {/* ── Top bar: post name light + close/menu ── */}
      <div className="sidebar-upper-control-panel">
        <span className="sidebar-topbar-post-name">{plainTextLabel || 'Untitled Entry'}</span>

        <div className="sidebar-action-menu-wrapper" ref={menuRef}>
          <button type="button" className="sidebar-three-dots-btn" onClick={() => setShowMenu(!showMenu)} title="Options">
            •••
          </button>

          {showMenu && (
            <div className="sidebar-dropdown-menu">
              {isOp && (
                <>
                  <button type="button" onClick={() => { setIsEditing(true); setShowMenu(false); }}>Edit Post</button>
                  <button type="button" className="menu-delete-action" onClick={() => {
                    if (window.confirm("Delete this entry permanently?")) { onDeletePost(item.id); onClose(); }
                  }}>Delete Post</button>
                </>
              )}
              <button type="button" onClick={() => { alert("Following thread..."); setShowMenu(false); }}>Follow Thread</button>
              <button type="button" onClick={() => { alert("Link copied!"); setShowMenu(false); }}>Share</button>
            </div>
          )}

          <button className="sidebar-close-panel-btn" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="sidebar-scrollable-body-content">

        {/* Big post title */}
        {isEditing ? (
          <div className="sidebar-edit-mode-container">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="sidebar-edit-title-input"
              placeholder="Post title..."
            />
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="sidebar-edit-textarea"
              placeholder="Post body..."
              rows={5}
            />
            <div className="sidebar-edit-actions">
              <button type="button" className="edit-cancel" onClick={() => setIsEditing(false)}>Cancel</button>
              <button type="button" className="edit-save" onClick={handleSaveEdit}>Save</button>
            </div>
          </div>
        ) : (
          <h1 className="sidebar-main-compiled-headline">{plainTextLabel || 'Untitled Entry'}</h1>
        )}

        {/* Timestamp below title */}
        <div className="sidebar-realtime-timestamp-row">{formattedTimestamp}</div>

        {/* Divider */}
        <div className="sidebar-divider" />

        {/* Author row with OP badge */}
        <div className="sidebar-author-op-profile-row">
          <div className="sidebar-author-avatar-circle">
            {authorAvatar
              ? <img src={authorAvatar} alt={authorName} />
              : <div className="sidebar-avatar-fallback">{authorName.charAt(0).toUpperCase()}</div>
            }
          </div>
          <div className="sidebar-author-identity-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="sidebar-author-display-name">{authorName}</span>
              {isOp && <span className="sidebar-op-badge">OP</span>}
            </div>
            <span className="sidebar-author-handle-sub">{authorHandle} · {formattedTimestamp}</span>
          </div>
        </div>

        {/* Body content */}
        {!isEditing && (
          <div className="sidebar-compiled-html-body-view rich-text-display-pane">
            <div dangerouslySetInnerHTML={{ __html: bodyContentHtml }} />
            {item.image && (
              <img src={item.image} alt="Attachment" className="sidebar-body-embedded-media" />
            )}
          </div>
        )}

        {/* Divider before comments */}
        <div className="sidebar-divider" style={{ marginTop: 20 }} />

        {/* Comments section */}
        <div className="sidebar-comments-section">
          <p className="sidebar-comments-count">{(item.comments || []).length} comment{(item.comments || []).length !== 1 ? 's' : ''}</p>

          <AnimatePresence>
            {(item.comments || []).map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="sidebar-comment-item"
              >
                <div className="sidebar-author-avatar-circle sidebar-comment-avatar">
                  {comment.authorAvatar
                    ? <img src={comment.authorAvatar} alt={comment.author} />
                    : <div className="sidebar-avatar-fallback">{(comment.author || 'U').charAt(0).toUpperCase()}</div>
                  }
                </div>
                <div className="sidebar-comment-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="sidebar-author-display-name" style={{ fontSize: 13 }}>{comment.author || 'User'}</span>
                    {(comment.author === authorName || !comment.author) && (
                      <span className="sidebar-op-badge">OP</span>
                    )}
                    <span className="sidebar-author-handle-sub" style={{ marginLeft: 'auto' }}>{comment.timestamp}</span>
                    {typeof onDeleteComment === 'function' && (
                      <button
                        className="sidebar-comment-delete-btn"
                        onClick={() => onDeleteComment(item.id, comment.id)}
                        title="Delete comment"
                      >✕</button>
                    )}
                  </div>
                  <p className="sidebar-comment-text">{comment.text}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Comment input pinned to bottom ── */}
      <div className="sidebar-comment-form-wrapper">
        <div className="sidebar-comment-form">
          <div className="sidebar-author-avatar-circle" style={{ width: 32, height: 32, flexShrink: 0 }}>
            {currentUserAvatar
              ? <img src={currentUserAvatar} alt={currentUserName} />
              : <div className="sidebar-avatar-fallback">{currentUserName.charAt(0).toUpperCase()}</div>
            }
          </div>
          <input
            type="text"
            className="comment-input-bar"
            placeholder={`Reply as ${currentUserName}…`}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
          />
          <button
            type="button"
            className="submit-post-btn"
            style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={handlePostComment}
            disabled={!commentText.trim()}
          >Post</button>
        </div>
      </div>
    </motion.aside>
  );
}