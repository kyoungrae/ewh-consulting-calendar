import { useState } from 'react';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useUsers } from '../../hooks/useFirestore';
import { useAuth } from '../../contexts/AuthContext';
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    Users,
    UserCheck,
    UserX,
    Shield,
    Phone,
    Mail
} from 'lucide-react';

export default function UsersPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const { users, loading, updateUser, deleteUser } = useUsers();
    const { registerUser } = useAuth();

    // 신규 사용자 폼 상태
    const [newUserForm, setNewUserForm] = useState({
        email: '',
        password: '',
        name: '',
        tel: '',
        role: 'consultant'
    });

    // 수정 폼 상태
    const [editForm, setEditForm] = useState({
        name: '',
        tel: '',
        role: '',
        status: ''
    });

    // 검색 및 필터링
    const filteredUsers = users.filter(user => {
        const matchSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchRole = !filterRole || user.role === filterRole;
        const matchStatus = !filterStatus || user.status === filterStatus;
        return matchSearch && matchRole && matchStatus;
    });

    // 통계
    const stats = {
        total: users.length,
        admin: users.filter(u => u.role === 'admin').length,
        consultant: users.filter(u => u.role === 'consultant').length,
        pending: users.filter(u => u.status === 'pending').length
    };

    // 수정 모달 열기
    const openEditModal = (user) => {
        setEditingUser(user);
        setEditForm({
            name: user.name || '',
            tel: user.tel || '',
            role: user.role || 'consultant',
            status: user.status || 'pending'
        });
        setIsModalOpen(true);
    };

    // 신규 사용자 등록
    const handleAddUser = async (e) => {
        e.preventDefault();

        try {
            await registerUser(newUserForm.email, newUserForm.password, {
                name: newUserForm.name,
                tel: newUserForm.tel,
                role: newUserForm.role,
                status: 'approved' // 관리자가 등록하면 바로 승인
            });

            setIsAddModalOpen(false);
            setNewUserForm({
                email: '',
                password: '',
                name: '',
                tel: '',
                role: 'consultant'
            });
            alert('사용자가 등록되었습니다.');
        } catch (error) {
            console.error('사용자 등록 실패:', error);
            if (error.code === 'auth/email-already-in-use') {
                alert('이미 사용 중인 이메일입니다.');
            } else {
                alert('사용자 등록에 실패했습니다.');
            }
        }
    };

    // 사용자 정보 수정
    const handleEditUser = async (e) => {
        e.preventDefault();

        try {
            await updateUser(editingUser.id, editForm);
            setIsModalOpen(false);
            setEditingUser(null);
        } catch (error) {
            console.error('사용자 수정 실패:', error);
            alert('사용자 정보 수정에 실패했습니다.');
        }
    };

    // 사용자 삭제
    const handleDelete = async (id) => {
        if (window.confirm('정말 이 사용자를 삭제하시겠습니까?\n(Firebase Authentication에서는 별도로 삭제해야 합니다)')) {
            try {
                await deleteUser(id);
            } catch (error) {
                console.error('사용자 삭제 실패:', error);
                alert('사용자 삭제에 실패했습니다.');
            }
        }
    };

    // 사용자 승인
    const handleApprove = async (user) => {
        try {
            await updateUser(user.id, { status: 'approved' });
        } catch (error) {
            console.error('승인 실패:', error);
            alert('승인 처리에 실패했습니다.');
        }
    };

    if (loading) {
        return (
            <>
                <Header title="회원 관리" />
                <div className="page-content">
                    <LoadingSpinner message="회원 정보를 불러오는 중..." />
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="회원 관리" />
            <div className="page-content">
                <div className="page-header flex justify-between items-start">
                    <div>
                        <h1 className="page-title">회원 관리</h1>
                        <p className="page-description">컨설턴트와 관리자 계정을 관리합니다</p>
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="btn btn-primary"
                    >
                        <Plus size={18} />
                        새 사용자 등록
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon green">
                            <Users size={24} />
                        </div>
                        <div className="stat-info">
                            <h3>전체 사용자</h3>
                            <p>{stats.total}</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon blue">
                            <Shield size={24} />
                        </div>
                        <div className="stat-info">
                            <h3>관리자</h3>
                            <p>{stats.admin}</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon purple">
                            <UserCheck size={24} />
                        </div>
                        <div className="stat-info">
                            <h3>컨설턴트</h3>
                            <p>{stats.consultant}</p>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon orange">
                            <UserX size={24} />
                        </div>
                        <div className="stat-info">
                            <h3>승인 대기</h3>
                            <p>{stats.pending}</p>
                        </div>
                    </div>
                </div>

                {/* Search & Filter */}
                <div className="card mb-6">
                    <div className="card-body">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex-1 min-w-[200px]">
                                <div className="relative">
                                    <Search
                                        size={18}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                    />
                                    <input
                                        type="text"
                                        placeholder="이름 또는 이메일로 검색..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="form-input pl-10"
                                    />
                                </div>
                            </div>
                            <div className="w-40">
                                <select
                                    value={filterRole}
                                    onChange={(e) => setFilterRole(e.target.value)}
                                    className="form-select"
                                >
                                    <option value="">전체 권한</option>
                                    <option value="admin">관리자</option>
                                    <option value="consultant">컨설턴트</option>
                                </select>
                            </div>
                            <div className="w-40">
                                <select
                                    value={filterStatus}
                                    onChange={(e) => setFilterStatus(e.target.value)}
                                    className="form-select"
                                >
                                    <option value="">전체 상태</option>
                                    <option value="approved">승인됨</option>
                                    <option value="pending">대기중</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Users Table */}
                <div className="card">
                    <div className="card-header flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900">사용자 목록</h3>
                        <span className="text-sm text-gray-500">
                            총 {filteredUsers.length}명
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>사용자</th>
                                    <th>연락처</th>
                                    <th>권한</th>
                                    <th>상태</th>
                                    <th>가입일</th>
                                    <th>관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6">
                                            <div className="empty-state">
                                                <Users size={48} className="empty-state-icon mx-auto" />
                                                <h3>등록된 사용자가 없습니다</h3>
                                                <p>새 사용자를 등록해주세요</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <tr key={user.id}>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                                                        style={{ backgroundColor: user.role === 'admin' ? '#00462A' : '#3b82f6' }}
                                                    >
                                                        {user.name?.charAt(0) || 'U'}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900">{user.name}</p>
                                                        <p className="text-sm text-gray-500">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <Phone size={14} />
                                                    {user.tel || '-'}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge ${user.role === 'admin' ? 'badge-green' : 'badge-blue'}`}>
                                                    {user.role === 'admin' ? '관리자' : '컨설턴트'}
                                                </span>
                                            </td>
                                            <td>
                                                {user.status === 'approved' ? (
                                                    <span className="badge badge-green">승인됨</span>
                                                ) : (
                                                    <span className="badge badge-yellow">대기중</span>
                                                )}
                                            </td>
                                            <td className="text-gray-500 text-sm">
                                                {user.createdAt?.toDate
                                                    ? user.createdAt.toDate().toLocaleDateString('ko-KR')
                                                    : '-'}
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {user.status === 'pending' && (
                                                        <button
                                                            onClick={() => handleApprove(user)}
                                                            className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                            title="승인"
                                                        >
                                                            <UserCheck size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user.id)}
                                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Edit User Modal */}
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEditingUser(null);
                    }}
                    title="사용자 정보 수정"
                >
                    <form onSubmit={handleEditUser}>
                        <div className="space-y-4">
                            <div className="p-3 bg-gray-50 rounded-lg flex items-center gap-3">
                                <Mail size={18} className="text-gray-400" />
                                <span className="text-gray-600">{editingUser?.email}</span>
                            </div>

                            <div className="form-group">
                                <label className="form-label">이름 *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">전화번호</label>
                                <input
                                    type="tel"
                                    className="form-input"
                                    placeholder="010-0000-0000"
                                    value={editForm.tel}
                                    onChange={(e) => setEditForm({ ...editForm, tel: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">권한 *</label>
                                    <select
                                        className="form-select"
                                        value={editForm.role}
                                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                        required
                                    >
                                        <option value="consultant">컨설턴트</option>
                                        <option value="admin">관리자</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">상태 *</label>
                                    <select
                                        className="form-select"
                                        value={editForm.status}
                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                        required
                                    >
                                        <option value="pending">대기중</option>
                                        <option value="approved">승인됨</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer mt-6 -mx-6 -mb-6 px-6 py-4 bg-gray-50 rounded-b-lg">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setEditingUser(null);
                                }}
                                className="btn btn-secondary"
                            >
                                취소
                            </button>
                            <button type="submit" className="btn btn-primary">
                                수정
                            </button>
                        </div>
                    </form>
                </Modal>

                {/* Add User Modal */}
                <Modal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    title="새 사용자 등록"
                    size="lg"
                >
                    <form onSubmit={handleAddUser}>
                        <div className="space-y-4">
                            <div className="form-group">
                                <label className="form-label">이메일 *</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="user@example.com"
                                    value={newUserForm.email}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">비밀번호 *</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="최소 6자 이상"
                                    value={newUserForm.password}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                    required
                                    minLength={6}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">이름 *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="홍길동"
                                    value={newUserForm.name}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">전화번호</label>
                                <input
                                    type="tel"
                                    className="form-input"
                                    placeholder="010-0000-0000"
                                    value={newUserForm.tel}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, tel: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">권한 *</label>
                                <select
                                    className="form-select"
                                    value={newUserForm.role}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                                    required
                                >
                                    <option value="consultant">컨설턴트</option>
                                    <option value="admin">관리자</option>
                                </select>
                            </div>
                        </div>

                        <div className="modal-footer mt-6 -mx-6 -mb-6 px-6 py-4 bg-gray-50 rounded-b-lg">
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="btn btn-secondary"
                            >
                                취소
                            </button>
                            <button type="submit" className="btn btn-primary">
                                등록
                            </button>
                        </div>
                    </form>
                </Modal>
            </div>
        </>
    );
}
