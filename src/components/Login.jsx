import { useState, useRef } from 'react';
import { login, register } from '../api/api.js';
import { setCookie } from '../utils/cookie.js';
import { useAdwEvent } from '../adw.js';

export default function Login({ onLogin, onClose }) {
    const [mode, setMode] = useState('login'); // login | register
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const usernameRef = useRef(null);
    const passwordRef = useRef(null);
    const emailRef = useRef(null);
    const rememberRef = useRef(null);
    const modeTabsRef = useRef(null);

    const handleSubmit = async () => {
        if (loading) return;

        if (!username || !password) {
            setError('请填写用户名和密码');
            return;
        }
        if (mode === 'register' && !email) {
            setError('注册需要填写邮箱');
            return;
        }

        setLoading(true);
        setError('');
        setNotice('');
        try {
            if (mode === 'register') {
                const data = await register(username, password, email);
                setNotice(data.message || '注册成功，请登录');
                setMode('login');
            } else {
                const data = await login(username, password);
                if (rememberMe) {
                    setCookie('user_token', data.token, 7);
                }
                onLogin(data.token);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useAdwEvent(usernameRef, 'changed', (e) => setUsername(e.detail?.text ?? ''));
    useAdwEvent(passwordRef, 'changed', (e) => setPassword(e.detail?.text ?? ''));
    useAdwEvent(emailRef, 'changed', (e) => setEmail(e.detail?.text ?? ''));
    useAdwEvent(usernameRef, 'entry-activated', handleSubmit);
    useAdwEvent(passwordRef, 'entry-activated', handleSubmit);
    useAdwEvent(rememberRef, 'notify::checked', (e) => setRememberMe(Boolean(e.detail?.checked)));
    useAdwEvent(modeTabsRef, 'notify::active', (e) => {
        const idx = Number(e.detail?.active ?? 0);
        setMode(idx === 1 ? 'register' : 'login');
        setError('');
        setNotice('');
    });

    return (
        <div className="login-wrapper">
            <adw-clamp maximum-size="400">
                <div className="login-card">
                    {onClose && (
                        <div className="login-close-row">
                            <gtk-button flat icon="window-close" tooltip="稍后再登录" onClick={onClose}></gtk-button>
                        </div>
                    )}
                    <div className="login-header">
                        <h1>轻昼 系统登录</h1>
                        <p>请输入您的用户名和密码</p>
                    </div>

                    {error && (
                        <adw-banner title={error} revealed style={{ marginBottom: '16px' }}></adw-banner>
                    )}
                    {notice && (
                        <adw-banner title={notice} revealed style={{ marginBottom: '16px' }}></adw-banner>
                    )}

                    <div className="login-mode-tabs">
                        <adw-toggle-group ref={modeTabsRef} active="0">
                            <adw-toggle label="登录"></adw-toggle>
                            <adw-toggle label="注册"></adw-toggle>
                        </adw-toggle-group>
                    </div>

                    <adw-preferences-group>
                        <adw-entry-row
                            ref={usernameRef}
                            title="用户名"
                            editable={!loading}
                        ></adw-entry-row>
                        <adw-password-entry-row
                            ref={passwordRef}
                            title="密码"
                            editable={!loading}
                        ></adw-password-entry-row>
                        {mode === 'register' && (
                            <adw-entry-row
                                ref={emailRef}
                                title="邮箱"
                                editable={!loading}
                            ></adw-entry-row>
                        )}
                        {mode === 'login' && (
                            <adw-action-row title="记住登录状态">
                                <gtk-check-button slot="suffix" ref={rememberRef} checked={rememberMe}></gtk-check-button>
                            </adw-action-row>
                        )}
                    </adw-preferences-group>

                    <div className="login-actions">
                        <gtk-button suggested pill class="login-button" label={mode === 'register' ? '注册' : '登录'} disabled={loading} onClick={handleSubmit}></gtk-button>
                        {loading && (
                            <div className="login-loading">
                                <adw-spinner></adw-spinner>
                                <span>{mode === 'register' ? '正在注册，请稍候...' : '正在登录，请稍候...'}</span>
                            </div>
                        )}
                    </div>
                </div>
            </adw-clamp>
        </div>
    );
}
