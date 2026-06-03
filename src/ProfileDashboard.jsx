import React, { useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import './JournalEditor.css';

export default function ProfileDashboard({ user, onUpdateUser, onClose }) {
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [email, setEmail] = useState(user?.email || '');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
  
  const fileInputRef = useRef(null);

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const localPreviewUrl = URL.createObjectURL(file);
    setAvatarUrl(localPreviewUrl);

    setIsUploading(true);
    setStatusMessage({ text: '', type: '' });

    try {
      const fileExtension = file.name.split('.').pop();
      const uniqueFileName = `${crypto.randomUUID()}.${fileExtension}`;
      const filePath = `profile_pics/${uniqueFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      setStatusMessage({ text: 'Profile picture updated successfully! ✨', type: 'success' });
    } catch (err) {
      setStatusMessage({ text: err.message || 'Something went wrong while uploading your image.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    setIsSaving(true);
    setStatusMessage({ text: '', type: '' });

    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authUser) {
        throw new Error("Your session expired or was not found. Please log out and back in.");
      }

      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: authUser.id,
          username: username.trim(),
          bio: bio.trim(),
          avatar_url: avatarUrl
        });

      if (error) throw error;

      const updatedUser = {
        ...user,
        username: username.trim(),
        bio: bio.trim(),
        avatar: avatarUrl
      };

      setStatusMessage({ text: 'Changes saved successfully! ✨', type: 'success' });
      onUpdateUser(updatedUser);
    } catch (err) {
      setStatusMessage({ text: err.message || 'Failed to save settings. Please try again.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-dashboard-overlay">
      <div className="profile-dashboard-card">
        
        <div className="profile-dashboard-header">
          <h2>Edit profile</h2>
          <p className="profile-subtitle-caption">
            Keep your personal details private. Information you add here is visible to anyone who can view your profile.
          </p>
          <button className="control-icon-btn" type="button" onClick={onClose} title="Close Settings">✕</button>
        </div>

        {statusMessage.text && (
          <div className={`profile-status-banner ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleProfileSave} className="profile-dashboard-form">
          
          <div className="profile-photo-section-label">Photo</div>
          <div className="profile-avatar-showcase-row">
            <div className="profile-avatar-large-preview">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar Preview" className="avatar-preview-image-element" />
              ) : (
                <div style={{ width: '100%', height: '100%', background: '#e1e8ed' }} />
              )}
            </div>
            
            <input 
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleAvatarFileChange}
              disabled={isUploading}
            />
            
            <button 
              type="button" 
              className="custom-file-upload-btn" 
              onClick={triggerFileSelect}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Change'}
            </button>
          </div>

          <div className="profile-form-group">
            <label htmlFor="dashboard-username">First name</label>
            <input 
              id="dashboard-username"
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={30}
              required
            />
          </div>

          <div className="profile-form-group">
            <label htmlFor="dashboard-bio">Bio</label>
            <textarea 
              id="dashboard-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Add a short bio..."
              maxLength={160}
              rows={2}
              className="profile-bio-textarea"
            />
          </div>

          <div className="profile-form-group">
            <label htmlFor="dashboard-email">Email address</label>
            <input 
              id="dashboard-email"
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled
            />
          </div>

          <div className="profile-dashboard-footer">
            <button type="button" className="minimal-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="minimal-save-btn" disabled={isSaving || isUploading}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}