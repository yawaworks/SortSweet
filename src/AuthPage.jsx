import React, { useState, useEffect, useRef } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase } from './supabaseClient';

export default function AuthPage({ onAuthSuccess }) {
  const [view, setView] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [captchaToken, setCaptchaToken] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null); // null | true | false
  const [checkingUsername, setCheckingUsername] = useState(false);
  
  const captchaRef = useRef(null);
  const usernameCheckTimer = useRef(null);

  useEffect(() => {
    const checkSessionAndHash = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { onAuthSuccess(session.user); return; }
      if (window.location.hash && window.location.hash.includes('access_token=')) {
        const { data, error: hashError } = await supabase.auth.getUser();
        if (!hashError && data?.user) onAuthSuccess(data.user);
        else if (hashError) setError("Session verification failed: " + hashError.message);
      }
    };
    checkSessionAndHash();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') setView('reset-password');
      else if (event === 'SIGNED_IN' && session) onAuthSuccess(session.user);
    });
    return () => subscription.unsubscribe();
  }, [onAuthSuccess]);

  const handleViewChange = (newView) => {
    setView(newView); setError(''); setMessage('');
    setCaptchaToken(null); setUsernameAvailable(null);
    if (captchaRef.current) captchaRef.current.resetCaptcha();
  };

  // Debounced username availability check
  const handleUsernameChange = (val) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    setUsernameAvailable(null);
    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    if (cleaned.length < 3) return;
    setCheckingUsername(true);
    usernameCheckTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles').select('id').eq('username', cleaned).maybeSingle();
      setUsernameAvailable(!data);
      setCheckingUsername(false);
    }, 500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    if ((view === 'login' || view === 'register') && !captchaToken) {
      setError("Please complete the Captcha puzzle first!"); return;
    }
    if (view === 'register') {
      if (!nickname.trim()) { setError("Please enter a nickname."); return; }
      if (username.length < 3) { setError("Username must be at least 3 characters."); return; }
      if (usernameAvailable === false) { setError("That username is already taken. Pick another."); return; }
    }
    setLoading(true);
    try {
      if (view === 'login') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email, password, options: { captchaToken }
        });
        if (signInError) {
          if (signInError.message.toLowerCase().includes('email not confirmed'))
            throw new Error("Your email hasn't been verified yet! Check your spam folder.");
          throw signInError;
        }
        if (data?.user) onAuthSuccess(data.user);

      } else if (view === 'register') {
        // Final duplicate check before inserting
        const { data: existingUser } = await supabase
          .from('profiles').select('id').eq('username', username).maybeSingle();
        if (existingUser) { throw new Error("That username was just taken! Please choose another."); }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email, password,
          options: {
            captchaToken,
            emailRedirectTo: window.location.origin,
            data: { nickname: nickname.trim(), username }
          },
        });
        if (signUpError) throw signUpError;

        // Create profile row immediately
        if (data?.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username,
            nickname: nickname.trim(),
            bio: '',
            avatar_url: '',
            is_public: true,
          }, { onConflict: 'id' });
        }
        setMessage("Account created! Please check your email inbox to verify.");
        handleViewChange('login');

      } else if (view === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setMessage("Recovery link dispatched! Inspect your email inbox.");

      } else if (view === 'reset-password') {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage("Password successfully updated!");
        handleViewChange('login');
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
      if (captchaRef.current) captchaRef.current.resetCaptcha();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: '100%', padding: '0.85rem', border: '1px solid #E0D9D4', borderRadius: '8px', background: '#F5F2EE', color: '#3E4342', outline: 'none', fontSize: '1rem', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#3E4342', marginBottom: '0.4rem' };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F5F2EE', fontFamily: 'system-ui' }}>
      <div style={{ background: 'white', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 8px 24px rgba(74,62,61,0.05)', width: '100%', maxWidth: '420px', textAlign: 'center', border: '1px solid #E0D9D4' }}>
        <h2 style={{ color: '#3E4342', marginBottom: '0.5rem', fontSize: '1.75rem', fontWeight: 800 }}>
          {view === 'login' ? 'Welcome Back' : view === 'register' ? 'Create Space' : view === 'forgot' ? 'Recover Account' : 'New Password'}
        </h2>
        <p style={{ color: '#767970', marginBottom: '2rem', fontSize: '0.95rem' }}>
          {view === 'login' ? 'Step into your stream of thought' : view === 'register' ? 'Begin mapping out your day-to-day dump' : view === 'forgot' ? 'Enter your email to receive a reset token' : 'Set a strong password for your profile'}
        </p>

        {error && <div style={{ background: '#EDEAE5', color: '#ADAE8B', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'left', border: '1px solid #E0D9D4', fontWeight: 500 }}>{error}</div>}
        {message && <div style={{ background: '#EDEAE5', color: '#848571', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'left', border: '1px solid #E0D9D4', fontWeight: 500 }}>{message}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {view !== 'reset-password' && (
            <div style={{ textAlign: 'left' }}>
              <label style={labelStyle}>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@example.com" />
            </div>
          )}

          {view === 'register' && (
            <>
              <div style={{ textAlign: 'left' }}>
                <label style={labelStyle}>Nickname <span style={{ color: '#aaa', fontWeight: 400 }}>(display name)</span></label>
                <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} required style={inputStyle} placeholder="e.g. Yashraj" maxLength={40} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <label style={labelStyle}>Username <span style={{ color: '#aaa', fontWeight: 400 }}>(unique handle)</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={username}
                    onChange={e => handleUsernameChange(e.target.value)}
                    required
                    style={{ ...inputStyle, paddingRight: '2.5rem' }}
                    placeholder="e.g. yashraj_99"
                    maxLength={30}
                  />
                  <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem' }}>
                    {checkingUsername ? '⏳' : usernameAvailable === true ? '✅' : usernameAvailable === false ? '❌' : ''}
                  </span>
                </div>
                {username.length > 0 && username.length < 3 && <p style={{ fontSize: '0.75rem', color: '#ADAE8B', margin: '4px 0 0', textAlign: 'left' }}>At least 3 characters required</p>}
                {usernameAvailable === false && <p style={{ fontSize: '0.75rem', color: '#ADAE8B', margin: '4px 0 0', textAlign: 'left' }}>Username taken</p>}
                {usernameAvailable === true && <p style={{ fontSize: '0.75rem', color: '#848571', margin: '4px 0 0', textAlign: 'left' }}>Username available!</p>}
              </div>
            </>
          )}

          {view !== 'forgot' && (
            <div style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3E4342' }}>Password</label>
                {view === 'login' && (
                  <button type="button" onClick={() => handleViewChange('forgot')} style={{ background: 'none', border: 'none', color: '#ADAE8B', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Forgot?</button>
                )}
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} placeholder="••••••••" />
            </div>
          )}

          {(view === 'register' || view === 'login') && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}>
              <HCaptcha sitekey="25e6eb70-ad04-4aca-89de-71a0630ea790" onVerify={token => setCaptchaToken(token)} onExpire={() => setCaptchaToken(null)} ref={captchaRef} />
            </div>
          )}

          <button type="submit" disabled={loading} style={{ width: '100%', padding: '1rem', background: '#ADAE8B', color: '#F5F2EE', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem', transition: 'background 0.2s' }}>
            {loading ? 'Processing...' : view === 'login' ? 'Log In' : view === 'register' ? 'Register Account' : view === 'forgot' ? 'Send Recovery Link' : 'Update Password'}
          </button>
        </form>

        <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#767970' }}>
          {view === 'login' && (<>Don't have an account? <button onClick={() => handleViewChange('register')} style={{ background: 'none', border: 'none', color: '#ADAE8B', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Register here</button></>)}
          {view === 'register' && (<>Already initialized? <button onClick={() => handleViewChange('login')} style={{ background: 'none', border: 'none', color: '#ADAE8B', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Log In</button></>)}
          {view === 'forgot' && (<button onClick={() => handleViewChange('login')} style={{ background: 'none', border: 'none', color: '#ADAE8B', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Back to Log In</button>)}
        </div>
      </div>
    </div>
  );
}