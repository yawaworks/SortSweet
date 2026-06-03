import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import AuthPage from './AuthPage';
import BrainDumpInput from './BrainDumpInput';
import ForumFeed from './ForumFeed';
import PostDetailSidebar from './PostDetailSidebar';
import DraftsManager from './DraftsManager';
import ProfileDashboard from './ProfileDashboard';
import './App.css';

export default function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('sortsweet-user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem('sortsweet-items');
    return saved ? JSON.parse(saved) : [];
  });

  const [drafts, setDrafts] = useState(() => {
    const savedDrafts = localStorage.getItem('sortsweet-drafts');
    return savedDrafts ? JSON.parse(savedDrafts) : [];
  });

  const [activePostId, setActivePostId] = useState(null);
  const [activeDraft, setActiveDraft] = useState(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  // Feed controls
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest | oldest | category
  const [filterCategory, setFilterCategory] = useState('all'); // all | now | delegate | someday
  const [viewMode, setViewMode] = useState('list'); // list | gallery

  useEffect(() => {
    localStorage.setItem('sortsweet-items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('sortsweet-drafts', JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchOrCreateProfile(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) fetchOrCreateProfile(session.user);
      else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('sortsweet-user');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchOrCreateProfile = async (authUser) => {
    try {
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', authUser.id).single();
      let userData;
      if (profile) {
        userData = { username: profile.username, email: authUser.email, bio: profile.bio || '', avatar: profile.avatar_url || '' };
      } else {
        userData = {
          username: authUser.user_metadata?.username || authUser.email.split('@')[0],
          email: authUser.email, bio: authUser.user_metadata?.bio || '', avatar: authUser.user_metadata?.avatar || ''
        };
      }
      setUser(userData);
      localStorage.setItem('sortsweet-user', JSON.stringify(userData));
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('sortsweet-user');
    setActivePostId(null);
  };

  const handleAddItem = (content, category, imageUrl) => {
    const newItem = {
      id: crypto.randomUUID(),
      text: content,
      category,
      image: imageUrl || null,
      authorName: user?.username || user?.displayName || 'Original Poster',
      authorAvatar: user?.avatar || user?.avatarUrl || '',
      timestamp: new Date().toLocaleString([], {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
      createdAt: Date.now(),
      comments: []
    };
    setItems(prev => [newItem, ...prev]);
    setShowCreatePanel(false);
    if (activeDraft) {
      setDrafts(prev => prev.filter(d => d.id !== activeDraft.id));
      setActiveDraft(null);
    }
  };

  const handleSaveDraft = (draftObject) => {
    setDrafts(prev => {
      const exists = prev.find(d => d.id === draftObject.id);
      return exists ? prev.map(d => d.id === draftObject.id ? draftObject : d) : [draftObject, ...prev];
    });
    setShowCreatePanel(false);
  };

  const handleLoadDraft = (draft) => { setActiveDraft(draft); setShowDraftsModal(false); setShowCreatePanel(true); };
  const handleDeleteDraft = (draftId) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId));
    if (activeDraft?.id === draftId) setActiveDraft(null);
  };

  const handleMoveItem = (id, newCategory) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, category: newCategory } : item));

  const handleUpdateItem = (id, updatedFields) =>
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updatedFields } : item));

  const handleDeleteItem = (id) => {
    if (activePostId === id) setActivePostId(null);
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddComment = (postId, commentText, authorName, authorAvatar) => {
    setItems(prev => prev.map(item => {
      if (item.id !== postId) return item;
      return {
        ...item,
        comments: [...(item.comments || []), {
          id: crypto.randomUUID(), text: commentText, author: authorName,
          authorAvatar: authorAvatar || '',
          timestamp: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        }]
      };
    }));
  };

  const handleDeleteComment = (postId, commentId) =>
    setItems(prev => prev.map(item =>
      item.id !== postId ? item : { ...item, comments: (item.comments || []).filter(c => c.id !== commentId) }
    ));

  const handleUpdateUserProfile = (updatedUserObj) => {
    setUser(updatedUserObj);
    localStorage.setItem('sortsweet-user', JSON.stringify(updatedUserObj));
  };

  // Filtered + sorted items
  const displayedItems = useMemo(() => {
    let result = [...items];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => {
        const el = document.createElement('div');
        el.innerHTML = item.text || '';
        return (el.textContent || '').toLowerCase().includes(q);
      });
    }
    if (filterCategory !== 'all') result = result.filter(i => i.category === filterCategory);
    if (sortBy === 'newest') result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (sortBy === 'oldest') result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    else if (sortBy === 'category') result.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    else if (sortBy === 'comments') result.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    return result;
  }, [items, searchQuery, filterCategory, sortBy]);

  if (!user) return <AuthPage onAuthSuccess={(u) => setUser(u)} />;
  const activePost = items.find(item => item.id === activePostId);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-wrapper-flex">
          <div className="header-left">
            <h1>Sort<span className="highlight">Sweet</span></h1>
            <p>Welcome back, <span className="highlight">{user.username}</span>!</p>
          </div>
          <div className="header-right-action-bay">
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowProfileModal(true)}>⚙️ Settings</button>
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowDraftsModal(true)}>📋 Drafts ({drafts.length})</button>
            <button onClick={handleLogout} className="control-btn logout-header-btn">Logout</button>
          </div>
        </div>
      </header>

      {/* ── Collapsed search/create bar ── */}
      {!showCreatePanel && (
        <div className="search-create-bar">
          <span className="search-icon-inline">🔍</span>
          <input
            className="search-bar-input"
            placeholder="Search or create a post..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="new-post-btn" onClick={() => setShowCreatePanel(true)}>
            💬 New Post
          </button>
        </div>
      )}

      {/* ── Expanded create panel ── */}
      {showCreatePanel && (
        <BrainDumpInput
          onAddItem={handleAddItem}
          drafts={drafts}
          onSaveDraft={handleSaveDraft}
          activeDraft={activeDraft}
          onClearActiveDraft={() => { setActiveDraft(null); setShowCreatePanel(false); }}
          currentUser={user}
          onCancel={() => setShowCreatePanel(false)}
        />
      )}

      {/* ── Sort & View controls ── */}
      <div className="feed-controls-bar">
        <div className="sort-view-group">
          <span className="controls-label">⇅ Sort & View</span>
          <select className="feed-control-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="category">By category</option>
            <option value="comments">Most comments</option>
          </select>
          <select className="feed-control-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="all">All tags</option>
            <option value="now">Now</option>
            <option value="delegate">Delegate</option>
            <option value="someday">Someday</option>
          </select>
        </div>
        <div className="view-toggle-group">
          <button
            className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >☰</button>
          <button
            className={`view-toggle-btn ${viewMode === 'gallery' ? 'active' : ''}`}
            onClick={() => setViewMode('gallery')}
            title="Gallery view"
          >⊞</button>
        </div>
      </div>

      <div className={`workspace-layout ${activePost ? 'split-view' : ''}`}>
        <div className="feed-pane">
          <ForumFeed
            items={displayedItems}
            activePostId={activePostId}
            onSelectPost={setActivePostId}
            onMoveItem={handleMoveItem}
            onDeleteItem={handleDeleteItem}
            onUpdateItem={handleUpdateItem}
            viewMode={viewMode}
            sidebarOpen={!!activePost}
          />
        </div>

        {activePost && (
          <PostDetailSidebar
            item={activePost}
            onClose={() => setActivePostId(null)}
            onAddComment={handleAddComment}
            onDeletePost={handleDeleteItem}
            onDeleteComment={handleDeleteComment}
            onUpdateItem={handleUpdateItem}
            currentUser={user}
          />
        )}
      </div>

      {showDraftsModal && (
        <DraftsManager
          drafts={drafts}
          onLoadDraft={handleLoadDraft}
          onDeleteDraft={handleDeleteDraft}
          onClose={() => setShowDraftsModal(false)}
        />
      )}

      {showProfileModal && (
        <ProfileDashboard
          user={user}
          onUpdateUser={handleUpdateUserProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}