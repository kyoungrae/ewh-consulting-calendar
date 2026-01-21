import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUsers } from '../../hooks/useFirestore';
import { Loader2, ArrowLeft, User, Home } from 'lucide-react';

export default function ConsultantSelectionPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const mode = searchParams.get('mode');
    const { users, loading } = useUsers();

    // 역할이 'consultant'인 유저만 필터링 및 이름순 정렬
    const consultants = users
        .filter(user => user.role === 'consultant')
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[#00462A]" />
                    <p className="text-gray-500 font-medium">컨설턴트 목록을 불러오는 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f8faf9] flex flex-col items-center">

            <main className="flex-1 max-w-7xl mx-auto px-4 md:px-8 pb-20 w-full flex flex-col items-center">
                {/* Title Section - Green bar now perfectly matches text width */}
                <div className="flex flex-col items-center mt-12" style={{ marginBottom: '30px', marginTop: '40px' }}>
                    <div className="w-fit">
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight mb-3">
                            컨설턴트 선택
                        </h1>
                        <div className="w-full h-1.5 bg-[#00462A] rounded-full mb-4"></div>
                    </div>
                    <p className="text-gray-500 font-medium text-sm md:text-base">
                        {mode === 'admin' ? '일정을 확인할 컨설턴트를 선택해 주세요.' : '본인의 이름을 선택하여 로그인을 진행해 주세요.'}
                    </p>
                </div>

                {/* Grid Area - Corrected spacing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8 justify-items-center w-full max-w-6xl">
                    {consultants.map((consultant) => (
                        <button
                            key={consultant.id}
                            onClick={() => {
                                if (mode === 'admin') {
                                    navigate(`/calendar?consultantId=${consultant.uid}`);
                                } else {
                                    navigate(`/login?userId=${encodeURIComponent(consultant.userId || consultant.email)}&name=${encodeURIComponent(consultant.name)}`);
                                }
                            }}
                            className="bg-white border border-gray-100 rounded-2xl text-center shadow-sm hover:shadow-xl hover:border-[#00462A]/30 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden w-full flex flex-col items-center justify-center cursor-pointer"
                            style={{ height: '100px' }}
                        >
                            <div className="relative z-10">
                                <h3 className="text-lg md:text-xl font-bold text-gray-800 group-hover:text-[#00462A] transition-colors leading-tight">
                                    {consultant.name}{!consultant.name.endsWith('T') && 'T'}
                                </h3>
                                <p className="text-xs text-gray-400 font-medium mt-1">컨설턴트</p>
                            </div>

                            {/* Hover Bottom Bar */}
                            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#00462A] transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center" />
                        </button>
                    ))}

                    {consultants.length === 0 && (
                        <div className="col-span-full py-40 flex flex-col items-center justify-center w-full">
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-gray-100">
                                <User size={40} className="text-gray-200" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800">등록된 컨설턴트가 없습니다</h3>
                            <p className="text-gray-500 text-sm mt-2">관리자에게 문의하여 계정을 등록해 주세요.</p>
                        </div>
                    )}
                </div>

                {/* Home Button - Pushed further down for better balance */}
                <div className="mt-12 animate-fade-in flex justify-center w-full" style={{ marginTop: '140px' }}>
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2.5 text-sm font-medium text-gray-500 hover:text-[#00462A] transition-all duration-300 group px-6 py-2.5 rounded-full hover:bg-[#00462A]/5 cursor-pointer"
                    >
                        <Home size={20} className="group-hover:-translate-y-0.5 transition-transform" />
                        <span>홈으로 돌아가기</span>
                    </button>
                </div>
            </main>

            {/* Footer Branding */}
            <footer className="w-full max-w-7xl mx-auto px-8 py-12 opacity-30 text-center">
                <p className="text-xs font-bold tracking-widest text-gray-600 uppercase border-t border-gray-200 pt-8">
                    Ewha Womans University · Career Development Center
                </p>
            </footer>
        </div>
    );
}
