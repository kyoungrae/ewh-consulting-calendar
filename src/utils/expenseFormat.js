export function formatCurrency(amount) {
    return new Intl.NumberFormat('ko-KR').format(amount || 0);
}

export function amountToKorean(amount) {
    const n = Math.floor(Math.abs(Number(amount) || 0));
    if (n === 0) return '영원';
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const small = ['', '십', '백', '천'];
    const big = ['', '만', '억', '조'];
    let result = '';
    let remaining = n;
    let bigIndex = 0;
    while (remaining > 0) {
        const part = remaining % 10000;
        if (part) {
            let partText = '';
            const str = String(part).padStart(4, '0');
            for (let i = 0; i < 4; i += 1) {
                const d = Number(str[i]);
                if (!d) continue;
                const unit = small[3 - i];
                partText += (d === 1 && unit ? '' : digits[d]) + unit;
            }
            result = partText + big[bigIndex] + result;
        }
        remaining = Math.floor(remaining / 10000);
        bigIndex += 1;
    }
    return `${result}원정`;
}
