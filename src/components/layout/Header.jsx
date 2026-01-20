import { useAuth } from '../../contexts/AuthContext';
import { Menu, LogOut } from 'lucide-react';

export default function Header({ title, onMenuClick }) {
    const { userProfile, isAdmin, logout } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
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
