import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, Mail, Lock, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, currentUser } = useAuth();
    const navigate = useNavigate();

    // 이미 로그인된 경우 리다이렉트
    if (currentUser) {
        return <Navigate to="/calendar" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email || !password) {
            setError('이메일과 비밀번호를 입력해주세요.');
            return;
        }

        try {
            setError('');
            setLoading(true);
            await login(email, password);
            navigate('/calendar');
        } catch (err) {
            console.error('로그인 오류:', err);
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('이메일 또는 비밀번호가 올바르지 않습니다.');
            } else if (err.code === 'auth/invalid-email') {
                setError('잘못된 이메일 형식입니다.');
            } else {
                setError(err.message || '로그인에 실패했습니다. 다시 시도해주세요.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card animate-fade-in">
                {/* Logo */}
                <div className="login-logo">
                    <div
                        className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #00462A 0%, #005c37 100%)',
                            boxShadow: '0 10px 25px -5px rgba(0, 70, 42, 0.3)'
                        }}
                    >
                        <Shield size={32} className="text-white" />
                    </div>
                    <h1>이화 컨설팅 관리 시스템</h1>
                    <p>등록된 컨설턴트와 관리자만 접속할 수 있습니다</p>
                </div>

                {/* Error Message */}
                {error && (
                    <div
                        className="flex items-center gap-2 p-3 mb-4 rounded-lg text-sm animate-slide-in-up"
                        style={{
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca'
                        }}
                    >
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">이메일</label>
                        <div className="relative">
                            <Mail
                                size={18}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="email"
                                className="form-input pl-10"
                                placeholder="이메일을 입력하세요"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">비밀번호</label>
                        <div className="relative">
                            <Lock
                                size={18}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="password"
                                className="form-input pl-10"
                                placeholder="비밀번호를 입력하세요"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary w-full mt-2"
                        disabled={loading}
                        style={{
                            padding: '0.875rem',
                            fontSize: '0.9375rem'
                        }}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle
                                        className="opacity-25"
                                        cx="12" cy="12" r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                로그인 중...
                            </span>
                        ) : (
                            '로그인'
                        )}
                    </button>
                </form>

                <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                    <p className="text-sm text-gray-500">
                        계정이 없으신가요?{' '}
                        <span className="text-green-700 font-medium">관리자에게 문의하세요</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
