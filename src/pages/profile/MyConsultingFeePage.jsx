import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers, useCommonCodes } from '../../hooks/useFirestore';
import ConsultantFeesByTypeFields, {
    consultantFeeRowsToPayload,
    payloadToConsultingFeeRows,
    validateConsultingFeeRows
} from '../../components/users/ConsultantFeesByTypeFields';

export default function MyConsultingFeePage() {
    const { openSidebar } = useOutletContext();
    const { userProfile } = useAuth();
    const { users, loading, updateUser } = useUsers();
    const { codes } = useCommonCodes();

    const [feeRows, setFeeRows] = useState([]);
    const [saving, setSaving] = useState(false);

    const myRow = useMemo(() => {
        if (!userProfile?.uid || !users?.length) return null;
        return users.find(
            (u) => u.uid === userProfile.uid || u.userId === userProfile.userId || u.id === userProfile.uid
        );
    }, [users, userProfile]);

    const firestoreId = myRow?.id;

    useEffect(() => {
        if (!myRow) return;
        setFeeRows(payloadToConsultingFeeRows(myRow));
    }, [myRow]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!firestoreId) {
            alert('회원 정보를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }
        const v = validateConsultingFeeRows(feeRows);
        if (!v.ok) {
            alert(v.message);
            return;
        }
        setSaving(true);
        try {
            await updateUser(firestoreId, {
                consultingFeesByType: consultantFeeRowsToPayload(feeRows)
            });
            alert('유형별 강사료가 저장되었습니다.');
        } catch (err) {
            console.error(err);
            alert('저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <>
                <Header title="유형별 강사료" onMenuClick={openSidebar} />
                <div className="page-content" style={{ padding: 24 }}>
                    불러오는 중…
                </div>
            </>
        );
    }

    if (userProfile?.role !== 'consultant') {
        return (
            <>
                <Header title="유형별 강사료" onMenuClick={openSidebar} />
                <div className="page-content" style={{ padding: 24 }}>
                    컨설턴트 계정에서만 이용할 수 있습니다.
                </div>
            </>
        );
    }

    return (
        <>
            <Header title="유형별 강사료 설정" onMenuClick={openSidebar} />
            <div className="page-content" style={{ padding: 24, maxWidth: 640 }}>
                <div className="card w-full">
                    <div className="card-header border-b border-gray-100 bg-gray-50/30">
                        <h3 className="font-semibold text-gray-900">컨설팅 유형별 1회 강사료</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            코드 관리 유형 또는 「모든유형」으로 금액을 지정합니다. 특정 유형만 별도 단가가 있으면 그
                            유형만 해당 금액이 쓰이고, 나머지는 「모든유형」 금액이 적용됩니다.
                        </p>
                    </div>
                    <form onSubmit={handleSave} className="p-6 space-y-4">
                        <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                            <strong>{userProfile?.name}</strong> · @{userProfile?.userId}
                        </div>
                        {myRow?.consultingFeePerSession != null &&
                            myRow?.consultingFeePerSession !== '' &&
                            (!myRow?.consultingFeesByType || myRow.consultingFeesByType.length === 0) && (
                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                                유형별 금액을 아직 안 넣었다면, 등록되지 않은 유형 일정에는 이전에 저장된{' '}
                                <strong>구 단일 단가</strong>(
                                {Number(myRow.consultingFeePerSession).toLocaleString('ko-KR')}원)가 적용될 수
                                있습니다.
                            </div>
                        )}
                        <ConsultantFeesByTypeFields value={feeRows} onChange={setFeeRows} codes={codes} />
                        <button type="submit" className="btn btn-primary" disabled={saving || !firestoreId}>
                            {saving ? '저장 중…' : '저장'}
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}
