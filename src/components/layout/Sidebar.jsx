import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    Calendar,
    CalendarPlus,
    Settings,
    Users,
    LogOut,
    Shield,
    X
} from 'lucide-react';

export default function Sidebar({ isOpen, onClose }) {
    const { userProfile, logout, isAdmin } = useAuth();
    const location = useLocation();

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('로그아웃 실패:', error);
        }
    };

    const handleNavClick = () => {
        // 모바일에서 메뉴 클릭 시 사이드바 닫기
        if (window.innerWidth <= 768) {
            onClose?.();
        }
    };

    const menuItems = [
        {
            path: '/calendar',
            icon: Calendar,
            label: '달력',
            roles: ['admin', 'consultant']
        },
        {
            path: '/schedules',
            icon: CalendarPlus,
            label: '일정 등록',
            roles: ['admin']
        },
        {
            path: '/codes',
            icon: Settings,
            label: '코드 관리',
            roles: ['admin']
        },
        {
            path: '/users',
            icon: Users,
            label: '회원 관리',
            roles: ['admin']
        }
    ];

    const filteredMenuItems = menuItems.filter(
        item => item.roles.includes(userProfile?.role)
    );

    return (
        <>
            {/* Sidebar */}
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                {/* Logo */}
                <div className="sidebar-logo">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                        >
                            <Shield size={24} />
                        </div>
                        <div className="sidebar-logo-text">
                            <h1 className="text-lg font-bold">EWH 컨설팅</h1>
                            <p className="text-xs opacity-70">관리 시스템</p>
                        </div>
                        {/* Mobile close button */}
                        <button
                            onClick={onClose}
                            className="ml-auto p-1 rounded-lg hover:bg-white/10 md:hidden"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Navigation Menu */}
                <nav className="sidebar-nav">
                    <ul className="space-y-1">
                        {filteredMenuItems.map((item) => (
                            <li key={item.path}>
                                <NavLink
                                    to={item.path}
                                    onClick={handleNavClick}
                                    className={({ isActive }) =>
                                        `sidebar-menu-item ${isActive ? 'active' : ''}`
                                    }
                                >
                                    <item.icon size={20} />
                                    <span>{item.label}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

            </aside>

            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="sidebar-overlay active"
                    onClick={onClose}
                />
            )}
        </>
    );
}
