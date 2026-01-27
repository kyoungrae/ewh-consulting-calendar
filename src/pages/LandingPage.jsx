import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#00462A] text-white p-8">
            <div className="w-full max-w-6xl flex flex-col items-center animate-fade-in">

                {/* 1. Header Section */}
                <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-24 text-center" style={{ margin: "0px 0px 30px 0px" }}>
                    진로·취업 컨설팅 일정표
                </h1>

                <div className="flex flex-col md:flex-row gap-8 justify-center items-center mb-24 w-full" style={{ margin: "40px 0px 40px 0px" }}>
                    <button
                        onClick={() => navigate('/login?role=admin')}
                        className="w-full md:w-80 h-40 border-2 border-white/40 rounded-3xl bg-white/5 hover:bg-white hover:text-[#00462A] hover:-translate-y-2 transition-all duration-300 flex flex-col items-center justify-center group shadow-xl cursor-pointer"
                    >
                        <span className="text-2xl font-bold transition-colors duration-300">
                            전체 일정
                        </span>
                        <span className="text-base text-white/50 group-hover:text-[#00462A]/60 font-medium transition-colors duration-300 mt-1">
                            (Admin)
                        </span>
                    </button>

                    <button
                        onClick={() => navigate('/login?role=consultant')}
                        className="w-full md:w-80 h-40 border-2 border-white/40 rounded-3xl bg-white/5 hover:bg-white hover:text-[#00462A] hover:-translate-y-2 transition-all duration-300 flex flex-col items-center justify-center group shadow-xl cursor-pointer"
                    >
                        <span className="text-2xl font-bold transition-colors duration-300">
                            컨설턴트별 일정
                        </span>
                    </button>
                </div>

                {/* 3. Footer Section */}
                <footer className="text-center opacity-30 mt-8">
                    <p className="text-base font-semibold tracking-[0.3em] uppercase mb-2">Ewha Womans University</p>
                    <p className="text-sm">인재개발원</p>
                </footer>

            </div>
        </div >
    );
}
