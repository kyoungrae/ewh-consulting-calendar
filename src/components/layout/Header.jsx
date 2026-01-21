import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Menu, LogOut, Clock } from 'lucide-react';

export default function Header({ title, onMenuClick }) {
    const { userProfile, isAdmin, logout, remainingTime, resetTimer } = useAuth();
    const navigate = useNavigate();

    // 시간 포맷팅 (mm:ss)
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error('로그아웃 실패:', error);
        }
    };

    return (
        <header className="top-header">
            <div className="flex items-center gap-3">
                {/* Mobile menu button - Admin only */}
                {isAdmin && (
                    <button
                        onClick={onMenuClick}
                        className="mobile-menu-btn"
                        aria-label="메뉴 열기"
                    >
                        <Menu size={24} />
                    </button>
                )}
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            </div>

            <div className="flex items-center gap-4">
                {/* Session Timer */}
                {userProfile && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50/50 border border-orange-100 rounded-full text-orange-700 font-mono text-sm shadow-sm hover:bg-orange-50 transition-colors group cursor-default">
                        <Clock size={14} className="group-hover:animate-pulse" />
                        <span>{formatTime(remainingTime)}</span>
                        <button
                            onClick={resetTimer}
                            className="ml-0.5 p-0.5 hover:bg-orange-200 rounded-full transition-colors"
                            title="시간 연장"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                    </div>
                )}

                {/* User Avatar & Info */}
                <div className="flex items-center gap-3">
                    <div className="header-user-info flex flex-col items-end mr-1">
                        <p className="text-sm font-semibold text-gray-900 leading-none mb-1">{userProfile?.name}</p>
                        <p className="text-[11px] text-gray-500 leading-none">{userProfile?.email}</p>
                    </div>
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold shadow-sm"
                        style={{ backgroundColor: '#00462A' }}
                    >
                        {userProfile?.name?.charAt(0) || 'U'}
                    </div>

                    {/* Logout Button */}
                    <button
                        onClick={handleLogout}
                        className="ml-2 p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all duration-300"
                        title="로그아웃"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </div>
        </header>
    );
}
