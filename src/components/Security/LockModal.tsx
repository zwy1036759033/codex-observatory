import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '../../context/DashboardContext';

const LockDialog: React.FC = () => {
  const { closeLockModal, unlockWithPasscode } = useDashboard();
  const [passcode, setPasscode] = useState('');
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;

    const ok = unlockWithPasscode(passcode);
    if (ok) {
      setMsg({ text: '已解锁', type: 'ok' });
      setTimeout(() => {
        closeLockModal();
      }, 400);
    } else {
      setMsg({ text: '密码不正确，请重试', type: 'err' });
      setIsShaking(true);
      inputRef.current?.select();
      setTimeout(() => setIsShaking(false), 300);
    }
  };

  return (
    <div className="lock-modal-mask" id="lockModal" role="dialog" aria-modal="true" aria-labelledby="lockModalTitle">
      <div className={`lock-modal ${isShaking ? 'shake' : ''}`}>
        <div className="lock-modal-hdr">
          <div className="lock-badge">🔒 已启用锁屏</div>
          <span className="lock-code">CODEX / 屏幕守护</span>
        </div>
        <div className="lock-modal-body">
          <h3 id="lockModalTitle">输入密码，返回工作界面</h3>
          <p>
            当前处于锁屏模式。输入你在控制台中设置的密码，即可恢复操作。
          </p>

          <form onSubmit={handleSubmit}>
            <div className="lock-input-row">
              <input
                ref={inputRef}
                type="password"
                id="lockPassInput"
                placeholder="请输入解锁密码"
                aria-label="解锁密码"
                maxLength={20}
                autoComplete="off"
                value={passcode}
                onChange={e => setPasscode(e.target.value)}
              />
              <button type="submit" className="btn" id="lockSubmitBtn">
                解锁
              </button>
            </div>
            {msg && (
              <div className={`lock-msg ${msg.type}`} id="lockMsg">
                {msg.text}
              </div>
            )}
            <div className="lock-hint">
              使用你在“锁屏与安全”中设置的密码。
            </div>
          </form>
        </div>
        <div className="lock-modal-ftr">
          <div>
            <span className="lock-status-dot"></span>
            <span>锁屏中 · 需要密码</span>
          </div>
          <button type="button" className="btn-sm" id="lockDismissBtn" onClick={closeLockModal}>
            暂时收起
          </button>
        </div>
      </div>
    </div>
  );
};

export const LockModal: React.FC = () => {
  const { isLockModalOpen, isLocked, mode } = useDashboard();
  if (!isLockModalOpen || !isLocked || mode !== 'lock') return null;
  return <LockDialog key="lock-dialog-open" />;
};
