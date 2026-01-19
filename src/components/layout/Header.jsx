import { useAuth } from '../../contexts/AuthContext';
import { Bell, Search, Menu } from 'lucide-react';

export default function Header({ title, onMenuClick }) {
    const { userProfile } = useAuth();

    return (
        <header className="top-header">
            <div className="flex items-center gap-3">
                {/* Mobile menu button */}
                <button
                    onClick={onMenuClick}
                    className="mobile-menu-btn"
                    aria-label="메뉴 열기"
                >
                    <Menu size={24} />
                </button>
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            </div>

            <div className="flex items-center gap-4">
                {/* Search (hidden on mobile) */}
                <div className="relative header-search hidden md:block">
                    <Search
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        type="text"
                        placeholder="검색..."
                        className="pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 w-64"
                    />
                </div>

                {/* Notifications */}
                <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>

                {/* User Avatar */}
                <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                    <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold header-user-avatar"
                        style={{ backgroundColor: '#00462A' }}
                    >
                        {userProfile?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="header-user-info hidden sm:block">
                        <p className="text-sm font-medium text-gray-900">{userProfile?.name}</p>
                        <p className="text-xs text-gray-500">{userProfile?.email}</p>
                    </div>
                </div>
            </div>
        </header>
    );
}
