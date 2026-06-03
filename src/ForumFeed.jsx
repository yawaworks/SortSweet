import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ForumFeed({ items, activePostId, onSelectPost, onMoveItem, onDeleteItem, onUpdateItem }) {
  return (
    <div className="forum-feed">
      <AnimatePresence mode="popLayout">
        {items.map(item => (
          <ForumPost 
            key={item.id} 
            item={item} 
            isActive={item.id === activePostId}
            onSelect={() => onSelectPost(item.id)}
            onMoveItem={onMoveItem} 
            onDeleteItem={onDeleteItem}
            onUpdateItem={onUpdateItem}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ForumPost({ item, isActive, onSelect, onMoveItem, onDeleteItem, onUpdateItem }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  const handleSave = (e) => {
    e.stopPropagation();
    if (editText.trim()) {
      onUpdateItem(item.id, { text: editText });
      setIsEditing(false);
    }
  };

  const tagLabels = {
    now: 'Now',
    delegate: 'Delegate',
    someday: 'Later'
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 600, damping: 50 }}
      className={`item-card ${isActive ? 'active-row' : ''}`}
      onClick={onSelect}
    >
      <div className="post-main-content">
        <div className="post-title-row">
          <span className={`tag-pill active-${item.category}`}>{tagLabels[item.category]}</span>
          
          {isEditing ? (
            <input 
              type="text"
              value={editText} 
              onChange={(e) => setEditText(e.target.value)}
              className="sidebar-edit-textarea"
              onKeyDown={(e) => e.key === 'Enter' && handleSave(e)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <div 
              className="rich-text-display-pane"
              dangerouslySetInnerHTML={{ __html: item.text }} 
            />
          )}
        </div>
        
        <div className="post-meta">
          <span>{item.comments ? item.comments.length : 0} comments</span>
        </div>
      </div>

      <div className="post-right-aside" onClick={(e) => e.stopPropagation()}>
        {item.image && (
          <img src={item.image} alt="Uploaded Attachment" className="post-thumbnail" />
        )}

        <div className="post-controls">
          <select 
            value={item.category} 
            onChange={(e) => onMoveItem(item.id, e.target.value)}
            className="tag-pill"
          >
            <option value="now">Now</option>
            <option value="delegate">Delegate</option>
            <option value="someday">Later</option>
          </select>

          <button className="draft-save-btn" onClick={(e) => {
            e.stopPropagation();
            if (isEditing) handleSave(e); else setIsEditing(true);
          }}>
            {isEditing ? "Save" : "Edit"}
          </button>
          
          <button className="text-cancel-btn" onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}>✕</button>
        </div>
      </div>
    </motion.div>
  );
}