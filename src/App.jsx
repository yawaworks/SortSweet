import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    localStorage.setItem('sortsweet-items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('sortsweet-drafts', JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchOrCreateProfile(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        fetchOrCreateProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('sortsweet-user');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchOrCreateProfile = async (authUser) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      let userData;
      if (profile) {
        userData = {
          username: profile.username,
          email: authUser.email,
          bio: profile.bio || '',
          avatar: profile.avatar_url || ''
        };
      } else {
        userData = {
          username: authUser.user_metadata?.username || authUser.email.split('@')[0],
          email: authUser.email,
          bio: authUser.user_metadata?.bio || '',
          avatar: authUser.user_metadata?.avatar || ''
        };
      }
      setUser(userData);
      localStorage.setItem('sortsweet-user', JSON.stringify(userData));
    } catch (err) {
      console.error(err);
    }
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
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }),
      comments: []
    };
    setItems(prev => [newItem, ...prev]);
    
    if (activeDraft) {
      setDrafts(prev => prev.filter(d => d.id !== activeDraft.id));
      setActiveDraft(null);
    }
  };

  const handleSaveDraft = (draftObject) => {
    setDrafts(prev => {
      const exists = prev.find(d => d.id === draftObject.id);
      if (exists) {
        return prev.map(d => d.id === draftObject.id ? draftObject : d);
      }
      return [draftObject, ...prev];
    });
  };

  const handleLoadDraft = (draft) => {
    setActiveDraft(draft);
    setShowDraftsModal(false);
  };

  const handleDeleteDraft = (draftId) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId));
    if (activeDraft?.id === draftId) setActiveDraft(null);
  };

  const handleMoveItem = (id, newCategory) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, category: newCategory } : item));
  };

  const handleUpdateItem = (id, updatedFields) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updatedFields } : item));
  };

  const handleDeleteItem = (id) => {
    if (activePostId === id) setActivePostId(null);
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddComment = (postId, commentText, authorName, authorAvatar) => {
    setItems(prev => prev.map(item => {
      if (item.id === postId) {
        return {
          ...item,
          comments: [
            ...(item.comments || []), 
            { 
              id: crypto.randomUUID(), 
              text: commentText, 
              author: authorName,
              authorAvatar: authorAvatar || '',
              timestamp: new Date().toLocaleString([], {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            }
          ]
        };
      }
      return item;
    }));
  };

  const handleDeleteComment = (postId, commentId) => {
    setItems(prev => prev.map(item => {
      if (item.id === postId) {
        return {
          ...item,
          comments: (item.comments || []).filter(c => c.id !== commentId)
        };
      }
      return item;
    }));
  };

  const handleUpdateUserProfile = (updatedUserObj) => {
    setUser(updatedUserObj);
    localStorage.setItem('sortsweet-user', JSON.stringify(updatedUserObj));
  };

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
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowProfileModal(true)}>
              ⚙️ Settings
            </button>
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowDraftsModal(true)}>
              📋 Drafts ({drafts.length})
            </button>
            <button onClick={handleLogout} className="control-btn logout-header-btn">
              Logout
            </button>
          </div>
        </div>
      </header>

      <BrainDumpInput 
        onAddItem={handleAddItem} 
        drafts={drafts}
        onSaveDraft={handleSaveDraft}
        activeDraft={activeDraft}
        onClearActiveDraft={() => setActiveDraft(null)}
        currentUser={user}
      />

      <div className={`workspace-layout ${activePost ? 'split-view' : ''}`}>
        <div className="feed-pane">
          <ForumFeed 
            items={items} 
            activePostId={activePostId}
            onSelectPost={setActivePostId}
            onMoveItem={handleMoveItem}
            onDeleteItem={handleDeleteItem}
            onUpdateItem={handleUpdateItem}
          />
        </div>

        {activePost && (
          <PostDetailSidebar 
            item={activePost} 
            onClose={() => setActivePostId(null)} 
            onAddComment={handleAddComment}
            onDeletePost={handleDeleteItem}
            onDeleteComment={handleDeleteComment}
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