export default function LoadingSpinner({ message = '로딩 중...' }) {
    return (
        <div className="loading-container">
            <div className="spinner"></div>
            <p>{message}</p>
        </div>
    );
}
