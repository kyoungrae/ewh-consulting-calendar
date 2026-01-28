import { useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect, useRef } from 'react';

import leaf1 from '../assets/reaf-1.png';
import leaf2 from '../assets/reaf-2.png';
import leaf3 from '../assets/reaf-3.png';
import leaf4 from '../assets/reaf-4.png';
import leaf5 from '../assets/reaf-5.png';
import leaf6 from '../assets/reaf-6.png';
import leaf7 from '../assets/reaf-7.png';

const leafImages = [leaf1, leaf2, leaf3, leaf4, leaf5, leaf6, leaf7];

export default function LandingPage() {
    const navigate = useNavigate();

    // 타겟 요소 Refs
    const titleRef = useRef(null);
    const adminBtnRef = useRef(null);
    const consultantBtnRef = useRef(null);

    // 상태 관리
    const [fallingPetals, setFallingPetals] = useState([]);
    const [landedPetals, setLandedPetals] = useState([]);

    // 벚꽃 생성 함수
    const createPetal = (id) => {
        return {
            id: id || Math.random(),
            x: Math.random() * window.innerWidth, // 시작 X
            y: -Math.random() * 500, // 시작 Y
            imageIndex: Math.floor(Math.random() * 7),
            speed: Math.random() * 0.8 + 0.2, // 낙하 속도
            swayAmplitude: Math.random() * 50 + 40, // 흔들림 폭
            swayFrequency: Math.random() * 0.05 + 0.2, // 흔들림 주기
            // JS 애니메이션을 위한 시간/각도 변수
            t: Math.random() * 100,
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            scale: Math.random() * 0.6 + 0.6,
            width: Math.random() * 15 + 20,
        };
    };

    // 초기화
    useEffect(() => {
        const initPetals = Array.from({ length: 30 }).map((_, i) => createPetal(i));
        setFallingPetals(initPetals);
    }, []);

    // 애니메이션 루프
    useEffect(() => {
        let animationFrameId;

        const updateloop = () => {
            setFallingPetals((prevPetals) => {
                const newLanded = [];

                const updatedPetals = prevPetals.map((p) => {
                    // 1. 시간 업데이트
                    const t = p.t + 0.01; // 애니메이션 진행 속도

                    // 2. 위치 및 회전 계산 (JavaScript로 제어하여 착륙 시 상태 보존)
                    // 흔들림 (Sway)
                    let newX = p.x + Math.sin(t * 0.5) * 0.5; // 미세한 좌우 이동
                    // 낙하
                    let newY = p.y + p.speed;

                    // 3D 회전 (Flutter Effect) - CSS keyframes 내용을 JS로 구현
                    let rotZ = Math.sin(t) * 20; // -20 ~ 20도
                    let rotY = Math.cos(t * 0.7) * 45; // -45 ~ 45도 (뒤집힘 방지)
                    let rotX = Math.sin(t * 0.5) * 10 + 30; // 20 ~ 40도 (기울기)

                    // 3. 충돌 체크
                    const targets = [titleRef.current, adminBtnRef.current, consultantBtnRef.current];
                    let landed = false;
                    let landY = 0;

                    if (newY > 0) {
                        for (let target of targets) {
                            if (!target) continue;
                            const rect = target.getBoundingClientRect();
                            if (
                                newY >= rect.top - 15 &&
                                newY <= rect.top + 10 &&
                                newX >= rect.left &&
                                newX <= rect.right
                            ) {
                                landed = true;
                                landY = rect.top - 5 + (Math.random() * 10 - 5);
                                break;
                            }
                        }
                    }

                    // 착륙 처리
                    if (landed) {
                        // 현재 계산된 회전각(rotX, Y, Z) 그대로 저장 -> 튀는 현상 제거
                        newLanded.push({
                            ...p,
                            x: newX,
                            y: landY,
                            id: Math.random(),
                            isLanded: true,
                            rotationX: rotX,
                            rotationY: rotY,
                            rotationZ: rotZ,
                            opacity: 1 // 착륙 시 투명도 1로 고정
                        });
                        return createPetal(p.id); // 새 꽃잎 생성
                    }

                    // 화면 밖 리셋
                    if (newY > window.innerHeight) {
                        return createPetal(p.id);
                    }

                    return {
                        ...p,
                        x: newX,
                        y: newY,
                        t: t,
                        rotationX: rotX,
                        rotationY: rotY,
                        rotationZ: rotZ
                    };
                });

                if (newLanded.length > 0) {
                    setLandedPetals(prev => [...prev, ...newLanded].slice(-100));
                }

                return updatedPetals;
            });

            animationFrameId = requestAnimationFrame(updateloop);
        };

        animationFrameId = requestAnimationFrame(updateloop);
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#00462A] text-white p-8 relative overflow-hidden">

            {/* 벚꽃 효과 컨테이너 */}
            <div className="cherry-blossom-container" style={{ pointerEvents: 'none' }}>
                {/* 떨어지는 꽃잎들 */}
                {fallingPetals.map((petal) => (
                    <img
                        key={petal.id}
                        src={leafImages[petal.imageIndex]}
                        className="cherry-blossom"
                        style={{
                            left: petal.x,
                            top: petal.y,
                            width: petal.width,
                            height: "auto",
                            opacity: 0.9,
                            // CSS 애니메이션 제거하고 JS 계산 값 적용
                            animation: 'none',
                            transform: `rotateZ(${petal.rotationZ}deg) rotateY(${petal.rotationY}deg) rotateX(${petal.rotationX}deg)`,
                        }}
                    />
                ))}

                {/* 쌓인 꽃잎들 (고정된 위치) */}
                {landedPetals.map((petal) => (
                    <img
                        key={petal.id}
                        src={leafImages[petal.imageIndex]}
                        // landed 클래스는 애니메이션 없이 고정되거나 살짝만 흔들리게 할 수 있음
                        // 여기서는 일단 회전 애니메이션은 유지하되 위치는 고정
                        className="cherry-blossom"
                        style={{
                            left: petal.x,
                            top: petal.y,
                            width: petal.width,
                            height: "auto",
                            opacity: 1,
                            position: 'fixed', // 스크롤 무관하게 화면 기준 고정 (getBoundingClientRect 기준이므로)
                            animation: 'none', // 착륙 후에는 회전 멈춤
                            // 정면이 아닌, 자연스럽게 비스듬히 놓인 3D 형태 유지
                            transform: `rotateZ(${petal.rotationZ}deg) rotateY(${petal.rotationY}deg) rotateX(${petal.rotationX}deg)`,
                        }}
                    />
                ))}
            </div>

            <div className="w-full max-w-6xl flex flex-col items-center animate-fade-in z-10">

                {/* 1. Header Section */}
                <h1
                    ref={titleRef}
                    className="text-5xl md:text-6xl font-bold tracking-tight mb-24 text-center break-keep"
                    style={{ margin: "0px 0px 30px 0px" }}
                >
                    진로·취업 컨설팅 일정표
                </h1>

                <div className="flex flex-col md:flex-row gap-8 justify-center items-center mb-24 w-full text-center" style={{ margin: "40px 0px 40px 0px", padding: "10px" }}>
                    <button
                        ref={adminBtnRef}
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
                        ref={consultantBtnRef}
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
