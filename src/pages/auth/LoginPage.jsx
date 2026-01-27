import { useState, useEffect } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, User, Lock, AlertCircle, Loader2, Home } from 'lucide-react';

export default function LoginPage() {
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, currentUser } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const role = searchParams.get('role'); // 'consultant' or 'admin' or null
    const isConsultantLogin = role === 'consultant';

    // 초기 마운트 시 저장된 아이디 불러오기 (localStorage) - admin 모드에서만
    useEffect(() => {
        if (!isConsultantLogin) {
            const savedId = localStorage.getItem('savedUserId');
            if (savedId) {
                setUserId(savedId);
                setRememberMe(true);
            }
        }
    }, [isConsultantLogin]);

    // 이미 로그인된 경우 리다이렉트
    if (currentUser) {
        return <Navigate to="/calendar" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!userId || !password) {
            setError(isConsultantLogin ? '성명과 비밀번호를 입력해주세요.' : '아이디와 비밀번호를 입력해주세요.');
            return;
        }

        try {
            setError('');
            setLoading(true);

            // 아이디 기억하기 처리 (admin 모드에서만)
            if (!isConsultantLogin) {
                if (rememberMe) {
                    localStorage.setItem('savedUserId', userId);
                } else {
                    localStorage.removeItem('savedUserId');
                }
            }

            await login(userId, password, isConsultantLogin);
            navigate('/calendar');
        } catch (err) {
            console.error('로그인 오류:', err);
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError(isConsultantLogin ? '성명 또는 비밀번호가 올바르지 않습니다.' : '아이디 또는 비밀번호가 올바르지 않습니다.');
            } else if (err.code === 'auth/invalid-credential') {
                setError(isConsultantLogin ? '성명 또는 비밀번호가 올바르지 않습니다.' : '아이디 또는 비밀번호가 올바르지 않습니다.');
            } else {
                setError(err.message || '로그인에 실패했습니다. 다시 시도해주세요.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container flex-col p-6">
            <div className="login-card animate-fade-in">
                {/* Logo Section */}
                <div className="login-logo text-center">
                    <div className="flex justify-center mb-6">
                        <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #00462A 0%, #005c37 100%)',
                                boxShadow: '0 10px 25px -5px rgba(0, 70, 42, 0.3)'
                            }}
                        >
                            <Shield size={32} className="text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-[#00462A] tracking-tight mb-2">이화 컨설팅 일정</h1>
                    <p className="text-sm text-gray-500 mb-8">
                        {isConsultantLogin ? '컨설턴트 로그인' : '등록된 컨설턴트와 관리자만 접속할 수 있습니다'}
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div
                        className="flex items-center gap-3 p-3 mb-6 rounded-lg text-sm animate-slide-in-up"
                        style={{
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            border: '1px solid #fecaca'
                        }}
                    >
                        <AlertCircle size={18} className="flex-shrink-0" />
                        <span className="font-medium">{error}</span>
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="form-group mb-0">
                        <label className="form-label mb-1.5 ml-1">
                            {isConsultantLogin ? '성명 (한글)' : '아이디 또는 이메일'}
                        </label>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00462A] transition-colors">
                                <User size={18} />
                            </div>
                            <input
                                type="text"
                                className="form-input !pl-12 h-12"
                                placeholder={isConsultantLogin ? '성명을 입력하세요 (예: 홍길동)' : '아이디 또는 이메일을 입력하세요'}
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group mb-0">
                        <label className="form-label mb-1.5 ml-1">비밀번호</label>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00462A] transition-colors">
                                <Lock size={18} />
                            </div>
                            <input
                                type="password"
                                className="form-input !pl-12 h-12"
                                placeholder="비밀번호를 입력하세요"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    {!isConsultantLogin && (
                        <div className="flex items-center justify-between px-1" style={{ padding: '10px' }}>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-gray-300 text-[#00462A] focus:ring-[#00462A] cursor-pointer"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                />
                                <span className="text-sm text-gray-500 group-hover:text-gray-700 transition-colors">아이디 기억하기</span>
                            </label>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary w-full py-3.5 mt-4 shadow-md hover:shadow-lg transition-all text-base font-semibold"
                        disabled={loading}
                        style={{
                            backgroundColor: '#00462A'
                        }}
                    >
                        {loading ? (
                            <div className="flex items-center justify-center gap-2">
                                <Loader2 size={20} className="animate-spin" />
                                <span>로그인 중...</span>
                            </div>
                        ) : (
                            '로그인'
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-center gap-4" style={{ padding: '10px' }}>
                    <p className="text-xs text-gray-400">
                        계정이 없으신가요?{' '}
                        <span className="text-[#00462A] font-bold cursor-help hover:underline">관리자에게 문의하세요</span>
                    </p>
                </div>
            </div>

            {/* Home Button outside the card */}
            <div className="animate-fade-in flex justify-center w-full" style={{ animationDelay: '0.3s', marginTop: "30px" }}>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2.5 text-sm font-medium text-gray-500 hover:text-[#00462A] transition-all duration-300 group px-6 py-2.5 rounded-full hover:bg-[#00462A]/5 cursor-pointer"
                >
                    <Home size={20} className="group-hover:-translate-y-0.5 transition-transform" />
                    <span>홈으로 돌아가기</span>
                </button>
            </div>
        </div>
    );
}
