import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';

export default function MainLayout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { isAdmin } = useAuth();

    const openSidebar = () => setIsSidebarOpen(true);
    const closeSidebar = () => setIsSidebarOpen(false);

    return (
        <div className="flex min-h-screen bg-gray-50">
            {isAdmin && <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />}
            <main className={`main-content ${!isAdmin ? '!ml-0 w-full' : ''}`}>
                <Outlet context={{ openSidebar }} />
            </main>
        </div>
    );
}
