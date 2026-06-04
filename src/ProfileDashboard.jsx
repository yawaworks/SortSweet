import React, { useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import './JournalEditor.css';

export default function ProfileDashboard({ user, onUpdateUser, onClose }) {
  const [nickname, setNickname] = useState(user?.nickname || user?.username || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [email] = useState(user?.email || '');
  const [isPublic, setIsPublic] = useState(user?.isPublic !== false); // default true

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const fileInputRef = useRef(null);
  const usernameCheckTimer = useRef(null);

  const handleUsernameChange = (val) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    setUsernameAvailable(null);
    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    if (cleaned === user?.username) { setUsernameAvailable(true); return; }
    if (cleaned.length < 3) return;
    setCheckingUsername(true);
    usernameCheckTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles').select('id').eq('username', cleaned).maybeSingle();
      setUsernameAvailable(!data);
      setCheckingUsername(false);
    }, 500);
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarUrl(URL.createObjectURL(file));
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `profile_pics/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(publicUrl);
      setStatusMessage({ text: 'Profile picture updated! ✨', type: 'success' });
    } catch (err) {
      setStatusMessage({ text: err.message || 'Upload failed.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    if (username.length < 3) { setStatusMessage({ text: 'Username must be at least 3 characters.', type: 'error' }); return; }
    if (usernameAvailable === false) { setStatusMessage({ text: 'That username is already taken.', type: 'error' }); return; }

    setIsSaving(true);
    setStatusMessage({ text: '', type: '' });
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) throw new Error('Session expired. Please log out and back in.');

      // Check duplicate username (if changed)
      if (username !== user?.username) {
        const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
        if (existing) throw new Error('That username is already taken. Choose another.');
      }

      const { data, error } = await supabase.from('profiles')
        .upsert({ id: authUser.id, username, nickname: nickname.trim(), bio: bio.trim(), avatar_url: avatarUrl, is_public: isPublic }, { onConflict: 'id' })
        .select().single();
      if (error) throw error;

      const updatedUser = {
        ...user,
        username: data.username,
        nickname: data.nickname || data.username,
        displayName: data.nickname || data.username,
        bio: data.bio,
        avatar: data.avatar_url || avatarUrl,
        avatarUrl: data.avatar_url || avatarUrl,
        isPublic: data.is_public,
      };
      onUpdateUser(updatedUser);
      setStatusMessage({ text: 'Changes saved successfully! ✨', type: 'success' });
    } catch (err) {
      setStatusMessage({ text: err.message || 'Failed to save. Please try again.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-dashboard-overlay">
      <div className="profile-dashboard-card">
        <div className="profile-dashboard-header">
          <h2>Edit profile</h2>
          <p className="profile-subtitle-caption">Keep your personal details private. Information you add here is visible to anyone who can view your profile.</p>
          <button className="control-icon-btn" type="button" onClick={onClose} title="Close">✕</button>
        </div>

        {statusMessage.text && (
          <div className={`profile-status-banner ${statusMessage.type}`}>{statusMessage.text}</div>
        )}

        <form onSubmit={handleProfileSave} className="profile-dashboard-form">
          <div className="profile-photo-section-label">Photo</div>
          <div className="profile-avatar-showcase-row">
            <div className="profile-avatar-large-preview">
              {avatarUrl
                ? <img src={avatarUrl} alt="Avatar" className="avatar-preview-image-element" />
                : <div style={{ width: '100%', height: '100%', background: '#e1e8ed' }} />
              }
            </div>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarFileChange} disabled={isUploading} />
            <button type="button" className="custom-file-upload-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
              {isUploading ? 'Uploading...' : 'Change'}
            </button>
          </div>

          <div className="profile-form-group">
            <label htmlFor="dashboard-nickname">Nickname <span style={{ color: '#999', fontWeight: 400 }}>(display name)</span></label>
            <input id="dashboard-nickname" type="text" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={40} required placeholder="How you appear to others" />
          </div>

          <div className="profile-form-group">
            <label htmlFor="dashboard-username">Username <span style={{ color: '#999', fontWeight: 400 }}>(unique handle)</span></label>
            <div style={{ position: 'relative' }}>
              <input
                id="dashboard-username"
                type="text"
                value={username}
                onChange={e => handleUsernameChange(e.target.value)}
                maxLength={30}
                required
                placeholder="your_handle"
                style={{ paddingRight: '2rem' }}
              />
              <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem' }}>
                {checkingUsername ? '⏳' : usernameAvailable === true ? '✅' : usernameAvailable === false ? '❌' : ''}
              </span>
            </div>
            {usernameAvailable === false && <p style={{ fontSize: '12px', color: '#ff6b6b', margin: '4px 0 0' }}>Username taken</p>}
          </div>

          <div className="profile-form-group">
            <label htmlFor="dashboard-bio">Bio</label>
            <textarea id="dashboard-bio" value={bio} onChange={e => setBio(e.target.value)} placeholder="Add a short bio..." maxLength={160} rows={2} className="profile-bio-textarea" />
          </div>

          <div className="profile-form-group">
            <label htmlFor="dashboard-email">Email address</label>
            <input id="dashboard-email" type="email" value={email} disabled />
          </div>

          {/* Account visibility */}
          <div className="profile-form-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsPublic(v => !v)}>
            <div>
              <label style={{ cursor: 'pointer' }}>Account visibility</label>
              <p style={{ fontSize: '13px', color: '#666', margin: '2px 0 0', fontWeight: 400 }}>
                {isPublic ? '🌐 Public — anyone can see your profile and entries' : '🔒 Private — only you see your entries'}
              </p>
            </div>
            <div className={`profile-toggle-switch ${isPublic ? 'on' : 'off'}`}>
              <div className="profile-toggle-knob" />
            </div>
          </div>

          <div className="profile-dashboard-footer">
            <button type="button" className="minimal-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="minimal-save-btn" disabled={isSaving || isUploading}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}