import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBWCf1imCpWyiZzTa-VBKk71SQ7KVI3mCI",
    authDomain: "ewha-consulting.firebaseapp.com",
    projectId: "ewha-consulting",
    storageBucket: "ewha-consulting.firebasestorage.app",
    messagingSenderId: "37517857545",
    appId: "1:37517857545:web:4b11c9f9fddc8067bb39d8",
    measurementId: "G-0XC7524NFR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const seedCodes = [
    { code: 'C01', name: '공기업', description: '공기업 취업 컨설팅' },
    { code: 'C02', name: '서류면접', description: '서류 및 면접 집중 컨설팅' },
    { code: 'C03', name: '콘텐츠엔터', description: '콘텐츠 및 엔터테인먼트 산업 컨설팅' },
    { code: 'C04', name: '진로취업', description: '진반적인 진로 및 취업 상담' },
    { code: 'C05', name: '외국계', description: '외국계 기업 취업 컨설팅' },
    { code: 'C06', name: '이공계', description: '이공계 직무 및 전공 맞춤 컨설팅' },
    { code: 'C07', name: '임원면접', description: '최종 임원 면접 대비 컨설팅' },
    { code: 'C08', name: '진로개발', description: '재학생 대상 진로 로드맵 설계' }
];

async function seed() {
    console.log('Starting to seed common codes...');
    const codesRef = collection(db, 'common_codes');

    for (const item of seedCodes) {
        const q = query(codesRef, where('code', '==', item.code));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            await addDoc(codesRef, {
                ...item,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            console.log(`✅ Included: ${item.name} (${item.code})`);
        } else {
            console.log(`ℹ️ Already exists: ${item.name} (${item.code})`);
        }
    }
    console.log('Finished seeding.');
}

seed().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Error seeding codes:', err);
    process.exit(1);
});
