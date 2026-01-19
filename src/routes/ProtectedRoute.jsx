import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';

/**
 * 인증이 필요한 라우트 보호
 */
export function ProtectedRoute({ children }) {
    const { currentUser, userProfile } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" replace />;
    }

    // 사용자 프로필이 아직 로드되지 않은 경우
    if (!userProfile) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <LoadingSpinner message="사용자 정보를 확인하는 중..." />
            </div>
        );
    }

    // 승인되지 않은 사용자
    if (userProfile.status !== 'approved') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
                    <div
                        className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#fef3c7' }}
                    >
                        <svg
                            className="w-8 h-8 text-yellow-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">승인 대기 중</h2>
                    <p className="text-gray-600 mb-6">
                        계정이 아직 승인되지 않았습니다.<br />
                        관리자의 승인을 기다려주세요.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="btn btn-secondary"
                    >
                        다시 확인
                    </button>
                </div>
            </div>
        );
    }

    return children;
}

/**
 * 관리자 전용 라우트 보호
 */
export function AdminRoute({ children }) {
    const { userProfile } = useAuth();

    if (userProfile?.role !== 'admin') {
        return <Navigate to="/calendar" replace />;
    }

    return children;
}
