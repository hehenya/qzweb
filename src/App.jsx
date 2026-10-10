import { useState } from 'react';
import Login from './components/Login.jsx';
import MainApp from './components/MainApp.jsx';
import { getCookie } from './utils/cookie.js';

export default function App() {
  const [token, setToken] = useState(getCookie('user_token') || null);
  // 首次访问先展示登录页;关掉后可游客浏览(分区/消息/资料等只读接口服务端免鉴权)
  const [loginOpen, setLoginOpen] = useState(!token);

  const handleLogin = (newToken) => {
    setToken(newToken);
    setLoginOpen(false);
  };

  const handleLogout = () => {
    setToken(null);
    document.cookie = 'user_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
  };

  const openLogin = () => setLoginOpen(true);

  return (
    <>
      <MainApp token={token} onLogout={handleLogout} openLogin={openLogin} />
      {loginOpen && (
        <div className="login-overlay">
          <Login onLogin={handleLogin} onClose={() => setLoginOpen(false)} />
        </div>
      )}
    </>
  );
}
