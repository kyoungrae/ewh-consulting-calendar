import { useState } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, Mail, Lock, AlertCircle, Loader2, Home } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, currentUser } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const prefilledEmail = searchParams.get('email');

    // prefilledEmail이 있을 경우 초기값으로 설정
    useState(() => {
        if (prefilledEmail) {
            setEmail(prefilledEmail);
        }
    }, [prefilledEmail]);

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
                    <h1 className="text-2xl font-bold text-[#00462A] tracking-tight mb-2">이화 컨설팅 관리 시스템</h1>
                    <p className="text-sm text-gray-500 mb-8">등록된 컨설턴트와 관리자만 접속할 수 있습니다</p>
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
                    {prefilledEmail ? (
                        <div className="form-group mb-0">
                            <label className="form-label mb-1.5 ml-1 text-gray-400">로그인 계정</label>
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="w-10 h-10 rounded-full bg-[#00462A]/10 flex items-center justify-center text-[#00462A]">
                                    <Mail size={20} />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <p className="text-sm font-bold text-[#333] truncate">{prefilledEmail}</p>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/select-consultant')}
                                        className="text-[11px] text-[#00462A] font-semibold hover:underline"
                                    >
                                        다른 컨설턴트 선택하기
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="form-group mb-0">
                            <label className="form-label mb-1.5 ml-1">이메일</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#00462A] transition-colors">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="email"
                                    className="form-input !pl-12 h-12"
                                    placeholder="이메일을 입력하세요"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={loading}
                                    required
                                />
                            </div>
                        </div>
                    )}

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

                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-center gap-4">
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
