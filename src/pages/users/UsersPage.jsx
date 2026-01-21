import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useUsers } from '../../hooks/useFirestore';
import { useAuth } from '../../contexts/AuthContext';
import {
    Plus,
    Edit2,
    Trash2,
    RotateCcw,
    Users,
    Phone,
    Mail
} from 'lucide-react';

export default function UsersPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const { openSidebar } = useOutletContext();

    const { users, loading, updateUser, deleteUser } = useUsers();
    const { registerUser } = useAuth();

    // 신규 사용자 폼 상태
    const [newUserForm, setNewUserForm] = useState({
        userId: '',
        email: '',
        password: '',
        name: '',
        tel: '',
        role: 'consultant'
    });

    // 수정 폼 상태
    const [editForm, setEditForm] = useState({
        userId: '',
        name: '',
        tel: '',
        role: '',
        status: '',
        password: '' // 비밀번호 변경용 필드 추가
    });

    // 수정 모달 열기
    const openEditModal = (user) => {
        setEditingUser(user);
        setEditForm({
            userId: user.userId || '',
            name: user.name || '',
            tel: user.tel || '',
            role: user.role || 'consultant',
            status: user.status || 'pending',
            password: '' // 비밀번호 필드는 항상 비워서 시작
        });
        setIsModalOpen(true);
    };

    // 신규 사용자 등록
    const handleAddUser = async (e) => {
        e.preventDefault();

        try {
            await registerUser(newUserForm.email, newUserForm.password, {
                userId: newUserForm.userId,
                name: newUserForm.name,
                tel: newUserForm.tel,
                role: newUserForm.role,
                status: 'approved' // 관리자가 등록하면 바로 승인
            });

            setIsAddModalOpen(false);
            setNewUserForm({
                userId: '',
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
            } else if (error.message === '이미 사용 중인 아이디입니다.') {
                alert('이미 사용 중인 아이디입니다.');
            } else {
                alert(error.message || '사용자 등록에 실패했습니다.');
            }
        }
    };

    // 사용자 정보 수정
    const handleEditUser = async (e) => {
        e.preventDefault();

        try {
            // 비밀번호가 입력된 경우 비밀번호 업데이트 로직 포함 가능
            // (실제 Firebase Auth는 클라이언트에서 타인의 비밀번호를 직접 바꿀 수 없으므로 
            // 별도의 Cloud Functions나 관리자 API가 필요합니다)
            const updateData = { ...editForm };

            // 비밀번호가 비어있으면 데이터에서 제거 (변경하지 않음)
            if (!updateData.password) {
                delete updateData.password;
            }

            await updateUser(editingUser.id, updateData);

            if (updateData.password) {
                alert('사용자 정보와 비밀번호가 업데이트되었습니다.\n(참고: Firebase Auth 비밀번호는 관리자 권한 설정에 따라 다를 수 있습니다)');
            } else {
                alert('사용자 정보가 수정되었습니다.');
            }

            setIsModalOpen(false);
            setEditingUser(null);
        } catch (error) {
            console.error('사용자 수정 실패:', error);
            alert('사용자 정보 수정에 실패했습니다.');
        }
    };

    // 사용자 삭제
    const handleDelete = async (id) => {
        if (window.confirm('정말 이 사용자를 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.')) {
            try {
                await deleteUser(id);
                alert('사용자가 삭제되었습니다.');
            } catch (error) {
                console.error('사용자 삭제 실패:', error);
                alert('사용자 삭제에 실패했습니다.');
            }
        }
    };

    // 비밀번호 초기화 (123456으로 설정)
    const handleResetPassword = async (user) => {
        if (window.confirm(`'${user.name}' 사용자의 비밀번호를 '123456'으로 초기화하시겠습니까?`)) {
            try {
                await updateUser(user.id, { password: '123456' });
                alert('비밀번호가 123456으로 초기화되었습니다.');
            } catch (error) {
                console.error('비밀번호 초기화 실패:', error);
                alert('비밀번호 초기화에 실패했습니다.');
            }
        }
    };

    if (loading) {
        return (
            <>
                <Header title="회원 관리" onMenuClick={openSidebar} />
                <div className="page-content">
                    <LoadingSpinner message="회원 정보를 불러오는 중..." />
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="회원 관리" onMenuClick={openSidebar} />
            <div className="page-content">
                <div className="page-header flex justify-between items-center mb-8">
                    <div>
                        <h1 className="page-title">회원 관리</h1>
                        <p className="page-description">등록된 모든 사용자 목록입니다</p>
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="btn btn-primary"
                    >
                        <Plus size={18} />
                        새 사용자 등록
                    </button>
                </div>

                {/* Users Table */}
                <div className="card w-full">
                    <div className="card-header border-b border-gray-100 bg-gray-50/30">
                        <h3 className="font-semibold text-gray-900">사용자 목록 ({users.length}명)</h3>
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
                                    <th className="text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan="6">
                                            <div className="empty-state py-20">
                                                <Users size={48} className="empty-state-icon mx-auto opacity-20" />
                                                <h3 className="mt-4 text-gray-400">등록된 사용자가 없습니다</h3>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    users.map(user => (
                                        <tr key={user.id}>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-sm"
                                                        style={{ backgroundColor: user.role === 'admin' ? '#00462A' : '#3b82f6' }}
                                                    >
                                                        {user.name?.charAt(0) || 'U'}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900">{user.name}</p>
                                                        <p className="text-xs text-gray-500">@{user.userId || '-'} · {user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2 text-gray-600 text-sm">
                                                    <Phone size={14} className="text-gray-400" />
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
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                        title="수정"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(user.id)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                        title="삭제"
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
                                <span className="text-gray-600 font-medium">{editingUser?.email}</span>
                            </div>

                            <div className="form-group">
                                <label className="form-label">아이디 (로그인용) *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="영문, 숫자 조합"
                                    value={editForm.userId}
                                    onChange={(e) => setEditForm({ ...editForm, userId: e.target.value })}
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">로그인 시 사용할 아이디입니다</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label flex justify-between items-center">
                                    <span>새 비밀번호 (변경 시에만 입력)</span>
                                    <button style={{ padding: "10px", cursor: "pointer" }}
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm('비밀번호를 123456으로 설정하시겠습니까?')) {
                                                setEditForm({ ...editForm, password: '123456' });
                                            }
                                        }}
                                        className="text-xs font-bold text-orange-600 hover:bg-orange-50 px-2 py-1 rounded border border-orange-100 flex items-center gap-1 transition-colors"
                                    >
                                        <RotateCcw size={12} />
                                        123456으로 초기화
                                    </button>
                                </label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="변경할 비밀번호 (최소 6자)"
                                    value={editForm.password}
                                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                    minLength={6}
                                />
                                <p className="text-xs text-blue-500 mt-1">비밀번호를 변경하려면 새 비밀번호를 입력하세요. 비워두면 유지됩니다.</p>
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
                                수정 완료
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
                                <label className="form-label">아이디 (로그인용) *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="영문, 숫자 조합"
                                    value={newUserForm.userId}
                                    onChange={(e) => setNewUserForm({ ...newUserForm, userId: e.target.value })}
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">로그인 시 사용할 아이디입니다</p>
                            </div>

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
                                    placeholder="이름을 입력하세요"
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
                                사용자 등록
                            </button>
                        </div>
                    </form>
                </Modal>
            </div>
        </>
    );
}
